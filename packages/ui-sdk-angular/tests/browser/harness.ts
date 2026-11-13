import { type Page, type TestInfo, expect } from "@playwright/test";
import { type Evidence, type Mutation, observeSlots } from "./observer";

export type Mode = "eager" | "incremental";

export function modeOf(testInfo: TestInfo): Mode {
  return testInfo.project.metadata["mode"] as Mode;
}

/** Every console message and page error, for the zero-warnings rule. */
export type Messages = { console: { type: string; text: string }[]; pageErrors: string[] };

export function captureMessages(page: Page): Messages {
  const messages: Messages = { console: [], pageErrors: [] };

  page.on("console", (message) =>
    messages.console.push({ type: message.type(), text: message.text() }),
  );
  page.on("pageerror", (error) => messages.pageErrors.push(String(error.stack ?? error)));

  return messages;
}

/** No console warning or error, page error or Angular hydration error (NG05xx). */
export function expectClean(messages: Messages): void {
  const noisy = [];

  for (const message of messages.console) {
    if (message.type === "warning" || message.type === "error" || /NG05\d{2}/.test(message.text)) {
      noisy.push(message);
    }
  }

  expect(noisy).toEqual([]);
  expect(messages.pageErrors).toEqual([]);
}

/**
 * Loads `path` with main.js held until the observer is installed on the server-rendered DOM, so
 * it sees every attribute change from the first line of application code. Lazy chunks can be
 * delayed afterwards, to stretch an incremental block's hydration as P1c did.
 */
export async function openObserved(page: Page, path: string) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = { delayChunks: false, delayed: 0 };

  await page.route("**/main.js", async (route) => {
    await held;
    await route.continue();
  });
  await page.route("**/chunk-*.js", async (route) => {
    if (state.delayChunks) {
      state.delayed += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    await route.continue();
  });
  await page.goto(path, { waitUntil: "commit" });
  await page.locator("[data-testid=app-ready]").waitFor({ state: "attached" });
  await page.evaluate(observeSlots);
  release();

  return state;
}

export async function evidence(page: Page): Promise<Evidence> {
  return page.evaluate(() => {
    window.__uiSdkFlush();

    return structuredClone(window.__uiSdkEvidence);
  });
}

/** Records in the falsifier's window: before an instance's first core event, off its server value. */
export function falsifiers(records: Evidence): Mutation[] {
  const counted = [];

  for (const mutation of records.mutations) {
    if (
      (mutation.phase === "pre" || mutation.phase === "init") &&
      mutation.changesServerValue &&
      !mutation.angularOwned
    ) {
      counted.push(mutation);
    }
  }

  return counted;
}

/** The instance id the server rendered on the root with this `data-testid`. */
export async function instanceId(page: Page, testId: string): Promise<string> {
  const id = await page.locator(`[data-testid=${testId}]`).getAttribute("data-ui-sdk-id");

  expect(id).toMatch(/^ui-sdk-/);

  return id!;
}

/** Attributes of the element matching `selector` in raw server HTML. */
export async function serverAttributes(
  page: Page,
  html: string,
  selector: string,
): Promise<Record<string, string>> {
  return page.evaluate(
    ({ html, selector }) => {
      const document = new DOMParser().parseFromString(html, "text/html");
      const element = document.querySelector(selector);

      if (!element) {
        throw new Error(`No ${selector} in the server HTML`);
      }

      const attributes: Record<string, string> = {};

      for (const attribute of element.attributes) {
        attributes[attribute.name] = attribute.value;
      }

      return attributes;
    },
    { html, selector },
  );
}
