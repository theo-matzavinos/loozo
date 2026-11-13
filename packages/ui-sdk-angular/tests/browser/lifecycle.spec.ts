// Object values, Selects created after hydration or in a deferred block, item lists replaced
// and items re-keyed by a new itemToValue under a kept root, destroy while open, and the D18
// error for a same-element state read.
import { type Page, expect, test } from "@playwright/test";
import { captureMessages, expectClean, instanceId, modeOf } from "./harness";

async function hydrated(page: Page, path: string, trigger: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator(`${trigger} [uiSelectTrigger]`)).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.waitForFunction(() => document.readyState === "complete");
}

test("object values key by itemToValue: distinct ids, the selected object and its label come back", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const root = "[data-testid=objects]";

  await hydrated(page, "/lifecycle", root);

  const id = await instanceId(page, "objects");

  await expect(page.locator(`${root} [data-option=gr]`)).toHaveAttribute("id", `${id}-option-gr`);
  await expect(page.locator(`${root} [data-option=fr]`)).toHaveAttribute("id", `${id}-option-fr`);
  await page.locator(`${root} [uiSelectTrigger]`).click();
  await page.locator(`${root} [data-option=fr]`).click();
  await expect(page.locator("[data-testid=country]")).toHaveText("France");
  await expect(page.locator(`${root} [uiSelectValue]`)).toHaveText("France");
  await expect(page.locator(`${root} [data-option=fr]`)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`${root} [data-option=gr]`)).toHaveAttribute("aria-selected", "false");
  expectClean(messages);
});

test("a Select created after hydration gets a browser id and works", async ({ page }) => {
  const messages = captureMessages(page);

  await hydrated(page, "/lifecycle", "[data-testid=objects]");
  await page.locator("[data-testid=create-late]").click();

  const root = "[data-testid=late]";
  const trigger = page.locator(`${root} [uiSelectTrigger]`);

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await instanceId(page, "late")).toMatch(/^ui-sdk-\d+$/);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.locator(`${root} [data-option=late-two]`).click();
  await expect(page.locator(`${root} [uiSelectValue]`)).toHaveText("two");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expectClean(messages);
});

declare global {
  interface Window {
    /** Every Set a slot was added to: the roots' slot registries (lifecycle.spec.ts). */
    __uiSdkRegistries: Set<Set<unknown>>;
  }
}

/**
 * Installed before any page script: remembers each Set that receives a slot, recognized by the
 * shape of `ɵUiSdkSlot`, so the test can read a root's registry size without a package hook.
 * Serialized by addInitScript: it must stay self-contained.
 */
function observeRegistries(): void {
  const add = Object.getOwnPropertyDescriptor(Set.prototype, "add")!.value as Set<unknown>["add"];
  const registries = new Set<Set<unknown>>();

  window.__uiSdkRegistries = registries;
  Set.prototype.add = function (this: Set<unknown>, value: unknown) {
    const slot =
      typeof value === "object" &&
      value !== null &&
      "part" in value &&
      "state" in value &&
      "dispatch" in value &&
      "dispose" in value;

    if (slot) {
      add.call(registries, this);
    }

    return add.call(this, value);
  };
}

async function registrySizes(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const sizes = [];

    for (const registry of window.__uiSdkRegistries) {
      sizes.push(registry.size);
    }

    return sizes;
  });
}

test("a Select kept alive while its items are replaced keeps only its current slots and selects from the latest items", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const root = "[data-testid=replaced]";
  const trigger = page.locator(`${root} [uiSelectTrigger]`);
  // The root, trigger, value and content slots, and the three current items.
  const current = 7;

  await page.addInitScript(observeRegistries);
  await hydrated(page, "/replace-items", root);
  expect(await registrySizes(page)).toEqual([current]);

  for (let round = 1; round <= 5; round += 1) {
    await page.locator("[data-testid=replace]").click();
    await expect(page.locator(`${root} [data-option=b${round}-one]`)).toBeAttached();
    expect(await registrySizes(page)).toEqual([current]);
  }

  await expect(page.locator(`${root} [data-option]`)).toHaveCount(3);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.locator(`${root} [data-option=b5-two]`).click();
  await expect(page.locator("[data-testid=picked]")).toHaveText("b5-two");
  await expect(page.locator(`${root} [uiSelectValue]`)).toHaveText("b5-two");
  await expect(page.locator(`${root} [data-option=b5-two]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expectClean(messages);
});

test("replacing only itemToValue on a kept list re-keys its items: ids, selection and a later pick follow", async ({
  page,
}) => {
  const messages = captureMessages(page);
  const root = "[data-testid=remapped]";
  const trigger = page.locator(`${root} [uiSelectTrigger]`);
  const a = page.locator(`${root} [data-option=a]`);
  const b = page.locator(`${root} [data-option=b]`);

  await hydrated(page, "/remap", root);

  const id = await instanceId(page, "remapped");

  await expect(a).toHaveAttribute("id", `${id}-option-a`);
  await expect(a).toHaveAttribute("aria-selected", "true");
  await expect(a.locator("[data-mark]")).toHaveText("true");
  await page.locator("[data-testid=remap]").click();
  await expect(a).toHaveAttribute("id", `${id}-option-new-a`);
  await expect(b).toHaveAttribute("id", `${id}-option-new-b`);
  await expect(a).toHaveAttribute("aria-selected", "true");
  await expect(b).toHaveAttribute("aria-selected", "false");
  await expect(a.locator("[data-mark]")).toHaveText("true");
  await expect(b.locator("[data-mark]")).toHaveText("false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await b.click();
  await expect(page.locator("[data-testid=picked]")).toHaveText("b");
  await expect(page.locator(`${root} [uiSelectValue]`)).toHaveText("B");
  await expect(b).toHaveAttribute("aria-selected", "true");
  await expect(a).toHaveAttribute("aria-selected", "false");
  await expect(b.locator("[data-mark]")).toHaveText("true");
  await expect(a.locator("[data-mark]")).toHaveText("false");
  expectClean(messages);
});

test("destroying a Select with its popup open unbinds it cleanly", async ({ page }) => {
  const messages = captureMessages(page);
  const root = "[data-testid=doomed]";

  await hydrated(page, "/lifecycle", root);
  await page.locator("[data-testid=destroy-soon]").click();
  await page.locator(`${root} [uiSelectTrigger]`).click();
  await expect(page.locator(`${root} [uiSelectContent]`)).toBeVisible();
  await expect(page.locator(root)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await page.waitForTimeout(500);
  expectClean(messages);
});

test("two Selects, one in a hydrate-on-interaction block, each work", async ({ page }) => {
  const messages = captureMessages(page);

  await hydrated(page, "/defer", "[data-testid=outside]");

  const outside = page.locator("[data-testid=outside] [uiSelectTrigger]");
  const inside = page.locator("[data-testid=inside] [uiSelectTrigger]");

  await outside.click();
  await page.locator("[data-option=blue]").click();
  await expect(page.locator("[data-testid=outside] [uiSelectValue]")).toHaveText("blue");
  // A human-paced press; the fast one is the known limitation in the next case.
  await inside.click({ delay: 100 });
  await expect(inside).toHaveAttribute("aria-expanded", "true");
  await page.locator("[data-option=large]").click();
  await expect(page.locator("[data-testid=inside] [uiSelectValue]")).toHaveText("large");
  expect(await instanceId(page, "inside")).not.toBe(await instanceId(page, "outside"));
  expectClean(messages);
});

// Known limitation (select/README.md): Angular hydrates an already-loaded hydrate-on-interaction
// block between a fast press's pointerdown and click, delivers the live click to the block's
// listeners, then replays the earlier pointerdown. Core gets click (opens), then pointerdown
// (closes). A plain Angular listener on the trigger gets the same order, so the adapter can't
// restore it without reordering or dropping events. Chromium dispatches the click before the
// replay; Firefox and WebKit after it. So Chromium incremental asserts exactly that open-then-close
// and every other project asserts it stays open. Anything else fails, including Angular replaying
// first in Chromium: then expect ["false", "true"] there too and drop the readme caveat.
test("a fast first press on an already-loaded hydrate-on-interaction Select opens it, except the known Chromium inversion", async ({
  page,
  browserName,
}, testInfo) => {
  const messages = captureMessages(page);
  const inside = page.locator("[data-testid=inside] [uiSelectTrigger]");
  const inverted = browserName === "chromium" && modeOf(testInfo) === "incremental";

  await hydrated(page, "/defer", "[data-testid=outside]");
  await expect(inside).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => {
    const trigger = document.querySelector("[data-testid=inside] [uiSelectTrigger]")!;
    const seen = [trigger.getAttribute("aria-expanded")];

    Object.assign(window, { __uiSdkExpanded: seen });
    new MutationObserver(() => {
      const value = trigger.getAttribute("aria-expanded");

      if (value !== seen.at(-1)) {
        seen.push(value);
      }
    }).observe(trigger, { attributeFilter: ["aria-expanded"] });
  });
  await inside.click();
  // The inversion settles within a few frames; wait past it before reading the transitions.
  await page.waitForTimeout(500);

  const transitions = await page.evaluate(
    () => (window as unknown as { __uiSdkExpanded: (string | null)[] }).__uiSdkExpanded,
  );

  if (inverted) {
    expect(transitions).toEqual(["false", "true", "false"]);
  } else {
    expect(transitions).toEqual(["false", "true"]);
  }

  expectClean(messages);
});

test("reading a root's state from a binding on its own element throws UiSdkError (D18)", async ({
  page,
}) => {
  // Angular's ErrorHandler logs the error object; engines serialize it differently, so read it.
  const errors: Promise<string>[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    errors.push(
      Promise.all(
        message.args().map((argument) =>
          argument.evaluate((value) => {
            if (value instanceof Error) {
              return `${value.name}: ${value.message}`;
            }

            return String(value);
          }),
        ),
      ).then((parts) => parts.join(" ")),
    );
  });
  await page.goto("/errors");
  await page.waitForFunction(() => document.readyState === "complete");
  await page.waitForTimeout(300);
  await page.locator("[data-testid=show]").click();
  await expect
    .poll(async () => (await Promise.all(errors)).join("\n"))
    .toContain("UiSdkError: uiToggle was read before Angular set its inputs");
});
