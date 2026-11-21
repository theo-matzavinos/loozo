import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { fixture } from "./observation.js";

// Meter (section 37, ME). ME1 is the package, type and documentation gates.

type Attributes = Record<string, string | null>;

const names = [
  "role",
  "aria-valuemin",
  "aria-valuemax",
  "aria-valuenow",
  "aria-valuetext",
  "aria-labelledby",
  "aria-label",
];

/**
 * Every attribute Meter binds, plus the custom property (null when it isn't set) and the names of
 * any `data-*` attribute other than the fixture's `data-testid`, which Origami must not add.
 */
async function attributes(locator: Locator): Promise<Attributes> {
  return locator.evaluate((element, names) => {
    const result: Record<string, string | null> = {};

    for (const name of names) {
      result[name] = element.getAttribute(name);
    }

    const percent = (element as HTMLElement).style.getPropertyValue("--og-meter-percent");

    result["percent"] = percent || null;

    const data: string[] = [];

    for (const name of element.getAttributeNames()) {
      if (name.startsWith("data-") && name !== "data-testid") {
        data.push(name);
      }
    }

    result["data"] = data.join(" ") || null;

    return result;
  }, names);
}

function out(page: Page, testId: string): Locator {
  return page.getByTestId(testId);
}

/** The State a descendant probe reads through DI: value, percent and valueText. */
async function probe(locator: Locator): Promise<string[]> {
  return locator.evaluate((element) => [
    element.getAttribute("data-value-state") ?? "",
    element.getAttribute("data-percent-state") ?? "",
    element.getAttribute("data-value-text-state") ?? "",
  ]);
}

function ownProbe(root: Locator): Locator {
  return root.locator(":scope > [data-probe]");
}

/** A meter's attributes; `extra` adds or overrides names. */
function meter(
  min: number,
  max: number,
  value: number,
  percent: number,
  text: string,
  extra: Attributes = {},
): Attributes {
  return {
    role: "meter",
    "aria-valuemin": String(min),
    "aria-valuemax": String(max),
    "aria-valuenow": String(value),
    "aria-valuetext": text,
    "aria-labelledby": null,
    "aria-label": null,
    percent: `${percent}%`,
    data: null,
    ...extra,
  };
}

/** A 0–100 meter at `value`, with the default `el-GR` text. */
function gauge(value: number, extra: Attributes = {}): Attributes {
  return meter(0, 100, value, value, `${value}%`, extra);
}

const arrivalsName = { "aria-labelledby": "arrivals-title" };

test("ME2 server HTML carries the meter's bounds, clamped value, value text and custom property, names the gauge by its heading, and eager and incremental hydration keep the nodes and the attributes", async ({
  page,
}, info) => {
  const ids = ["gauge", "direct-attributes", "direct-junk", "composer", "text"];
  const server: Record<string, Attributes> = {};
  const serverEmpty: Record<string, number> = {};

  await fixture(page, "meter", info, async () => {
    for (const id of ids) {
      server[id] = await attributes(out(page, id));
    }

    serverEmpty["late"] = await out(page, "late").count();
    serverEmpty["late-empty"] = await out(page, "late-empty").count();
  });

  expect(server["gauge"]).toEqual(gauge(75, arrivalsName));
  expect(server["direct-attributes"]).toEqual(
    meter(10, 20, 15, 50, "50%", { "aria-label": "Attributes" }),
  );
  expect(server["direct-junk"]).toEqual(gauge(0, { "aria-label": "Junk" }));
  expect(server["composer"]).toEqual(gauge(60, { "aria-labelledby": "composer-title" }));
  expect(server["text"]).toEqual(gauge(75, { "aria-label": "Text" }));
  // No data yet: the consumer renders its placeholder instead of a meter.
  expect(serverEmpty).toEqual({ late: 0, "late-empty": 1 });

  // `fixture` already proved the saved nodes were kept; the attributes are unchanged too.
  for (const id of ids) {
    expect(await attributes(out(page, id)), id).toEqual(server[id]);
  }

  await expect(out(page, "late")).toHaveCount(0);
  await expect(out(page, "late-empty")).toHaveText("–");

  // One named meter: its drawing and visible text are aria-hidden, so it exposes no child.
  expect(await out(page, "gauge-region").ariaSnapshot()).toBe('- meter "Αφίξεις"');
  await expect(out(page, "gauge")).toHaveAccessibleName("Αφίξεις");
  await expect(out(page, "gauge")).toHaveRole("meter");
  await expect(out(page, "composer")).toHaveAccessibleName("Θέσεις");
  expect(await probe(out(page, "gauge").locator("[data-probe]"))).toEqual(["75", "75", "75%"]);
});

test("ME3 the arrivals gauge follows its periods through the clamp and the non-finite rule without writing back the raw value, and missing data is the consumer's placeholder until data arrives", async ({
  page,
}, info) => {
  await fixture(page, "meter", info);

  const meterLocator = out(page, "gauge");
  const raw = out(page, "gauge-raw");

  async function period(label: string, expected: number, rawText: string): Promise<void> {
    await out(page, `gauge-${label}`).click();
    await expect(raw, label).toHaveText(rawText);
    await expect.poll(() => attributes(meterLocator), label).toEqual(gauge(expected, arrivalsName));
    expect(await probe(meterLocator.locator("[data-probe]")), label).toEqual([
      String(expected),
      String(expected),
      `${expected}%`,
    ]);
    await expect(meterLocator.locator(".ring-value"), label).toHaveText(`${expected}%`);
  }

  await period("25", 25, "25");
  await period("130", 100, "130");
  await period("-5", 0, "-5");
  await period("NaN", 0, "NaN");
  await period("75", 75, "75");

  await out(page, "gauge-no-data").click();
  await expect(meterLocator).toHaveCount(0);
  await expect(out(page, "gauge-empty")).toHaveText("–");
  await expect(out(page, "gauge-counts").locator("span")).toHaveText([
    "Σύνολο -",
    "Επικυρώθηκαν -",
    "Αναμένονται -",
  ]);

  await out(page, "gauge-load-later").click();
  await expect.poll(() => attributes(meterLocator)).toEqual(gauge(75, arrivalsName));
  await expect(out(page, "gauge-empty")).toHaveCount(0);
  await expect(meterLocator).toHaveAccessibleName("Αφίξεις");

  await out(page, "late-load-later").click();
  await expect
    .poll(() => attributes(out(page, "late")))
    .toEqual(gauge(75, { "aria-labelledby": "late-title" }));
  await expect(out(page, "late-empty")).toHaveCount(0);
});

test("ME4 the root renders the policy table: the clamp, a value that isn't finite as min, a bound that isn't finite as its default, and a max below min raised to it, always in bounds", async ({
  page,
}, info) => {
  await fixture(page, "meter", info);

  const direct = out(page, "direct");
  const range = out(page, "direct-range");
  const label = { "aria-label": "Direct" };
  const rangeLabel = { "aria-label": "Range" };

  async function write(
    root: Locator,
    control: string,
    expected: Attributes,
    state: string[],
  ): Promise<void> {
    await out(page, control).click();
    await expect.poll(() => attributes(root), control).toEqual(expected);

    const now = Number(expected["aria-valuenow"]);

    expect(Number(expected["aria-valuemin"]), control).toBeLessThanOrEqual(now);
    expect(now, control).toBeLessThanOrEqual(Number(expected["aria-valuemax"]));
    expect(await probe(ownProbe(root)), control).toEqual(state);
  }

  expect(await attributes(direct)).toEqual(gauge(75, label));
  await write(direct, "direct-value-130", gauge(100, label), ["100", "100", "100%"]);
  await write(direct, "direct-value--5", gauge(0, label), ["0", "0", "0%"]);

  for (const value of ["NaN", "Infinity", "-Infinity", "empty", "abc"]) {
    await write(direct, `direct-value-${value}`, gauge(0, label), ["0", "0", "0%"]);
    await write(direct, "direct-value-75", gauge(75, label), ["75", "75", "75%"]);
  }

  // The template reference reads the same State.
  await expect(out(page, "direct-state")).toHaveText("75 75 75%");

  const rows: [string, Attributes, string[]][] = [
    ["15-10-20", meter(10, 20, 15, 50, "50%", rangeLabel), ["15", "50", "50%"]],
    ["5-10-20", meter(10, 20, 10, 0, "0%", rangeLabel), ["10", "0", "0%"]],
    ["NaN-10-20", meter(10, 20, 10, 0, "0%", rangeLabel), ["10", "0", "0%"]],
    ["25-10-20", meter(10, 20, 20, 100, "100%", rangeLabel), ["20", "100", "100%"]],
    ["5-NaN-20", meter(0, 20, 5, 25, "25%", rangeLabel), ["5", "25", "25%"]],
    ["5-Infinity-20", meter(0, 20, 5, 25, "25%", rangeLabel), ["5", "25", "25%"]],
    ["5--Infinity-20", meter(0, 20, 5, 25, "25%", rangeLabel), ["5", "25", "25%"]],
    ["5-0-NaN", meter(0, 100, 5, 5, "5%", rangeLabel), ["5", "5", "5%"]],
    ["5-0-Infinity", meter(0, 100, 5, 5, "5%", rangeLabel), ["5", "5", "5%"]],
    ["5-0--Infinity", meter(0, 100, 5, 5, "5%", rangeLabel), ["5", "5", "5%"]],
    ["15-20-10", meter(20, 20, 20, 0, "0%", rangeLabel), ["20", "0", "0%"]],
    ["10-10-10", meter(10, 10, 10, 0, "0%", rangeLabel), ["10", "0", "0%"]],
    ["50-150-NaN", meter(150, 150, 150, 0, "0%", rangeLabel), ["150", "0", "0%"]],
  ];

  expect(await attributes(range)).toEqual(rows[0]![1]);

  for (const [control, expected, state] of rows) {
    await write(range, `direct-range-${control}`, expected, state);
  }

  // Static attributes coerce like numberAttribute; one that isn't a number renders as min.
  expect(await attributes(out(page, "direct-attributes"))).toEqual(
    meter(10, 20, 15, 50, "50%", { "aria-label": "Attributes" }),
  );
  expect(await attributes(out(page, "direct-junk"))).toEqual(gauge(0, { "aria-label": "Junk" }));
});

test("ME5 the default value text is Intl's percent of the value's position under the root's LOCALE_ID, a consumer string is bound as given, also empty, and server and browser agree", async ({
  page,
}, info) => {
  const server: Record<string, string | null> = {};

  await fixture(page, "meter", info, async () => {
    server["text"] = await out(page, "text").getAttribute("aria-valuetext");
    server["french"] = await out(page, "french").getAttribute("aria-valuetext");
    server["range"] = await out(page, "direct-attributes").getAttribute("aria-valuetext");
  });

  const text = out(page, "text");
  // The server is this Node: the default is its Intl output, and the browser's its own.
  const serverFrench = new Intl.NumberFormat("fr-FR", { style: "percent" }).format(0.5);
  const browserFrench = await page.evaluate(() =>
    new Intl.NumberFormat("fr-FR", { style: "percent" }).format(0.5),
  );

  expect(server["text"]).toBe("75%");
  // The position of 15 in 10–20 is 50%, not 15%.
  expect(server["range"]).toBe("50%");
  // A space-like separator before the sign; which one is the ICU's.
  expect(serverFrench).toMatch(/^50[   ]%$/);
  expect(server["french"]).toBe(serverFrench);
  await expect(text).toHaveAttribute("aria-valuetext", "75%");
  await expect(out(page, "direct-attributes")).toHaveAttribute("aria-valuetext", "50%");
  await expect(out(page, "french")).toHaveAttribute("aria-valuetext", browserFrench);

  await out(page, "text-custom").click();
  await expect(text).toHaveAttribute("aria-valuetext", "3 από 4");
  await out(page, "text-empty").click();
  await expect(text).toHaveAttribute("aria-valuetext", "");
  await out(page, "text-default").click();
  await expect(text).toHaveAttribute("aria-valuetext", "75%");
  expect(await attributes(text)).toEqual(gauge(75, { "aria-label": "Text" }));
});

test("ME6 replacement Options drive the root from server HTML on, never its decoy value, a timer write refreshes it, a composer's aria-labelledby survives and follows a rename, and nested roots report their own State", async ({
  page,
}, info) => {
  const server: Record<string, Attributes> = {};

  await fixture(page, "meter", info, async () => {
    server["factory"] = await attributes(out(page, "factory"));
    server["existing"] = await attributes(out(page, "existing"));
  });

  const factory = out(page, "factory");
  const existing = out(page, "existing");

  expect(server["factory"]).toEqual(meter(10, 70, 40, 50, "50%", { "aria-label": "Factory" }));
  expect(server["existing"]).toEqual(meter(0, 4, 3, 75, "75%", { "aria-label": "Existing" }));
  expect(await attributes(factory)).toEqual(server["factory"]);
  expect(await attributes(existing)).toEqual(server["existing"]);
  expect(await probe(ownProbe(factory))).toEqual(["40", "50", "50%"]);
  expect(await probe(ownProbe(existing))).toEqual(["3", "75", "75%"]);

  // No template reads the factory's signals: the root refreshes from its own host bindings.
  await out(page, "factory-timer").click();
  await expect(factory).toHaveAttribute("aria-valuenow", "55");
  expect(await attributes(factory)).toEqual(
    meter(10, 70, 55, 75, "75%", { "aria-label": "Factory" }),
  );
  expect(await probe(ownProbe(factory))).toEqual(["55", "75", "75%"]);

  await out(page, "existing-write").click();
  await expect(existing).toHaveAttribute("aria-valuenow", "1");
  expect(await attributes(existing)).toEqual(
    meter(0, 4, 1, 25, "25%", { "aria-label": "Existing" }),
  );

  expect(await probe(out(page, "outer-probe"))).toEqual(["20", "20", "20%"]);
  expect(await probe(out(page, "inner-probe"))).toEqual(["80", "80", "80%"]);
  expect(await attributes(out(page, "outer"))).toEqual(gauge(20, { "aria-label": "Outer" }));
  expect(await attributes(out(page, "inner"))).toEqual(gauge(80, { "aria-label": "Inner" }));

  // The composer's host binding is its own: Origami's bindings keep it and it follows its source.
  const composer = out(page, "composer");

  expect(await probe(composer.locator("[data-probe]"))).toEqual(["60", "60", "60%"]);
  await expect(composer).toHaveAttribute("aria-labelledby", "composer-title");
  await out(page, "composer-rename").click();
  await expect(composer).toHaveAttribute("aria-labelledby", "renamed-title");
  await expect(out(page, "composer-title")).toHaveAttribute("id", "renamed-title");
  await expect(composer).toHaveAccessibleName("Θέσεις");
});

test("ME7 a gauge in a dehydrated block keeps its server value until the block hydrates, then renders the current one on the same node; a remounted block renders the current value", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const block = out(page, "block-gauge");
  const blockName = { "aria-labelledby": "block-title" };
  let server: Attributes | null = null;

  await fixture(page, "meter-block", info, async () => {
    if (!incremental) {
      // Without incremental hydration the server renders the block's placeholder.
      await expect(block).toHaveCount(0);

      return;
    }

    server = await attributes(block);
  });

  if (incremental) {
    expect(server).toEqual(gauge(75, blockName));
    await block.evaluate((element) => {
      (window as unknown as { meterServerGauge: Element }).meterServerGauge = element;
    });

    // The route component is hydrated; the block isn't, so it keeps the server's attributes.
    await out(page, "block-25").click();
    await expect(out(page, "block-value")).toHaveText("25");
    expect(await attributes(block)).toEqual(gauge(75, blockName));

    // An interaction inside the block hydrates it: the same node renders the current value.
    await out(page, "block-title").click();
    await expect.poll(() => attributes(block)).toEqual(gauge(25, blockName));
    expect(
      await block.evaluate(
        (element) =>
          element === (window as unknown as { meterServerGauge: Element }).meterServerGauge,
      ),
    ).toBe(true);
  } else {
    // The block renders in the browser after hydration, from the current value.
    await expect.poll(() => attributes(block)).toEqual(gauge(75, blockName));
    await out(page, "block-25").click();
    await expect.poll(() => attributes(block)).toEqual(gauge(25, blockName));
  }

  await out(page, "block-unmount").click();
  await expect(block).toHaveCount(0);
  await out(page, "block-mount").click();
  await expect.poll(() => attributes(block)).toEqual(gauge(25, blockName));
  await expect(block).toHaveAccessibleName("Αφίξεις");
});
