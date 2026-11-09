import { test, expect, type ErrorRecord } from "./contract-test.js";
import type { Locator, Page, TestInfo } from "playwright/test";
import { bootstrapHeld, fixture } from "./observation.js";

type Point = { x: number; y: number; box: { x: number; y: number; width: number; height: number } };

function root(page: Page, name: string): Locator {
  return page.getByTestId(name);
}

function thumb(page: Page, name: string): Locator {
  return page.getByTestId(`${name}-thumb`);
}

function track(page: Page, name: string): Locator {
  return page.getByTestId(`${name}-track`);
}

function value(page: Page, name: string): Locator {
  return page.getByTestId(`${name}-value`);
}

/** A point over a Track at a fraction of its width from its left edge, `dy` below its middle. */
async function point(page: Page, name: string, fraction: number, dy = 0): Promise<Point> {
  await track(page, name).scrollIntoViewIfNeeded();

  const box = await track(page, name).boundingBox();

  expect(box).not.toBeNull();

  return {
    x: box!.x + box!.width * fraction,
    y: box!.y + box!.height / 2 + dy,
    box: box!,
  };
}

async function press(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
}

async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

async function selection(page: Page): Promise<string> {
  return page.evaluate(() => getSelection()?.toString() ?? "");
}

/** Records whether the last keydown that reached the window had its default prevented. */
async function recordKeys(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record = window as unknown as { sliderKeyPrevented: boolean | null };

    record.sliderKeyPrevented = null;
    window.addEventListener("keydown", (event) => {
      record.sliderKeyPrevented = event.defaultPrevented;
    });
  });
}

async function keyPrevented(page: Page): Promise<boolean | null> {
  return page.evaluate(
    () => (window as unknown as { sliderKeyPrevented: boolean | null }).sliderKeyPrevented,
  );
}

/**
 * Presses a key on the focused Thumb, then expects the slider's shown value and whether the key's
 * default was prevented.
 */
async function key(
  page: Page,
  name: string,
  keys: string,
  expected: string,
  prevented: boolean,
): Promise<void> {
  await page.keyboard.press(keys);
  await expect(value(page, name), keys).toHaveText(expected);
  expect(await keyPrevented(page), keys).toBe(prevented);
}

/** Records the pointer ID of the next press on a Track. */
async function recordPointer(page: Page, name: string): Promise<void> {
  await track(page, name).evaluate((element) => {
    element.addEventListener(
      "pointerdown",
      (event) => {
        element.setAttribute("data-pointer-id", String((event as PointerEvent).pointerId));
      },
      { capture: true },
    );
  });
}

/** Clicks a fixture control from script, so the mouse stays where it is. */
async function scriptClick(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).evaluate((element: HTMLElement) => element.click());
}

function isDuplicate(record: ErrorRecord, role: string): boolean {
  if (record.source !== "console") {
    return false;
  }

  for (const argument of record.arguments ?? []) {
    if (
      typeof argument === "object" &&
      argument !== null &&
      "message" in argument &&
      argument.message === `Slider supports only one mounted ${role}.`
    ) {
      return true;
    }
  }

  return false;
}

type ThumbAttributes = Record<string, string | null>;

async function thumbAttributes(locator: Locator): Promise<ThumbAttributes> {
  return locator.evaluate((element) => {
    const names = [
      "role",
      "tabindex",
      "aria-valuenow",
      "aria-valuemin",
      "aria-valuemax",
      "aria-valuetext",
      "aria-disabled",
      "aria-orientation",
      "aria-labelledby",
      "aria-describedby",
      "aria-invalid",
      "aria-required",
      "aria-readonly",
    ];
    const attributes: Record<string, string | null> = {};

    for (const name of names) {
      attributes[name] = element.getAttribute(name);
    }

    return attributes;
  });
}

async function rootAttributes(locator: Locator): Promise<ThumbAttributes> {
  return locator.evaluate((element) => ({
    percent: (element as HTMLElement).style.getPropertyValue("--og-slider-percent"),
    disabled: element.getAttribute("data-disabled"),
    dragging: element.getAttribute("data-dragging"),
    role: element.getAttribute("role"),
  }));
}

test("SL1: server HTML carries the percentage, the Thumb's slider semantics and its Field associations, and eager and incremental hydration keep the nodes and those attributes", async ({
  page,
}, info) => {
  const server: Record<string, ThumbAttributes> = {};

  await fixture(page, "slider", info, async () => {
    for (const name of ["main", "rtl", "zoom"]) {
      server[`${name}-root`] = await rootAttributes(root(page, name));
      server[`${name}-thumb`] = await thumbAttributes(thumb(page, name));
    }
  });

  expect(server["main-root"]).toEqual({
    percent: "40%",
    disabled: null,
    dragging: null,
    role: null,
  });
  expect(server["main-thumb"]).toEqual({
    role: "slider",
    tabindex: "0",
    "aria-valuenow": "40",
    "aria-valuemin": "0",
    "aria-valuemax": "100",
    "aria-valuetext": null,
    "aria-disabled": null,
    "aria-orientation": null,
    "aria-labelledby": null,
    "aria-describedby": null,
    "aria-invalid": null,
    "aria-required": null,
    "aria-readonly": null,
  });
  expect(server["rtl-root"]?.["percent"]).toBe("40%");
  expect(server["rtl-thumb"]?.["aria-valuenow"]).toBe("40");
  // The form's min() and max() rules reach the inputs on the server too.
  expect(server["zoom-root"]?.["percent"]).toBe("50%");
  expect(server["zoom-thumb"]).toEqual({
    role: "slider",
    tabindex: "0",
    "aria-valuenow": "100",
    "aria-valuemin": "20",
    "aria-valuemax": "180",
    "aria-valuetext": "100%",
    "aria-disabled": null,
    "aria-orientation": null,
    "aria-labelledby": "zoom-label",
    "aria-describedby": "zoom-description",
    "aria-invalid": null,
    "aria-required": null,
    "aria-readonly": null,
  });

  for (const name of ["main", "rtl", "zoom"]) {
    expect(await rootAttributes(root(page, name)), name).toEqual(server[`${name}-root`]);
    expect(await thumbAttributes(thumb(page, name)), name).toEqual(server[`${name}-thumb`]);
  }

  await expect(thumb(page, "zoom")).toHaveAccessibleName("Zoom");
  await expect(thumb(page, "zoom")).toHaveAccessibleDescription("From 20% to 180%.");
  await expect(page.getByTestId("main-state")).toHaveText("40 40 false false");

  const probe = page.getByTestId("main-probe");

  await expect(probe).toHaveAttribute("data-value-state", "40");
  await expect(probe).toHaveAttribute("data-percent-state", "40");
  await expect(probe).toHaveAttribute("data-disabled-state", "false");
  await expect(probe).toHaveAttribute("data-dragging-state", "false");
});

test("SL2: keys move to the next and previous allowed values, PageUp and PageDown a tenth of the range, Home and End to the ends; ArrowLeft and ArrowRight swap in right-to-left text; handled keys prevent their default, modified keys are ignored and a key that changes nothing writes nothing", async ({
  page,
}, info) => {
  await fixture(page, "slider", info);
  await recordKeys(page);
  await thumb(page, "main").focus();

  await key(page, "main", "ArrowRight", "41", true);
  await key(page, "main", "ArrowUp", "42", true);
  await key(page, "main", "ArrowLeft", "41", true);
  await key(page, "main", "ArrowDown", "40", true);
  await key(page, "main", "PageUp", "50", true);
  await key(page, "main", "PageDown", "40", true);
  await key(page, "main", "End", "100", true);
  await expect(root(page, "main")).toHaveCSS("--og-slider-percent", "100%");
  await expect(page.getByTestId("main-writes")).toHaveText("7");

  // At a bound the key is still handled, and writes nothing.
  await key(page, "main", "ArrowRight", "100", true);
  await key(page, "main", "PageUp", "100", true);
  await key(page, "main", "End", "100", true);
  await key(page, "main", "Home", "0", true);
  await key(page, "main", "ArrowDown", "0", true);
  await key(page, "main", "Home", "0", true);
  await expect(page.getByTestId("main-writes")).toHaveText("8");

  for (const modified of [
    "Shift+ArrowRight",
    "Alt+ArrowRight",
    "Control+ArrowRight",
    "Meta+ArrowRight",
  ]) {
    await key(page, "main", modified, "0", false);
  }

  await key(page, "main", "a", "0", false);
  await expect(page.getByTestId("main-writes")).toHaveText("8");
  await expect(thumb(page, "main")).toBeFocused();

  await thumb(page, "rtl").focus();
  await key(page, "rtl", "ArrowRight", "39", true);
  await key(page, "rtl", "ArrowLeft", "40", true);
  await key(page, "rtl", "ArrowLeft", "41", true);
  await key(page, "rtl", "ArrowUp", "42", true);
  await key(page, "rtl", "ArrowDown", "41", true);
});

test("SL3: values lie on the grid from min, the upper end is the last grid value, decimals are rounded, off-grid external values land on the grid by key, and out-of-range or non-finite values only render clamped and are never written back", async ({
  page,
}, info) => {
  await fixture(page, "slider", info);
  await recordKeys(page);

  const main = root(page, "main");
  const writes = page.getByTestId("main-writes");

  // 20 to 185 by 10: the last allowed value is 180; a page is two steps.
  await page.getByTestId("main-config-zoom").click();
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuemax", "185");
  await thumb(page, "main").focus();
  await key(page, "main", "ArrowRight", "50", true);
  await key(page, "main", "PageUp", "70", true);
  await key(page, "main", "End", "180", true);
  await key(page, "main", "ArrowRight", "180", true);
  await key(page, "main", "Home", "20", true);
  await key(page, "main", "PageDown", "20", true);
  await expect(writes).toHaveText("4");

  // 0 to 1 by 0.1: no floating error.
  await page.getByTestId("main-config-decimal").click();
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuemax", "1");
  await page.getByTestId("main-write-0.3").click();
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuenow", "0.3");
  await thumb(page, "main").focus();
  await key(page, "main", "ArrowRight", "0.4", true);
  await key(page, "main", "ArrowLeft", "0.3", true);
  await key(page, "main", "ArrowLeft", "0.2", true);
  await key(page, "main", "End", "1", true);
  await key(page, "main", "PageDown", "0.9", true);
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuenow", "0.9");

  // Back to 0 to 100 by 1.
  await page.getByTestId("main-config-default").click();
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuemax", "100");

  const before = Number(await writes.textContent());

  // An off-grid value is kept as it is and lands on the grid by key.
  await page.getByTestId("main-write-7.3").click();
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuenow", "7.3");
  await expect(main).toHaveCSS("--og-slider-percent", "7.3%");
  await thumb(page, "main").focus();
  await key(page, "main", "ArrowRight", "8", true);
  await page.getByTestId("main-write-7.3").click();
  await expect(value(page, "main")).toHaveText("7.3");
  await thumb(page, "main").focus();
  await key(page, "main", "ArrowLeft", "7", true);

  // Out of range and non-finite values render clamped and stay as they are.
  await page.getByTestId("main-write-150").click();
  await expect(value(page, "main")).toHaveText("150");
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuenow", "100");
  await expect(main).toHaveCSS("--og-slider-percent", "100%");
  await expect(page.getByTestId("main-state")).toHaveText("150 100 false false");
  await page.getByTestId("main-write--5").click();
  await expect(value(page, "main")).toHaveText("-5");
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuenow", "0");
  await expect(main).toHaveCSS("--og-slider-percent", "0%");
  await page.getByTestId("main-write-NaN").click();
  await expect(value(page, "main")).toHaveText("NaN");
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuenow", "0");
  await expect(main).toHaveCSS("--og-slider-percent", "0%");
  await expect(writes).toHaveText(String(before + 2));

  // A key acts from the clamped value.
  await page.getByTestId("main-write-150").click();
  await expect(value(page, "main")).toHaveText("150");
  await thumb(page, "main").focus();
  await key(page, "main", "ArrowLeft", "99", true);
  await page.getByTestId("main-write-NaN").click();
  await expect(value(page, "main")).toHaveText("NaN");
  await thumb(page, "main").focus();
  await key(page, "main", "ArrowRight", "1", true);
  await expect(writes).toHaveText(String(before + 4));
});

test("SL4: an invalid configuration renders at 0% and drops every user write; a write equal to the value emits nothing", async ({
  page,
}, info) => {
  await fixture(page, "slider", info);
  await recordKeys(page);

  const writes = page.getByTestId("main-writes");

  for (const configuration of ["main-config-equal", "main-config-zero-step"]) {
    await page.getByTestId(configuration).click();
    await expect(root(page, "main"), configuration).toHaveCSS("--og-slider-percent", "0%");
    await thumb(page, "main").focus();
    await key(page, "main", "ArrowRight", "40", true);
    await key(page, "main", "End", "40", true);

    const at = await point(page, "main", 0.9);

    await press(page, at);
    await page.mouse.move(at.x - 100, at.y, { steps: 3 });
    await expect(root(page, "main")).not.toHaveAttribute("data-dragging");
    await page.mouse.up();
    await expect(value(page, "main")).toHaveText("40");
  }

  await expect(writes).toHaveText("0");

  // Equality gate: Home on min, or a press on the current value, writes nothing.
  await page.getByTestId("main-config-default").click();
  await page.getByTestId("main-write-40").click();
  await expect(root(page, "main")).toHaveCSS("--og-slider-percent", "40%");

  const at = await point(page, "main", 0.4);

  await press(page, at);
  await page.mouse.up();
  await expect(thumb(page, "main")).toBeFocused();
  await key(page, "main", "Home", "0", true);
  await key(page, "main", "Home", "0", true);
  await expect(writes).toHaveText("1");
});

test("SL5: a primary press on the Track focuses the Thumb and jumps to the pointer, a drag follows it and clamps outside the Track, the release ends it; nothing is selected and other buttons are ignored", async ({
  page,
}, info) => {
  await fixture(page, "slider", info);

  const main = root(page, "main");
  const writes = page.getByTestId("main-writes");
  const at = await point(page, "main", 0.75);

  await press(page, at);
  await expect(value(page, "main")).toHaveText("75");
  await expect(main).toHaveAttribute("data-dragging", "");
  await expect(page.getByTestId("main-state")).toHaveText("75 75 false true");
  expect(await focusedTestId(page)).toBe("main-thumb");

  await page.mouse.move(at.box.x + at.box.width * 0.9, at.y, { steps: 3 });
  await expect(value(page, "main")).toHaveText("90");
  // Beyond the right end, above the Track; the cursor stays inside the viewport.
  await page.mouse.move(at.box.x + at.box.width + 150, at.y - 80, { steps: 4 });
  await expect(value(page, "main")).toHaveText("100");
  // Beyond the left end, below the Track; the drag crosses the Track's text.
  await page.mouse.move(at.box.x - 50, at.y + 90, { steps: 6 });
  await expect(value(page, "main")).toHaveText("0");
  expect(await selection(page)).toBe("");
  await page.mouse.up();
  await expect(main).not.toHaveAttribute("data-dragging");

  const count = await writes.textContent();

  // A move after the release, back over the Track, writes nothing.
  await page.mouse.move(at.box.x + at.box.width * 0.5, at.y, { steps: 4 });
  await expect(value(page, "main")).toHaveText("0");
  await expect(writes).toHaveText(count ?? "");

  // A right-button press neither jumps nor drags.
  await page.mouse.down({ button: "right" });
  await page.mouse.move(at.box.x + at.box.width * 0.8, at.y, { steps: 3 });
  await page.mouse.up({ button: "right" });
  await expect(value(page, "main")).toHaveText("0");
  await expect(main).not.toHaveAttribute("data-dragging");
  await expect(writes).toHaveText(count ?? "");
  expect(await selection(page)).toBe("");
});

test("SL6: a press on the Thumb keeps its grab offset and moves from there; in right-to-left text positions run from the Track's right edge", async ({
  page,
}, info) => {
  await fixture(page, "slider", info);

  // The Thumb's center sits on the value's position, 40% along; press 6 px right of it.
  const anchor = await point(page, "main", 0.4);
  const grab = { x: anchor.x + 6, y: anchor.y };

  await press(page, grab);
  await expect(root(page, "main")).toHaveAttribute("data-dragging", "");
  await expect(value(page, "main")).toHaveText("40");
  await expect(page.getByTestId("main-writes")).toHaveText("0");
  expect(await focusedTestId(page)).toBe("main-thumb");
  // 60 px on a 400 px Track is 15.
  await page.mouse.move(grab.x + 60, grab.y, { steps: 4 });
  await expect(value(page, "main")).toHaveText("55");
  await page.mouse.up();

  // Right to left: a press 70% from the left is 30 from the right.
  const rtl = await point(page, "rtl", 0.7);

  await press(page, rtl);
  await expect(value(page, "rtl")).toHaveText("30");
  await page.mouse.up();
  await expect(value(page, "rtl")).toHaveText("30");

  // The Thumb sits 30% from the right edge; pressed 6 px left of its center and dragged 60 px
  // right, it decreases the value by 15.
  await press(page, { x: rtl.x - 6, y: rtl.y });
  await expect(value(page, "rtl")).toHaveText("30");
  await page.mouse.move(rtl.x + 54, rtl.y, { steps: 4 });
  await expect(value(page, "rtl")).toHaveText("15");
  await page.mouse.move(rtl.box.x + rtl.box.width + 60, rtl.y, { steps: 4 });
  await expect(value(page, "rtl")).toHaveText("0");
  await page.mouse.up();
  expect(await focusedTestId(page)).toBe("rtl-thumb");
});

test("SL7: a drag ends on lost pointer capture, when the slider becomes disabled or readonly, and when the Thumb or the root is destroyed, and a stale drag never writes", async ({
  page,
}, info) => {
  await fixture(page, "slider", info);

  const main = root(page, "main");

  // Lost capture.
  await recordPointer(page, "main");

  const at = await point(page, "main", 0.25);

  await press(page, at);
  await page.mouse.move(at.x + 4, at.y);
  await expect(value(page, "main")).toHaveText("26");
  await track(page, "main").evaluate((element) => {
    const id = Number(element.getAttribute("data-pointer-id"));

    element.releasePointerCapture(id);
  });
  // Engines may fire lostpointercapture only before the pointer's next event, as Firefox does.
  await page.mouse.move(at.box.x + at.box.width * 0.8, at.y, { steps: 4 });
  await expect(main).not.toHaveAttribute("data-dragging");
  await expect(value(page, "main")).toHaveText("26");
  await page.mouse.up();

  // Disabled mid-drag, then enabled again before the next move. Each press lands on the Track,
  // away from the Thumb.
  const middle = await point(page, "main", 0.5);

  await press(page, middle);
  await expect(value(page, "main")).toHaveText("50");
  await scriptClick(page, "main-disable");
  await expect(main).toHaveAttribute("data-disabled", "");
  await expect(main).not.toHaveAttribute("data-dragging");
  await page.mouse.move(at.box.x + at.box.width * 0.6, at.y, { steps: 3 });
  await scriptClick(page, "main-disable");
  await expect(main).not.toHaveAttribute("data-disabled");
  await page.mouse.move(at.box.x + at.box.width * 0.7, at.y, { steps: 3 });
  await expect(value(page, "main")).toHaveText("50");
  await page.mouse.up();

  // Disabled and enabled again with no move in between.
  const late = await point(page, "main", 0.75);

  await press(page, late);
  await page.mouse.move(late.x + 4, late.y);
  await expect(value(page, "main")).toHaveText("76");
  await scriptClick(page, "main-disable");
  await expect(main).toHaveAttribute("data-disabled", "");
  await scriptClick(page, "main-disable");
  await expect(main).not.toHaveAttribute("data-disabled");
  await page.mouse.move(at.box.x + at.box.width * 0.9, at.y, { steps: 3 });
  await expect(value(page, "main")).toHaveText("76");
  await expect(main).not.toHaveAttribute("data-dragging");
  await page.mouse.up();

  // Readonly mid-drag through the form.
  const zoom = await point(page, "zoom", 0.25);

  await press(page, zoom);
  await expect(value(page, "zoom")).toHaveText("60");
  await scriptClick(page, "zoom-readonly");
  await expect(thumb(page, "zoom")).toHaveAttribute("aria-readonly", "true");
  await expect(root(page, "zoom")).not.toHaveAttribute("data-dragging");
  await scriptClick(page, "zoom-readonly");
  await expect(thumb(page, "zoom")).not.toHaveAttribute("aria-readonly");
  await page.mouse.move(zoom.box.x + zoom.box.width * 0.8, zoom.y, { steps: 3 });
  await expect(value(page, "zoom")).toHaveText("60");
  await page.mouse.up();

  // The Thumb destroyed mid-drag.
  const lifetime = await point(page, "lifetime", 0.25);

  await press(page, lifetime);
  await expect(value(page, "lifetime")).toHaveText("25");
  await scriptClick(page, "lifetime-remove-thumb");
  await expect(thumb(page, "lifetime")).toHaveCount(0);
  await expect(root(page, "lifetime")).not.toHaveAttribute("data-dragging");
  await page.mouse.move(lifetime.box.x + lifetime.box.width * 0.8, lifetime.y, { steps: 3 });
  await expect(value(page, "lifetime")).toHaveText("25");
  await page.mouse.up();
  // Without a Thumb a press still writes, without focusing.
  await press(page, { x: lifetime.box.x + lifetime.box.width * 0.5, y: lifetime.y });
  await expect(value(page, "lifetime")).toHaveText("50");
  await page.mouse.up();

  // The root destroyed mid-drag.
  await page.getByTestId("lifetime-restore").click();
  await press(page, lifetime);
  await expect(value(page, "lifetime")).toHaveText("25");
  await scriptClick(page, "lifetime-remove-root");
  await expect(root(page, "lifetime")).toHaveCount(0);
  await page.mouse.move(lifetime.box.x + lifetime.box.width * 0.8, lifetime.y, { steps: 3 });
  await page.mouse.up();
  await expect(value(page, "lifetime")).toHaveText("25");
  await expect(page.getByTestId("lifetime-writes")).toHaveText("3");
});

test("SL8: while disabled the Thumb has no tab stop and aria-disabled, and keys, presses and focus() do nothing while external writes apply; a focus listener that disables the slider during a press stops it", async ({
  page,
}, info) => {
  await fixture(page, "slider", info);

  const main = root(page, "main");

  await page.getByTestId("main-disable").click();
  await expect(main).toHaveAttribute("data-disabled", "");
  await expect(thumb(page, "main")).not.toHaveAttribute("tabindex");
  await expect(thumb(page, "main")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("main-probe")).toHaveAttribute("data-disabled-state", "true");

  const at = await point(page, "main", 0.8);

  await press(page, at);
  await page.mouse.move(at.x - 100, at.y, { steps: 3 });
  await page.mouse.up();
  await expect(value(page, "main")).toHaveText("40");
  expect(await focusedTestId(page)).not.toBe("main-thumb");
  await page.getByTestId("main-focus").click();
  expect(await focusedTestId(page)).not.toBe("main-thumb");
  await thumb(page, "main").focus();
  expect(await focusedTestId(page)).not.toBe("main-thumb");
  await page.getByTestId("main-write-150").click();
  await expect(thumb(page, "main")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByTestId("main-writes")).toHaveText("0");

  await page.getByTestId("main-disable").click();
  await page.getByTestId("main-focus").click();
  expect(await focusedTestId(page)).toBe("main-thumb");

  // A press whose Thumb focus listener disables the slider writes nothing and starts no drag.
  await page.getByTestId("factory-readonly-on-focus").click();

  const factory = await point(page, "factory", 0.9);

  await press(page, factory);
  await expect(root(page, "factory")).toHaveAttribute("data-disabled", "");
  await page.mouse.move(factory.x - 100, factory.y, { steps: 3 });
  await page.mouse.up();
  await expect(value(page, "factory")).toHaveText("50");
  await expect(root(page, "factory")).not.toHaveAttribute("data-dragging");
});

test("SL9: with [formField] the Slider shows the value, takes min() and max() rules as its bounds for keys and the pointer, writes the model, emits touch when focus leaves the Thumb, takes focus from focusBoundControl(), drops writes while readonly and follows disabled(); the Thumb is the Field's control without aria-required", async ({
  page,
}, info) => {
  await fixture(page, "slider", info);
  await recordKeys(page);

  const zoom = thumb(page, "zoom");

  await expect(page.getByTestId("zoom-touched")).toHaveText("false");
  await page.getByTestId("zoom-focus").click();
  await expect(zoom).toBeFocused();
  await key(page, "zoom", "ArrowRight", "110", true);
  await expect(zoom).toHaveAttribute("aria-valuetext", "110%");
  await key(page, "zoom", "End", "180", true);
  await key(page, "zoom", "Home", "20", true);
  await expect(page.getByTestId("zoom-touched")).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("zoom-touched")).toHaveText("true");

  // A min() rule change rebinds the bound; the pointer is bounded too.
  await page.getByTestId("zoom-min").click();
  await expect(zoom).toHaveAttribute("aria-valuemin", "50");
  await expect(zoom).toHaveAttribute("aria-valuenow", "50");
  await expect(value(page, "zoom")).toHaveText("20");

  const middle = await point(page, "zoom", 0.5);

  await press(page, middle);
  await expect(value(page, "zoom")).toHaveText("120");
  await page.mouse.move(middle.box.x - 40, middle.y, { steps: 4 });
  await expect(value(page, "zoom")).toHaveText("50");
  await page.mouse.up();
  await expect(zoom).toBeFocused();
  await key(page, "zoom", "Home", "50", true);
  await key(page, "zoom", "ArrowRight", "60", true);

  // An external write out of range: rendered clamped, the Field shows the max() error.
  await page.getByTestId("zoom-write").click();
  await expect(zoom).toHaveAttribute("aria-valuenow", "180");
  await expect(zoom).toHaveAttribute("aria-invalid", "true");
  await expect(zoom).toHaveAttribute("aria-describedby", "zoom-description zoom-error");
  await expect(zoom).not.toHaveAttribute("aria-required");

  // Readonly: focus and handled keys, no writes.
  await page.getByTestId("zoom-readonly").click();
  await expect(zoom).toHaveAttribute("aria-readonly", "true");
  await zoom.focus();
  await key(page, "zoom", "ArrowLeft", "250", true);

  await press(page, middle);
  await page.mouse.move(middle.x + 80, middle.y, { steps: 3 });
  await page.mouse.up();
  await expect(value(page, "zoom")).toHaveText("250");
  await expect(zoom).toBeFocused();
  await page.getByTestId("zoom-readonly").click();
  await expect(zoom).not.toHaveAttribute("aria-readonly");

  // disabled() rule.
  await page.getByTestId("zoom-disabled").click();
  await expect(zoom).toHaveAttribute("aria-disabled", "true");
  await expect(zoom).not.toHaveAttribute("tabindex");
  await page.getByTestId("zoom-focus").click();
  expect(await focusedTestId(page)).not.toBe("zoom-thumb");
  await page.getByTestId("zoom-disabled").click();
  await expect(zoom).toHaveAttribute("tabindex", "0");

  // A consumer directive composing the Slider through hostDirectives is the control.
  const composed = thumb(page, "composed");

  await expect(composed).toHaveAccessibleName("Opacity");
  await expect(composed).toHaveAttribute("aria-valuenow", "30");
  await page.getByTestId("composed-focus").click();
  await expect(composed).toBeFocused();
  await key(page, "composed", "ArrowRight", "31", true);
  await expect(page.getByTestId("composed-touched")).toHaveText("false");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("composed-touched")).toHaveText("true");
  await page.getByTestId("composed-readonly").click();
  await expect(composed).toHaveAttribute("aria-readonly", "true");
  await composed.focus();
  await key(page, "composed", "ArrowRight", "31", true);
});

test("SL10: factory and existing Slider Options replace the exposed own inputs and model through hostDirectives without emitting the unused model's output", async ({
  page,
}, info) => {
  await fixture(page, "slider", info);
  await recordKeys(page);

  const factory = thumb(page, "factory");

  // The factory's value 50, bounds 0 to 200 and step 5, not the decoys bound to the exposed inputs.
  await expect(factory).toHaveAttribute("aria-valuenow", "50");
  await expect(factory).toHaveAttribute("aria-valuemax", "200");
  await expect(root(page, "factory")).toHaveCSS("--og-slider-percent", "25%");
  await factory.focus();
  await key(page, "factory", "ArrowRight", "55", true);
  await key(page, "factory", "PageUp", "75", true);
  await expect(page.getByTestId("factory-probe")).toHaveAttribute("data-value-state", "75");
  await expect(page.getByTestId("factory-outputs")).toHaveText("0");
  await page.getByTestId("factory-disable").click();
  await expect(factory).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("factory-probe")).toHaveAttribute("data-disabled-state", "true");

  const existing = thumb(page, "existing");

  await expect(existing).toHaveAttribute("aria-valuenow", "3");
  await expect(existing).toHaveAttribute("aria-valuemax", "10");

  const at = await point(page, "existing", 0.8);

  await press(page, at);
  await page.mouse.up();
  await expect(value(page, "existing")).toHaveText("8");
  await expect(existing).toBeFocused();
  await key(page, "existing", "End", "10", true);
  await page.getByTestId("existing-disable").click();
  await expect(existing).not.toHaveAttribute("tabindex");
});

test("SL11: a second mounted Thumb or Track fails through ErrorHandler", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  await fixture(page, "slider", info);
  await drainIssues();
  expect(runtimeErrors.records).toEqual([]);
  info.annotations.push({ type: "expected-error", description: "second Thumb and Track" });

  await page.getByTestId("mount-duplicate-thumb").click();
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.some((record) => isDuplicate(record, "thumb"));
    })
    .toBe(true);
  await page.getByTestId("mount-duplicate-track").click();
  await expect
    .poll(async () => {
      await drainIssues();

      return runtimeErrors.records.some((record) => isDuplicate(record, "track"));
    })
    .toBe(true);

  for (const record of runtimeErrors.records) {
    expect(isDuplicate(record, "thumb") || isDuplicate(record, "track"), record.text).toBe(true);
  }
});

/**
 * Opens the slider route and acts before it hydrates: under eager hydration while the main bundle
 * is held, so Angular's early event contract replays the input; under incremental hydration once
 * the shell runs, holding the fixture's deferred chunk, so the block's queue replays it.
 */
async function beforeHydration(
  page: Page,
  info: TestInfo,
  act: () => Promise<void>,
): Promise<void> {
  const incremental = info.project.metadata.hydration === "incremental";
  const release = await bootstrapHeld(page, "/slider", info);

  if (!incremental) {
    await act();
    await expect(page.getByTestId("main-writes")).toHaveText("0");
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");

    return;
  }

  let releaseChunk!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseChunk = resolve;
  });
  let held = false;

  await page.route(
    (url) => /\.m?js$/.test(url.pathname),
    async (route) => {
      const response = await route.fetch();
      const source = await response.text();

      if (source.includes("Attach slider behavior")) {
        held = true;
        await gate;
      }

      await route.fulfill({ response });
    },
  );
  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await act();
  await expect.poll(() => held).toBe(true);
  await expect(page.getByTestId("main-writes")).toHaveText("0");
  releaseChunk();
}

test("SL12 replay: a key and a Track press before hydration are applied once when the slider hydrates, and a press dragged and released outside the Track before then continues no drag", async ({
  page,
}, info) => {
  await beforeHydration(page, info, async () => {
    await thumb(page, "main").evaluate((element: HTMLElement) => element.focus());
    await page.keyboard.press("ArrowRight");
  });
  await expect(value(page, "main")).toHaveText("41");
  await expect(page.getByTestId("main-writes")).toHaveText("1");
  await expect(thumb(page, "main")).toBeFocused();
});

test("SL12 replay: a Track press before hydration jumps once and focuses the Thumb without a drag", async ({
  page,
}, info) => {
  await beforeHydration(page, info, async () => {
    const at = await point(page, "main", 0.75);

    await press(page, at);
    await page.mouse.up();
  });
  await expect(value(page, "main")).toHaveText("75");
  await expect(page.getByTestId("main-writes")).toHaveText("1");
  await expect(thumb(page, "main")).toBeFocused();
  await expect(root(page, "main")).not.toHaveAttribute("data-dragging");
});

test("SL12 replay: a press dragged and released outside the Track before hydration moves only to the press point, and a later unpressed hover writes nothing", async ({
  page,
}, info) => {
  let at!: Point;

  await beforeHydration(page, info, async () => {
    at = await point(page, "main", 0.25);
    await press(page, at);
    await page.mouse.move(at.box.x + at.box.width * 0.6, at.y, { steps: 4 });
    await page.mouse.move(at.box.x + at.box.width + 100, at.y, { steps: 3 });
    await page.mouse.up();
  });
  await expect(value(page, "main")).toHaveText("25");
  await expect(page.getByTestId("main-writes")).toHaveText("1");
  await expect(root(page, "main")).not.toHaveAttribute("data-dragging");
  await page.mouse.move(at.box.x + at.box.width * 0.5, at.y, { steps: 4 });
  await page.mouse.move(at.box.x + at.box.width * 0.8, at.y, { steps: 4 });
  await expect(value(page, "main")).toHaveText("25");
  await expect(page.getByTestId("main-writes")).toHaveText("1");
});
