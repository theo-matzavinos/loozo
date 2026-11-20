import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

type Attributes = Record<string, string | null>;

const names = [
  "role",
  "aria-valuemin",
  "aria-valuemax",
  "aria-valuenow",
  "aria-valuetext",
  "aria-labelledby",
  "aria-label",
  "data-complete",
  "data-indeterminate",
];

/** Every attribute Progress binds, plus the custom property (null when it isn't set). */
async function attributes(locator: Locator): Promise<Attributes> {
  return locator.evaluate((element, names) => {
    const result: Record<string, string | null> = {};

    for (const name of names) {
      result[name] = element.getAttribute(name);
    }

    const percent = (element as HTMLElement).style.getPropertyValue("--og-progress-percent");

    result["percent"] = percent || null;

    return result;
  }, names);
}

function out(page: Page, testId: string): Locator {
  return page.getByTestId(testId);
}

/** The State a descendant probe reads through DI: value, percent, complete and valueText. */
async function probe(locator: Locator): Promise<string[]> {
  return locator.evaluate((element) => [
    element.getAttribute("data-value-state") ?? "",
    element.getAttribute("data-percent-state") ?? "",
    element.getAttribute("data-complete-state") ?? "",
    element.getAttribute("data-value-text-state") ?? "",
  ]);
}

function ownProbe(root: Locator): Locator {
  return root.locator(":scope > [data-probe]");
}

/** The attributes of a determinate bar; `extra` adds or overrides names. */
function determinate(value: number, max: number, text: string, extra: Attributes = {}): Attributes {
  let complete: string | null = null;

  if (value === max) {
    complete = "";
  }

  return {
    role: "progressbar",
    "aria-valuemin": "0",
    "aria-valuemax": String(max),
    "aria-valuenow": String(value),
    "aria-valuetext": text,
    "aria-labelledby": null,
    "aria-label": null,
    "data-complete": complete,
    "data-indeterminate": null,
    percent: `${(value / max) * 100}%`,
    ...extra,
  };
}

/** The attributes of an indeterminate bar; `max` null means no valid range. */
function indeterminate(max: number | null, extra: Attributes = {}): Attributes {
  let maxAttribute: string | null = null;

  if (max !== null) {
    maxAttribute = String(max);
  }

  return {
    role: "progressbar",
    "aria-valuemin": "0",
    "aria-valuemax": maxAttribute,
    "aria-valuenow": null,
    "aria-valuetext": null,
    "aria-labelledby": null,
    "aria-label": null,
    "data-complete": null,
    "data-indeterminate": "",
    percent: null,
    ...extra,
  };
}

const stepsName = { "aria-labelledby": "steps-title" };

test("PR2 server HTML carries every Progress attribute and the custom property, and eager and incremental hydration keep the nodes, the attributes and the names", async ({
  page,
}, info) => {
  const ids = ["steps", "steps-complete", "direct-attributes", "loader", "text"];
  const server: Record<string, Attributes> = {};

  await fixture(page, "progress", info, async () => {
    for (const id of ids) {
      server[id] = await attributes(out(page, id));
    }
  });

  expect(server["steps"]).toEqual(determinate(2, 4, "50%", stepsName));
  expect(server["steps-complete"]).toEqual(determinate(4, 4, "100%", stepsName));
  expect(server["steps-complete"]?.["data-complete"]).toBe("");
  expect(server["direct-attributes"]).toEqual(
    determinate(2, 4, "50%", { "aria-label": "Attributes" }),
  );
  expect(server["loader"]).toEqual(indeterminate(100, { "aria-label": "Loading reservations" }));
  // The default value text is Intl's percent under the fixture's el-GR LOCALE_ID.
  expect(server["text"]).toEqual(determinate(2, 3, "67%", { "aria-label": "Text" }));

  // `fixture` already proved the saved nodes were kept; the attributes are unchanged too.
  for (const id of ids) {
    expect(await attributes(out(page, id)), id).toEqual(server[id]);
  }

  await expect(out(page, "steps")).toHaveAccessibleName("Αλλαγή Προγραμματισμού");
  await expect(out(page, "steps")).toHaveRole("progressbar");
  await expect(out(page, "loader")).toHaveAccessibleName("Loading reservations");
  expect(await probe(out(page, "steps").locator("[data-probe]"))).toEqual([
    "2",
    "50",
    "false",
    "50%",
  ]);
});

test("PR3 value and max updates move the value, the percent, the text and the markers together, settle in bounds, and the composer's aria-labelledby follows a renamed title", async ({
  page,
}, info) => {
  await fixture(page, "progress", info);

  const steps = out(page, "steps");
  const warning = out(page, "warning");

  // Records each marker write on the two bars; a turn may only change the markers its start and
  // end states differ in. Angular writes aria-valuemax and aria-valuenow one after the other
  // within a render, so per-record bounds aren't asserted, only the settled state.
  await page.evaluate(() => {
    const records: { id: string; name: string }[] = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target as Element;

        records.push({
          id: target.getAttribute("data-testid") ?? "",
          name: mutation.attributeName ?? "",
        });
      }
    });

    for (const id of ["steps", "warning"]) {
      observer.observe(document.querySelector(`[data-testid="${id}"]`)!, {
        attributes: true,
        attributeFilter: ["data-complete", "data-indeterminate"],
      });
    }

    (window as unknown as { progressMarkers: typeof records }).progressMarkers = records;
  });

  async function markers(id: string): Promise<string[]> {
    return page.evaluate((id) => {
      const records = (window as unknown as { progressMarkers: { id: string; name: string }[] })
        .progressMarkers;
      const names: string[] = [];

      for (const record of records) {
        if (record.id === id) {
          names.push(record.name);
        }
      }

      records.length = 0;

      return names;
    }, id);
  }

  async function turn(
    root: Locator,
    control: string,
    expected: Attributes,
    state: string[],
  ): Promise<void> {
    const id = (await root.getAttribute("data-testid"))!;
    const before = await attributes(root);

    await markers(id);
    await out(page, control).click();
    await expect.poll(() => attributes(root), control).toEqual(expected);

    const changed: string[] = [];

    for (const name of ["data-complete", "data-indeterminate"]) {
      if (before[name] !== expected[name]) {
        changed.push(name);
      }
    }

    expect((await markers(id)).sort(), control).toEqual(changed.sort());

    // Settled in bounds.
    const now = expected["aria-valuenow"];
    const max = expected["aria-valuemax"];

    if (now !== null && now !== undefined) {
      expect(Number(now)).toBeGreaterThanOrEqual(0);
      expect(Number(now)).toBeLessThanOrEqual(Number(max));
    }

    expect(await probe(root.locator("[data-probe]")), control).toEqual(state);
  }

  await turn(steps, "steps-1-3", determinate(1, 3, "33%", stepsName), [
    "1",
    String((1 / 3) * 100),
    "false",
    "33%",
  ]);
  await turn(steps, "steps-2-4", determinate(2, 4, "50%", stepsName), ["2", "50", "false", "50%"]);
  await turn(steps, "steps-3-4", determinate(3, 4, "75%", stepsName), ["3", "75", "false", "75%"]);
  // The value stays 3 while the max shrinks to it: complete.
  await turn(steps, "steps-max-3", determinate(3, 3, "100%", stepsName), [
    "3",
    "100",
    "true",
    "100%",
  ]);
  await turn(steps, "steps-null", indeterminate(3, stepsName), ["null", "null", "false", "null"]);
  await turn(steps, "steps-4-4", determinate(4, 4, "100%", stepsName), [
    "4",
    "100",
    "true",
    "100%",
  ]);

  // One signal moves both inputs, in one render: no intermediate marker.
  const warningName = { "aria-labelledby": "steps-title" };

  for (let index = 0; index < 4; index++) {
    await turn(warning, "warning-toggle", determinate(3, 4, "75%", warningName), [
      "3",
      "75",
      "false",
      "75%",
    ]);
    await turn(warning, "warning-toggle", determinate(2, 3, "67%", warningName), [
      "2",
      String((2 / 3) * 100),
      "false",
      "67%",
    ]);
  }

  await out(page, "steps-rename").click();
  await expect(steps).toHaveAttribute("aria-labelledby", "renamed-title");
  await expect(out(page, "steps-title")).toHaveAttribute("id", "renamed-title");
  await expect(steps).toHaveAccessibleName("Αλλαγή Προγραμματισμού");
});

test("PR4 a value renders clamped to [0, max], a value that isn't a finite number is indeterminate, and a max that isn't finite and positive drops the range", async ({
  page,
}, info) => {
  await fixture(page, "progress", info);

  const direct = out(page, "direct");
  const label = { "aria-label": "Direct" };
  const directProbe = ownProbe(direct);

  async function write(control: string, expected: Attributes, state: string[]): Promise<void> {
    await out(page, control).click();
    await expect.poll(() => attributes(direct), control).toEqual(expected);
    expect(await probe(directProbe), control).toEqual(state);
    // The template reference reads the same State.
    await expect(out(page, "direct-state"), control).toHaveText(state.join(" "));
  }

  expect(await attributes(direct)).toEqual(determinate(2, 4, "50%", label));
  await write("direct-value--1", determinate(0, 4, "0%", label), ["0", "0", "false", "0%"]);
  await write("direct-value-5", determinate(4, 4, "100%", label), ["4", "100", "true", "100%"]);
  await write("direct-value-4", determinate(4, 4, "100%", label), ["4", "100", "true", "100%"]);
  await write("direct-value-0", determinate(0, 4, "0%", label), ["0", "0", "false", "0%"]);

  for (const value of ["NaN", "Infinity", "-Infinity", "empty", "abc", "null", "undefined"]) {
    await write(`direct-value-${value}`, indeterminate(4, label), [
      "null",
      "null",
      "false",
      "null",
    ]);
  }

  await write("direct-value-2", determinate(2, 4, "50%", label), ["2", "50", "false", "50%"]);

  for (const max of ["0", "-3", "NaN", "Infinity"]) {
    await write(`direct-max-${max}`, indeterminate(null, label), ["null", "null", "false", "null"]);
  }

  await write("direct-max-4", determinate(2, 4, "50%", label), ["2", "50", "false", "50%"]);

  // Static attributes coerce like numberAttribute; one that isn't a number is indeterminate.
  expect(await attributes(out(page, "direct-attributes"))).toEqual(
    determinate(2, 4, "50%", { "aria-label": "Attributes" }),
  );
  expect(await attributes(out(page, "direct-junk"))).toEqual(
    indeterminate(4, { "aria-label": "Junk" }),
  );
});

test("PR5 the default value text is Intl's percent under the root's LOCALE_ID, a consumer string is bound as given, also empty and while indeterminate, and server and browser agree", async ({
  page,
}, info) => {
  const server: Record<string, string | null> = {};

  await fixture(page, "progress", info, async () => {
    server["text"] = await out(page, "text").getAttribute("aria-valuetext");
    server["french"] = await out(page, "french").getAttribute("aria-valuetext");
  });

  const text = out(page, "text");
  // The server is this Node: the default is its Intl output, and the browser's its own.
  const serverFrench = new Intl.NumberFormat("fr-FR", { style: "percent" }).format(2 / 3);
  const browserFrench = await page.evaluate(() =>
    new Intl.NumberFormat("fr-FR", { style: "percent" }).format(2 / 3),
  );

  expect(server["text"]).toBe("67%");
  // A space-like separator before the sign; which one is the ICU's (U+00A0 in Node 24.21).
  expect(serverFrench).toMatch(/^67[\u00a0\u202f ]%$/);
  expect(server["french"]).toBe(serverFrench);
  await expect(text).toHaveAttribute("aria-valuetext", "67%");
  await expect(out(page, "french")).toHaveAttribute("aria-valuetext", browserFrench);

  await out(page, "text-steps").click();
  await expect(text).toHaveAttribute("aria-valuetext", "Βήμα 2 από 4");
  await out(page, "text-empty").click();
  await expect(text).toHaveAttribute("aria-valuetext", "");
  await out(page, "text-default").click();
  await expect(text).toHaveAttribute("aria-valuetext", "67%");
  await out(page, "text-value-null").click();
  await expect(text).toHaveAttribute("data-indeterminate", "");
  await expect(text).not.toHaveAttribute("aria-valuetext", /.*/);
  await out(page, "text-loading").click();
  await expect(text).toHaveAttribute("aria-valuetext", "Φόρτωση…");
  expect(await attributes(text)).toEqual(
    indeterminate(3, { "aria-label": "Text", "aria-valuetext": "Φόρτωση…" }),
  );
  await out(page, "text-value-2").click();
  await expect(text).toHaveAttribute("aria-valuetext", "Φόρτωση…");
  await expect(text).toHaveAttribute("aria-valuenow", "2");
});

test("PR6 replacement Options drive the root from server HTML on, never its decoy inputs, a timer write refreshes it, nested roots report their own State, and a composer's aria-labelledby survives", async ({
  page,
}, info) => {
  const server: Record<string, Attributes> = {};

  await fixture(page, "progress", info, async () => {
    server["factory"] = await attributes(out(page, "factory"));
    server["existing"] = await attributes(out(page, "existing"));
  });

  const factory = out(page, "factory");
  const existing = out(page, "existing");

  expect(server["factory"]).toEqual(determinate(30, 60, "50%", { "aria-label": "Factory" }));
  expect(server["existing"]).toEqual(determinate(3, 10, "30%", { "aria-label": "Existing" }));
  expect(await attributes(factory)).toEqual(server["factory"]);
  expect(await attributes(existing)).toEqual(server["existing"]);
  expect(await probe(ownProbe(factory))).toEqual(["30", "50", "false", "50%"]);
  expect(await probe(ownProbe(existing))).toEqual(["3", "30", "false", "30%"]);

  // No template reads the factory's signals: the root refreshes from its own host bindings.
  await out(page, "factory-timer").click();
  await expect(factory).toHaveAttribute("aria-valuenow", "45");
  expect(await attributes(factory)).toEqual(
    determinate(45, 60, "75%", { "aria-label": "Factory" }),
  );
  await out(page, "factory-text").click();
  await expect(factory).toHaveAttribute("aria-valuetext", "Μισό");
  expect(await probe(ownProbe(factory))).toEqual(["45", "75", "false", "Μισό"]);

  await out(page, "existing-write").click();
  await expect(existing).toHaveAttribute("aria-valuenow", "7");
  expect(await attributes(existing)).toEqual(
    determinate(7, 10, "70%", { "aria-label": "Existing" }),
  );

  expect(await probe(out(page, "outer-probe"))).toEqual(["1", "25", "false", "25%"]);
  expect(await probe(out(page, "inner-probe"))).toEqual(["3", "75", "false", "75%"]);
  expect(await attributes(out(page, "outer"))).toEqual(
    determinate(1, 4, "25%", { "aria-label": "Outer" }),
  );
  expect(await attributes(out(page, "inner"))).toEqual(
    determinate(3, 4, "75%", { "aria-label": "Inner" }),
  );

  // The composer's host binding is its own: Origami's bindings keep it and it follows its source.
  await expect(out(page, "steps")).toHaveAttribute("aria-labelledby", "steps-title");
  await out(page, "steps-rename").click();
  await expect(out(page, "steps")).toHaveAttribute("aria-labelledby", "renamed-title");
  await expect(out(page, "steps")).toHaveAccessibleName("Αλλαγή Προγραμματισμού");
});

test("PR7 a step bar in a dehydrated block keeps its server value until the block hydrates, then renders the current one on the same node; a remounted block renders the current value", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const bar = out(page, "block-steps");
  const blockName = { "aria-labelledby": "block-title" };
  let server: Attributes | null = null;

  await fixture(page, "progress-block", info, async () => {
    if (!incremental) {
      // Without incremental hydration the server renders the block's placeholder.
      await expect(bar).toHaveCount(0);

      return;
    }

    server = await attributes(bar);
  });

  if (incremental) {
    expect(server).toEqual(determinate(2, 4, "50%", blockName));
    await bar.evaluate((element) => {
      (window as unknown as { progressServerBar: Element }).progressServerBar = element;
    });

    // The route component is hydrated; the block isn't, so it keeps the server's attributes.
    await out(page, "block-3-4").click();
    await expect(out(page, "block-value")).toHaveText("3");
    expect(await attributes(bar)).toEqual(determinate(2, 4, "50%", blockName));

    // An interaction inside the block hydrates it: the same node renders the current value.
    await out(page, "block-title").click();
    await expect.poll(() => attributes(bar)).toEqual(determinate(3, 4, "75%", blockName));
    expect(
      await bar.evaluate(
        (element) =>
          element === (window as unknown as { progressServerBar: Element }).progressServerBar,
      ),
    ).toBe(true);
  } else {
    // The block renders in the browser after hydration, from the current value.
    await expect.poll(() => attributes(bar)).toEqual(determinate(2, 4, "50%", blockName));
    await out(page, "block-3-4").click();
    await expect.poll(() => attributes(bar)).toEqual(determinate(3, 4, "75%", blockName));
  }

  await out(page, "block-unmount").click();
  await expect(bar).toHaveCount(0);
  await out(page, "block-mount").click();
  await expect.poll(() => attributes(bar)).toEqual(determinate(3, 4, "75%", blockName));
  await expect(bar).toHaveAccessibleName("Βήματα");
});
