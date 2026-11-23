// Compares the raw server HTML with core's own renderer for the same primitive, options, props and
// instance id (the page's `data-ui-sdk-id`): whether each part is present, and its attributes,
// both ways. Sound only where the server's state doesn't depend on Angular's render order, like an
// explicit value; the specs say where they use it.
import { type Page, expect } from "@playwright/test";
import type { Primitive } from "@ui-sdk/core";
import { attrs, present } from "@ui-sdk/core/renderer";

/** One part to build, in core's registration order, and where the server rendered it. */
export type OraclePart = {
  slot: string;
  props?: Record<string, unknown>;
  /** The element in the server HTML; a part core leaves out must match nothing. */
  selector: string;
  /** Attributes the fixture authored on the element, which core doesn't own. */
  authored?: string[];
};

/** Angular's own attributes, the fixture's markers, and the directives' selectors. */
function bookkeeping(name: string): boolean {
  return (
    name === "ngh" ||
    name === "ngb" ||
    name === "ngskiphydration" ||
    name === "jsaction" ||
    name.startsWith("ng-") ||
    name.startsWith("_ng") ||
    name.startsWith("data-probe") ||
    name === "data-testid" ||
    name === "data-ui-sdk-id" ||
    name === "class" ||
    /^ui[a-z]+$/.test(name)
  );
}

type ServerElement = { attributes: Record<string, string> } | null;

async function serverElements(
  page: Page,
  html: string,
  selectors: string[],
): Promise<ServerElement[]> {
  return page.evaluate(
    ({ html, selectors }) => {
      const document = new DOMParser().parseFromString(html, "text/html");
      const found = [];

      for (const selector of selectors) {
        const element = document.querySelector(selector);

        if (element === null) {
          found.push(null);
          continue;
        }

        const attributes: Record<string, string> = {};

        for (const attribute of element.attributes) {
          attributes[attribute.name] = attribute.value;
        }

        found.push({ attributes });
      }

      return found;
    },
    { html, selectors },
  );
}

export async function expectServerMatchesCore(
  page: Page,
  html: string,
  primitive: Primitive,
  options: Record<string, unknown>,
  parts: OraclePart[],
): Promise<void> {
  const instance = primitive(options as never) as ReturnType<Primitive>;
  const records = [];

  for (const part of parts) {
    records.push(instance.part(part.slot as never, (part.props ?? {}) as never));
  }

  const elements = await serverElements(
    page,
    html,
    parts.map((part) => part.selector),
  );

  try {
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]!;
      const record = records[index]!;
      const element = elements[index]!;
      const where = `${part.slot} at ${part.selector}`;

      if (!present(record)) {
        expect(element, `${where}: core leaves it out`).toBeNull();
        continue;
      }

      expect(element, `${where}: core renders it`).not.toBeNull();

      const expected: Record<string, string> = {};

      for (const [name, value] of Object.entries(attrs(record))) {
        if (name === "style" || value === undefined) {
          continue;
        }

        expected[name] = String(value);
      }

      const rendered: Record<string, string> = {};
      const authored = new Set(part.authored ?? []);

      for (const [name, value] of Object.entries(element!.attributes)) {
        if (bookkeeping(name) || authored.has(name)) {
          continue;
        }

        rendered[name] = value;
      }

      expect(rendered, where).toEqual(expected);
    }
  } finally {
    instance.destroy();
  }
}
