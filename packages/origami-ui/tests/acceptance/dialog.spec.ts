import { test, expect, type ErrorRecord } from "./contract-test.js";
import type { ElementHandle, Locator, Page } from "playwright/test";
import {
  assertReferences,
  bootstrapHeld,
  fixture,
  stopRetentionObservation,
} from "./observation.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `ErrorHandler` report of a Dialog natively closed over a still-open Dialog inside it. */
function isOpenNested(record: ErrorRecord): boolean {
  const message =
    "Dialog closed while a Dialog inside its Content is still open. Close the inner Dialog before or together with the outer one.";

  if (record.source !== "console") {
    return false;
  }

  for (const argument of record.arguments ?? []) {
    if (isRecord(argument) && argument.message === message) {
      return true;
    }
  }

  return false;
}

/** A script action on a fixture control; never a trusted pointer gesture. */
async function script(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error("Expected a fixture control button");
    }

    node.click();
  });
}

function modal(content: Locator): Promise<boolean> {
  return content.evaluate((node) => node.matches(":modal"));
}

async function expectModal(content: Locator): Promise<void> {
  await expect.poll(() => modal(content)).toBe(true);
}

async function expectClosed(content: Locator): Promise<void> {
  await expect.poll(() => modal(content)).toBe(false);
  await expect(content).not.toHaveAttribute("open");
}

/** A page-side wait, for claims that something does not happen within `ms`. */
async function elapse(page: Page, ms: number): Promise<void> {
  await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), ms);
}

/** A wrong write would render only after the zoneless scheduler's next turn. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
  );
}

/** Whether a hit test at the center of `target` reaches something other than it: the page is blocked there. */
function blocked(target: Locator): Promise<boolean> {
  return target.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const hit = node.ownerDocument.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );

    if (hit === null) {
      throw new Error("Expected the target inside the viewport");
    }

    return hit !== node && !node.contains(hit);
  });
}

function focusInside(content: Locator): Promise<boolean> {
  return content.evaluate((node) => node.contains(node.ownerDocument.activeElement));
}

function rootOverflow(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.style.overflow);
}

/** A trusted primary click on the backdrop: a viewport corner outside every fixture dialog's box. */
async function clickBackdrop(page: Page): Promise<void> {
  await page.mouse.click(8, 8);
}

/** Keyboard opening, so the opener has focus in every engine. */
async function pressOpen(page: Page, id: string): Promise<void> {
  const opener = page.getByTestId(id);

  await opener.scrollIntoViewIfNeeded();
  await opener.focus();
  await page.keyboard.press("Enter");
}

type ExitFrame = { at: number; modal: boolean; blocked: boolean; focusInside: boolean };

/**
 * Waits for `content` to get `data-leaving`, then records each animation frame until it loses it:
 * the time since the first frame, `:modal`, whether a hit test at the center of `background`
 * reaches something else, and whether focus is inside. Call it before the action that closes.
 */
function sampleExit(content: Locator, background: ElementHandle<Element>): Promise<ExitFrame[]> {
  // Not async: the evaluation is dispatched before any later action, such as the closing click.
  return content.evaluate(
    (dialog, target) =>
      new Promise<ExitFrame[]>((resolve, reject) => {
        const frames: ExitFrame[] = [];
        const deadline = performance.now() + 5000;
        let start = -1;

        function frame(): void {
          const now = performance.now();

          if (now > deadline) {
            reject(new Error("The exit did not start and end within 5 s"));

            return;
          }

          if (!dialog.hasAttribute("data-leaving")) {
            if (start >= 0) {
              resolve(frames);

              return;
            }

            requestAnimationFrame(frame);

            return;
          }

          if (start < 0) {
            start = now;
          }

          const box = target.getBoundingClientRect();
          const hit = dialog.ownerDocument.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2,
          );

          frames.push({
            at: now - start,
            modal: dialog.matches(":modal"),
            blocked: hit !== null && hit !== target && !target.contains(hit),
            focusInside: dialog.contains(dialog.ownerDocument.activeElement),
          });
          requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
      }),
    background,
  );
}

test("Y1: a Trigger, a model write and Close open and close the native dialog modally; Escape closes it and returns focus; the Trigger's ARIA, Content's names, the State and the scroll lock follow", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const content = page.getByTestId("basic-content");
  const trigger = page.getByTestId("basic-trigger");

  await expect(content).not.toHaveAttribute("open");
  await expect(content).not.toHaveAttribute("role");
  await expect(content).not.toHaveAttribute("tabindex");
  await expect(content).toHaveAttribute(
    "aria-labelledby",
    (await page.getByTestId("basic-title").getAttribute("id"))!,
  );
  await expect(content).toHaveAttribute(
    "aria-describedby",
    (await page.getByTestId("basic-description").getAttribute("id"))!,
  );
  await expect(trigger).toHaveAttribute("type", "button");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toHaveAttribute("aria-controls", (await content.getAttribute("id"))!);
  expect(await modal(content)).toBe(false);
  await expect(page.getByTestId("basic-state")).toHaveText("false true false");

  await page.getByTestId("open-basic").scrollIntoViewIfNeeded();
  await trigger.click();
  await expectModal(content);
  await expect(page.getByTestId("basic-open")).toHaveText("true");
  await expect(page.getByTestId("basic-outputs")).toHaveText("1");
  await expect(page.getByTestId("basic-state")).toHaveText("true true true");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  // Native initial focus: the first focusable element, with no autofocus.
  await expect(page.getByTestId("basic-input")).toBeFocused();
  expect(await blocked(page.getByTestId("open-basic"))).toBe(true);
  expect(await rootOverflow(page)).toBe("hidden");
  await expect(page.getByRole("dialog", { name: "Basic dialog" })).toHaveAccessibleDescription(
    "A basic dialog.",
  );

  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(page.getByTestId("basic-open")).toHaveText("false");
  await expect(page.getByTestId("basic-outputs")).toHaveText("2");
  await expect(page.getByTestId("basic-state")).toHaveText("false true false");
  await expect(page.getByTestId("basic-cancels")).toHaveText("0");
  // The browser returns focus to the Trigger, or the Trigger fallback does where a click didn't focus it.
  await expect(trigger).toBeFocused();
  expect(await rootOverflow(page)).toBe("");
  expect(await blocked(page.getByTestId("open-basic"))).toBe(false);

  await script(page, "open-basic");
  await expectModal(content);
  await page.getByTestId("basic-close").click();
  await expectClosed(content);
  await expect(page.getByTestId("basic-open")).toHaveText("false");

  const disabledTrigger = page.getByTestId("disabled-trigger");

  await expect(disabledTrigger).toHaveAttribute("aria-disabled", "true");
  await expect(disabledTrigger).not.toHaveAttribute("disabled");
  // Playwright treats aria-disabled as not actionable; the click is still trusted.
  await disabledTrigger.click({ force: true });
  await settle(page);
  expect(await modal(page.getByTestId("disabled-content"))).toBe(false);
  await expect(page.getByTestId("disabled-close")).toHaveAttribute("disabled", "");
  await expect(page.getByTestId("disabled-close")).toHaveAttribute("aria-disabled", "true");
});

test("Y2: falsifier — through a 300 ms exit the dialog stays modal, the page stays blocked and focus stays inside, then it closes and focus returns; reopening during the exit keeps the same modal session; a dialog without animation closes at once", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const content = page.getByTestId("motion-content");
  const opener = page.getByTestId("open-motion");

  await pressOpen(page, "open-motion");
  await expectModal(content);
  await expect(content).toHaveAttribute("data-present", "");

  // Sampled in the page on every frame of the exit, so no round trip can straddle its end.
  const sampling = sampleExit(content, await opener.elementHandle());

  await page.getByTestId("motion-close").click();

  const frames = await sampling;

  expect(frames.length).toBeGreaterThan(2);
  expect(frames[frames.length - 1]!.at).toBeGreaterThanOrEqual(200);

  for (const frame of frames) {
    expect(frame).toEqual({ at: frame.at, modal: true, blocked: true, focusInside: true });
  }

  await expectClosed(content);
  await expect(content).not.toHaveAttribute("data-leaving");
  await expect(opener).toBeFocused();
  await expect(page.getByTestId("motion-closes")).toHaveText("1");

  await pressOpen(page, "open-motion");
  await expectModal(content);
  await expect(content).toHaveAttribute("data-present", "");
  // Reopened from the page on the exit's first frame, so the exit can't end before it.
  const reopened = content.evaluate(
    (dialog) =>
      new Promise<{ modal: boolean; leaving: boolean }>((resolve) => {
        function frame(): void {
          if (!dialog.hasAttribute("data-leaving")) {
            requestAnimationFrame(frame);

            return;
          }

          dialog.querySelector<HTMLButtonElement>('[data-testid="motion-reopen"]')!.click();
          resolve({ modal: dialog.matches(":modal"), leaving: true });
        }

        requestAnimationFrame(frame);
      }),
  );

  await page.getByTestId("motion-close").click();
  expect(await reopened).toEqual({ modal: true, leaving: true });
  await expect(content).not.toHaveAttribute("data-leaving");
  await elapse(page, 400);
  expect(await modal(content)).toBe(true);
  await expect(content).toHaveAttribute("data-present", "");
  await expect(page.getByTestId("motion-closes")).toHaveText("1");

  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(page.getByTestId("motion-closes")).toHaveText("2");

  const basic = page.getByTestId("basic-content");

  await script(page, "open-basic");
  await expectModal(basic);
  await page.getByTestId("basic-close").click();
  await settle(page);
  await settle(page);
  expect(await modal(basic)).toBe(false);
});

test("Y3: falsifier — Escape with a Popover open inside a Dialog closes only the Popover and the native cancel never fires; the next Escape closes the Dialog; a Tooltip inside closes first and is hidden when the Dialog closes", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const content = page.getByTestId("layered-content");
  const popover = page.getByTestId("inner-popover-content");
  const tooltip = page.getByTestId("inner-tooltip-content");
  const state = page.getByTestId("layered-state");
  const cancels = page.getByTestId("layered-cancels");

  await page.getByTestId("open-layered").scrollIntoViewIfNeeded();
  await script(page, "open-layered");
  await expectModal(content);
  await page.getByTestId("inner-popover-trigger").click();
  await expect.poll(() => popover.evaluate((node) => node.matches(":popover-open"))).toBe(true);
  await expect(state).toHaveText("true true false");

  await page.keyboard.press("Escape");
  await expect(state).toHaveText("true false false");
  await expect.poll(() => popover.evaluate((node) => node.matches(":popover-open"))).toBe(false);
  expect(await modal(content)).toBe(true);
  await expect(cancels).toHaveText("0");

  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(state).toHaveText("false false false");
  await expect(cancels).toHaveText("0");

  await script(page, "open-layered");
  await expectModal(content);
  await page.getByTestId("layered-open-tooltip").click();
  await expect.poll(() => tooltip.evaluate((node) => node.matches(":popover-open"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(state).toHaveText("true false false");
  expect(await modal(content)).toBe(true);
  await page.getByTestId("layered-open-tooltip").click();
  await expect.poll(() => tooltip.evaluate((node) => node.matches(":popover-open"))).toBe(true);

  // A close request hides the Tooltip at once and keeps its intent.
  await page.getByTestId("layered-close").click();
  await expect.poll(() => tooltip.evaluate((node) => node.matches(":popover-open"))).toBe(false);
  await expectClosed(content);
  await expect(state).toHaveText("false false true");
  await expect(cancels).toHaveText("0");

  // A Popover already leaving, with a longer exit than the Dialog's, finishes its own exit while
  // the Dialog retains its exit, and is hidden no later than the Dialog's native close.
  const retained = page.getByTestId("retained-content");

  await script(page, "open-retained");
  await expectModal(retained);
  await page.getByTestId("retained-popover-trigger").click();
  await expect
    .poll(() =>
      page
        .getByTestId("retained-popover-content")
        .evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(true);

  // In the page: close the Popover, close the Dialog on the Popover's first leaving frame, and
  // observe the Popover when the dialog loses `open`.
  const observed = await retained.evaluate(
    (dialog) =>
      new Promise<{ sharedExit: boolean; shownAtClose: boolean }>((resolve, reject) => {
        const popover = dialog.querySelector('[data-testid="retained-popover-content"]')!;
        const button = (id: string) =>
          dialog.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
        let closing = false;
        let sharedExit = false;
        const timeout = setTimeout(
          () => reject(new Error("The dialog did not close within 5 s")),
          5000,
        );
        const observer = new MutationObserver(() => {
          if (!dialog.hasAttribute("open")) {
            observer.disconnect();
            clearTimeout(timeout);
            resolve({ sharedExit, shownAtClose: popover.matches(":popover-open") });
          }
        });

        function frame(): void {
          if (!dialog.hasAttribute("open")) {
            return;
          }

          if (!closing && popover.hasAttribute("data-leaving")) {
            closing = true;
            button("retained-close").click();
          } else if (
            closing &&
            dialog.hasAttribute("data-leaving") &&
            popover.matches(":popover-open")
          ) {
            sharedExit = true;
          }

          requestAnimationFrame(frame);
        }

        observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
        button("retained-close-popover").click();
        requestAnimationFrame(frame);
      }),
  );

  expect(observed).toEqual({ sharedExit: true, shownAtClose: false });
  await expectClosed(retained);
  await expect(page.getByTestId("retained-state")).toHaveText("false false");
});

test("Y4: a native close request is handled like Escape and respects dismissible; a method=dialog submit and a direct close() close without an exit and write the model", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const content = page.getByTestId("basic-content");
  const open = page.getByTestId("basic-open");

  await page.getByTestId("open-basic").scrollIntoViewIfNeeded();
  await script(page, "open-basic");
  await expectModal(content);
  await page.getByTestId("basic-request-close").click();
  await expectClosed(content);
  await expect(open).toHaveText("false");
  await expect(page.getByTestId("basic-cancels")).toHaveText("1");

  await script(page, "open-basic");
  await expectModal(content);
  await page.getByTestId("basic-dismissible").click();
  await expect(page.getByTestId("basic-state")).toHaveText("true false true");
  await page.getByTestId("basic-request-close").click();
  await page.keyboard.press("Escape");
  await clickBackdrop(page);
  await elapse(page, 100);
  expect(await modal(content)).toBe(true);
  await expect(open).toHaveText("true");
  await page.getByTestId("basic-dismissible").click();
  await expect(page.getByTestId("basic-state")).toHaveText("true true true");

  await page.getByTestId("basic-submit").click();
  await expectClosed(content);
  await expect(open).toHaveText("false");
  await expect(page.getByTestId("basic-state")).toHaveText("false true false");

  await script(page, "open-basic");
  await expectModal(content);
  await page.getByTestId("basic-native-close").click();
  await expectClosed(content);
  await expect(open).toHaveText("false");

  // A finite host animation that survives the native close doesn't keep Content's Presence.
  await script(page, "open-basic");
  await expectModal(content);
  await expect(content).toHaveAttribute("data-present", "");
  await content.evaluate((node) => {
    node.animate([{ opacity: 1 }, { opacity: 0.8 }], { duration: 60_000 }).pause();
  });
  await page.getByTestId("basic-native-close").click();
  await expectClosed(content);
  await expect(open).toHaveText("false");
  await expect(page.getByTestId("basic-state")).toHaveText("false true false");
  await expect(page.getByTestId("basic-gated")).toHaveCount(0);
  await content.evaluate((node) => {
    for (const animation of node.getAnimations()) {
      animation.cancel();
    }
  });

  // Routed like Escape inside the Dialog: an open Popover inside closes first.
  const layered = page.getByTestId("layered-content");

  await script(page, "open-layered");
  await expectModal(layered);
  await page.getByTestId("inner-popover-trigger").click();
  await expect(page.getByTestId("layered-state")).toHaveText("true true false");
  await layered.evaluate((node: HTMLDialogElement) => node.requestClose());
  await expect(page.getByTestId("layered-state")).toHaveText("true false false");
  expect(await modal(layered)).toBe(true);
  await layered.evaluate((node: HTMLDialogElement) => node.requestClose());
  await expectClosed(layered);

  // As Escape: a Tooltip inside, outside the Dialog's dismissal branch, closes first too.
  await script(page, "open-layered");
  await expectModal(layered);
  await page.getByTestId("layered-open-tooltip").click();
  await expect(page.getByTestId("layered-state")).toHaveText("true false true");
  await layered.evaluate((node: HTMLDialogElement) => node.requestClose());
  await expect(page.getByTestId("layered-state")).toHaveText("true false false");
  await expect
    .poll(() =>
      page.getByTestId("inner-tooltip-content").evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(false);
  expect(await modal(layered)).toBe(true);
  await layered.evaluate((node: HTMLDialogElement) => node.requestClose());
  await expectClosed(layered);
  await expect(page.getByTestId("layered-state")).toHaveText("false false false");
});

test("Y5: a backdrop click dismisses the topmost dialog; a drag from inside doesn't; with a Popover open inside only the Popover closes, while a Tooltip doesn't defer; dismissible false vetoes it; nested and sibling dialogs stack and share one scroll lock; requestClose() on the outer closes its own branch", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const basic = page.getByTestId("basic-content");

  await script(page, "open-basic");
  await expectModal(basic);
  await clickBackdrop(page);
  await expectClosed(basic);
  await expect(page.getByTestId("basic-open")).toHaveText("false");

  await script(page, "open-basic");
  await expectModal(basic);

  const input = await page.getByTestId("basic-input").boundingBox();

  await page.mouse.move(input!.x + 4, input!.y + 4);
  await page.mouse.down();
  await page.mouse.move(8, 8, { steps: 4 });
  await page.mouse.up();
  await elapse(page, 100);
  expect(await modal(basic)).toBe(true);
  await page.getByTestId("basic-close").click();
  await expectClosed(basic);

  const layered = page.getByTestId("layered-content");
  const state = page.getByTestId("layered-state");

  await script(page, "open-layered");
  await expectModal(layered);
  await page.getByTestId("inner-popover-trigger").click();
  await expect(state).toHaveText("true true false");
  await clickBackdrop(page);
  await expect(state).toHaveText("true false false");
  await elapse(page, 100);
  expect(await modal(layered)).toBe(true);
  await clickBackdrop(page);
  await expectClosed(layered);
  await expect(state).toHaveText("false false false");

  await script(page, "open-layered");
  await expectModal(layered);
  await page.getByTestId("layered-open-tooltip").click();
  await expect(state).toHaveText("true false true");
  await clickBackdrop(page);
  await expectClosed(layered);
  await expect(state).toHaveText("false false false");

  await script(page, "layered-dismissible");
  await script(page, "open-layered");
  await expectModal(layered);
  await clickBackdrop(page);
  await elapse(page, 100);
  expect(await modal(layered)).toBe(true);
  await page.getByTestId("layered-close").click();
  await expectClosed(layered);
  await script(page, "layered-dismissible");

  const outer = page.getByTestId("outer-content");
  const inner = page.getByTestId("inner-content");
  const sibling = page.getByTestId("sibling-content");
  const nested = page.getByTestId("nested-state");

  await page.evaluate(() => {
    document.documentElement.style.overflow = "scroll";
  });
  await script(page, "open-outer");
  await expectModal(outer);
  expect(await rootOverflow(page)).toBe("hidden");
  await page.getByTestId("open-inner").click();
  await expectModal(inner);
  expect(await blocked(page.getByTestId("open-sibling"))).toBe(true);
  await clickBackdrop(page);
  await expectClosed(inner);
  await expect(nested).toHaveText("true false false");
  expect(await modal(outer)).toBe(true);
  expect(await rootOverflow(page)).toBe("hidden");

  await page.getByTestId("open-sibling").click();
  await expectModal(sibling);
  await page.getByTestId("sibling-inside").click();
  await elapse(page, 100);
  await expect(nested).toHaveText("true false true");
  await clickBackdrop(page);
  await expectClosed(sibling);
  await expect(nested).toHaveText("true false false");
  expect(await rootOverflow(page)).toBe("hidden");
  await clickBackdrop(page);
  await expectClosed(outer);
  await expect(nested).toHaveText("false false false");
  expect(await rootOverflow(page)).toBe("scroll");

  // `requestClose()` on the outer under the sibling closes the outer's own branch, not the topmost.
  await script(page, "open-outer");
  await expectModal(outer);
  await page.getByTestId("open-sibling").click();
  await expectModal(sibling);
  await outer.evaluate((node: HTMLDialogElement) => node.requestClose());
  await expectClosed(outer);
  await expect(nested).toHaveText("false false true");
  expect(await modal(sibling)).toBe(true);
  expect(await rootOverflow(page)).toBe("hidden");
  await clickBackdrop(page);
  await expectClosed(sibling);
  await expect(nested).toHaveText("false false false");
  expect(await rootOverflow(page)).toBe("scroll");
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("overflow");
  });

  // Each longhand alone comes back too; the shorthand reads empty for either.
  for (const [axis, value] of [
    ["overflow-y", "scroll"],
    ["overflow-x", "hidden"],
  ] as const) {
    await page.evaluate(
      ([axis, value]) => {
        document.documentElement.style.setProperty(axis, value);
      },
      [axis, value] as const,
    );
    await script(page, "open-basic");
    await expectModal(basic);
    expect(await rootOverflow(page)).toBe("hidden");
    await page.getByTestId("basic-close").click();
    await expectClosed(basic);
    expect(
      await page.evaluate(() => {
        const style = document.documentElement.style;

        return { x: style.overflowX, y: style.overflowY };
      }),
    ).toEqual(axis === "overflow-y" ? { x: "", y: value } : { x: value, y: "" });
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("overflow");
    });
  }
});

test("Y6: Content's aria-labelledby names registered Titles, also from a child component, and keeps a static value without one; Descriptions share aria-describedby with a co-applied Tooltip Trigger", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const child = page.getByTestId("child-named-content");

  await expect(child).toHaveAttribute(
    "aria-labelledby",
    (await page.getByTestId("child-title").getAttribute("id"))!,
  );
  await expect(child).toHaveAttribute(
    "aria-describedby",
    (await page.getByTestId("child-description").getAttribute("id"))!,
  );

  const named = page.getByTestId("static-named-content");

  await expect(named).toHaveAttribute("aria-labelledby", "toggled-title");
  await script(page, "toggle-title");
  await expect(named).toHaveAttribute("aria-labelledby", "static-label");
  await script(page, "toggle-title");
  await expect(named).toHaveAttribute("aria-labelledby", "toggled-title");

  await expect(page.getByTestId("described-content")).toHaveAttribute(
    "aria-describedby",
    "described-description described-tip",
  );
});

test("Y7: focus returns to returnFocus when it takes focus, otherwise natively, then to the Trigger when focus was lost; Content removed while modal ends the session and returns focus", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const content = page.getByTestId("focus-content");
  const trigger = page.getByTestId("focus-trigger");
  const next = page.getByTestId("focus-next");

  await pressOpen(page, "focus-trigger");
  await expectModal(content);
  await expect(page.getByTestId("focus-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(trigger).toBeFocused();

  await pressOpen(page, "focus-trigger");
  await expectModal(content);
  await page.getByTestId("focus-return-next").click();
  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(next).toBeFocused();

  await script(page, "disable-next");
  await pressOpen(page, "focus-trigger");
  await expectModal(content);
  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(trigger).toBeFocused();
  await script(page, "disable-next");

  await pressOpen(page, "focus-trigger");
  await expectModal(content);
  expect(await rootOverflow(page)).toBe("hidden");
  await page.getByTestId("focus-unmount").click();
  await expect(content).toHaveCount(0);
  await expect(page.getByTestId("focus-state")).toHaveText("true false");
  expect(await rootOverflow(page)).toBe("");
  await expect(next).toBeFocused();
  expect(await blocked(page.getByTestId("remount-focus"))).toBe(false);

  // Intent survives the removal: remounted Content opens again.
  await script(page, "remount-focus");
  await expectModal(content);
  await page.getByTestId("focus-return-none").click();
  await page.getByTestId("focus-unmount").click();
  await expect(content).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await script(page, "remount-focus");
  await expectModal(content);
  await page.keyboard.press("Escape");
  await expectClosed(content);

  // Opened while nothing has focus: the browser returns focus to the body, so the Trigger gets it.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await script(page, "open-focus");
  await expectModal(content);
  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(trigger).toBeFocused();

  // A returnFocus the still-modal outer dialog blocks doesn't take focus: with nothing restored,
  // the inner dialog's Trigger gets it.
  const outer = page.getByTestId("outer-content");
  const inner = page.getByTestId("inner-content");

  await script(page, "open-outer");
  await expectModal(outer);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await script(page, "open-inner");
  await expectModal(inner);
  await page.keyboard.press("Escape");
  await expectClosed(inner);
  await expect(page.getByTestId("inner-trigger")).toBeFocused();
  await expect(page.getByTestId("outside")).not.toBeFocused();
  expect(await modal(outer)).toBe(true);
  await page.keyboard.press("Escape");
  await expectClosed(outer);

  // Trigger and Content in a ShadowDom component's shadow root, opened while nothing has focus:
  // the document reports the component host, yet focus is lost, so the Trigger gets it. Then with
  // focus on a light-DOM child slotted into that dialog.
  for (const id of ["shadow-focus", "slotted-focus"]) {
    const host = page.getByTestId(id);
    const shadowContent = host.getByTestId("shadow-focus-content");

    // The focused element itself: blurring a shadow host doesn't blur its shadow root's in Firefox.
    await page.evaluate(() => {
      let active = document.activeElement;

      while (active?.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement;
      }

      (active as HTMLElement | null)?.blur();
    });
    await script(page, `open-${id}`);
    await expectModal(shadowContent);

    if (id === "slotted-focus") {
      await page.getByTestId("slotted-focus-target").focus();
    }

    await page.keyboard.press("Escape");
    await expectClosed(shadowContent);
    await expect(host.getByTestId("shadow-focus-trigger")).toBeFocused();
  }
});

test("Y8: a Dialog requested open renders without the open attribute on the server and opens modally after eager hydration, or only once its block hydrates incrementally, keeping server nodes and IDs", async ({
  page,
}, info) => {
  const release = await bootstrapHeld(page, "/dialog-open", info);
  const content = page.getByTestId("ssr-content");

  try {
    await expect(content).not.toHaveAttribute("open");
    await expect(content).toHaveAttribute("data-present", "");
    await expect(page.getByTestId("ssr-child")).toHaveCount(1);
    await expect(content).toHaveAttribute(
      "aria-labelledby",
      (await page.getByTestId("ssr-title").getAttribute("id"))!,
    );
    await expect(content).toHaveAttribute(
      "aria-describedby",
      (await page.getByTestId("ssr-description").getAttribute("id"))!,
    );
    expect(await modal(content)).toBe(false);
  } finally {
    release();
  }

  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");

  if (info.project.metadata.hydration === "incremental") {
    await settle(page);
    expect(await modal(content)).toBe(false);
    await page.getByTestId("hydrate-open").click();
  }

  await expectModal(content);
  await expect(page.getByTestId("ssr-open")).toHaveText("true");
  await assertReferences(page, info);
  await stopRetentionObservation(page);

  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(page.getByTestId("ssr-open")).toHaveText("false");
  await expect(page.getByTestId("ssr-child")).toHaveCount(0);
});

test("Y9: replaced root and Content Options drive the dialog over contradicting own inputs without emitting the unused model's output; a component that is the root through hostDirectives closes itself", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const factory = page.getByTestId("factory-content");

  await settle(page);
  expect(await modal(factory)).toBe(false);
  await expect(factory).toHaveAttribute("id", "factory-dialog-content");
  await page.getByTestId("open-factory").scrollIntoViewIfNeeded();
  await script(page, "open-factory");
  await expectModal(factory);
  await page.keyboard.press("Escape");
  await elapse(page, 100);
  expect(await modal(factory)).toBe(true);
  await page.getByTestId("factory-close").click();
  await expectClosed(factory);
  await expect(page.getByTestId("factory-state")).toHaveText("false 0");

  const composed = page.getByTestId("composed-content");

  await script(page, "open-composed");
  await expectModal(composed);
  await expect(page.getByTestId("composed-state")).toHaveText("true true");
  await page.getByTestId("composed-apply").click();
  await expectClosed(composed);
  await expect(page.getByTestId("composed-open")).toHaveText("false");
});

test("Y10: a Dialog natively closed while a Dialog inside its Content is still requested open is reported once through ErrorHandler and leaves the inner as it was; closing both in one turn reports nothing and ends a longer inner exit with the outer's native close", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  const reports = async (): Promise<number> => {
    await drainIssues();

    return runtimeErrors.records.length;
  };

  runtimeErrors.expectExactly([
    {
      description: "an open-nested-Dialog Error for the outer closed over the open inner",
      matches: isOpenNested,
    },
    {
      description: "an open-nested-Dialog Error for the inner opened during the outer's exit",
      matches: isOpenNested,
    },
  ]);
  await fixture(page, "dialog", info);

  const outer = page.getByTestId("chain-outer-content");
  const inner = page.getByTestId("chain-inner-content");
  const state = page.getByTestId("chain-state");
  const gated = page.getByTestId("chain-inner-gated");

  await page.getByTestId("open-chain-outer").scrollIntoViewIfNeeded();
  await script(page, "open-chain-outer");
  await expectModal(outer);
  await page.getByTestId("open-chain-inner").click();
  await expectModal(inner);
  await outer.evaluate((node: HTMLDialogElement) => node.requestClose());
  await expectClosed(outer);
  await elapse(page, 100);
  await expect(state).toHaveText("false true");
  expect(await modal(inner)).toBe(true);
  await expect(inner).toHaveAttribute("data-present");
  await expect(gated).toHaveCount(1);
  await script(page, "close-chain-inner");
  await expectClosed(inner);
  await expect(state).toHaveText("false false");
  expect(await reports()).toBe(1);

  // A native close request on the outer, then the inner closed, in one handler: not an error.
  await script(page, "open-chain-outer");
  await expectModal(outer);
  await page.getByTestId("open-chain-inner").click();
  await expectModal(inner);
  await page.getByTestId("request-close-chain-both").click();
  await expectClosed(outer);
  await expectClosed(inner);
  await expect(state).toHaveText("false false");
  await expect(page.locator(":modal")).toHaveCount(0);
  expect(await reports()).toBe(1);

  // The inner opened during the outer's exit: reported at the outer's native close.
  await script(page, "open-chain-outer");
  await expectModal(outer);

  const openedDuringExit = await outer.evaluate(
    (dialog: HTMLDialogElement) =>
      new Promise<{ outerOpen: boolean; outerLeaving: boolean }>((resolve, reject) => {
        const close = dialog.querySelector('[data-testid="close-chain-outer"]');
        const open = dialog.querySelector('[data-testid="open-chain-inner"]');

        if (!(close instanceof HTMLButtonElement) || !(open instanceof HTMLButtonElement)) {
          reject(new Error("Expected the chain fixture buttons"));

          return;
        }

        close.click();

        const waitForExit = (): void => {
          if (!dialog.hasAttribute("data-leaving")) {
            requestAnimationFrame(waitForExit);

            return;
          }

          open.click();
          resolve({ outerOpen: dialog.open, outerLeaving: dialog.hasAttribute("data-leaving") });
        };

        requestAnimationFrame(waitForExit);
      }),
  );

  expect(openedDuringExit).toEqual({ outerOpen: true, outerLeaving: true });
  await expectModal(inner);
  await expectClosed(outer);
  await elapse(page, 100);
  await expect(state).toHaveText("false true");
  expect(await modal(inner)).toBe(true);
  await expect(inner).toHaveAttribute("data-present");
  await expect(gated).toHaveCount(1);
  expect(await reports()).toBe(2);
  await script(page, "close-chain-inner");
  await expectClosed(inner);
  await expect(state).toHaveText("false false");

  await script(page, "open-chain-outer");
  await expectModal(outer);
  await page.getByTestId("open-chain-inner").click();
  await expectModal(inner);

  // Mutation records keep their order: the inner's exit ends only after the outer loses `open`.
  const closed = outer.evaluate(
    (dialog: HTMLDialogElement) =>
      new Promise<{ innerLeaving: boolean; modals: number }>((resolve, reject) => {
        const innerDialog = dialog.querySelector("dialog");
        const timeout = setTimeout(
          () => reject(new Error("The dialog did not close within 5 s")),
          5000,
        );
        let innerLeft = false;
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            if (
              record.target === innerDialog &&
              record.attributeName === "data-leaving" &&
              record.oldValue !== null
            ) {
              innerLeft = true;
            }

            if (record.target === dialog && record.attributeName === "open" && !dialog.open) {
              clearTimeout(timeout);
              observer.disconnect();
              resolve({
                innerLeaving: !innerLeft,
                modals: dialog.ownerDocument.querySelectorAll(":modal").length,
              });

              return;
            }
          }
        });

        observer.observe(dialog, {
          attributes: true,
          attributeFilter: ["open", "data-leaving"],
          attributeOldValue: true,
          subtree: true,
        });
      }),
  );

  await script(page, "close-chain-both");
  expect(await closed).toEqual({ innerLeaving: true, modals: 0 });
  await expectClosed(inner);
  await expect(state).toHaveText("false false");
  await expect(gated).toHaveCount(0);
  await expect(inner).not.toHaveAttribute("data-leaving");
  expect(await reports()).toBe(2);
});

test("Y11: a background Popover opened by model while a Dialog is modal, also not dismissible or during the Dialog's exit, neither takes nor vetoes the Dialog's Escape", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const content = page.getByTestId("covered-content");
  const background = page.getByTestId("background-content");
  const state = page.getByTestId("covered-state");
  const shown = () => background.evaluate((node) => node.matches(":popover-open"));

  // Opened later than the Dialog, so it would be the most recently ordered layer.
  await page.getByTestId("open-covered").scrollIntoViewIfNeeded();
  await script(page, "open-covered");
  await expectModal(content);
  await page.getByTestId("covered-open-background").click();
  await expect.poll(shown).toBe(true);
  await expect(state).toHaveText("true true true");
  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(state).toHaveText("false true true");
  expect(await shown()).toBe(true);

  // Without a modal Dialog, it takes Escape again.
  await page.keyboard.press("Escape");
  await expect(state).toHaveText("false false true");
  await expect.poll(shown).toBe(false);

  // Not dismissible, it would veto the Escape.
  await script(page, "background-dismissible");
  await script(page, "open-covered");
  await expectModal(content);
  await page.getByTestId("covered-open-background").click();
  await expect.poll(shown).toBe(true);
  await expect(state).toHaveText("true true false");
  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(state).toHaveText("false true false");
  await script(page, "background-dismissible");
  await script(page, "close-background");
  await expect.poll(shown).toBe(false);

  // Opened during the Dialog's 1500 ms exit, while the dialog is still modal.
  await script(page, "open-covered");
  await expectModal(content);
  await page.getByTestId("covered-close-open-background").click();
  await expect.poll(shown).toBe(true);
  await expect(content).toHaveAttribute("data-leaving");
  expect(await modal(content)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(state).toHaveText("false true true");
  await expectClosed(content);
  await expect(state).toHaveText("false true true");
  expect(await shown()).toBe(true);
});

test("Y12: a Tooltip or a Popover in a shadow root inside a Dialog, or assigned to a slot inside a shadow-root Dialog, takes the first Escape and close request, and the next closes the Dialog; one out of the flat tree never does", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const shown = (part: Locator) => () => part.evaluate((node) => node.matches(":popover-open"));
  const escape = () => page.keyboard.press("Escape");

  for (const name of ["shadowed", "slotted"] as const) {
    const content = page.getByTestId(`${name}-content`);
    const state = page.getByTestId(`${name}-state`);
    const tooltip = page.getByTestId(
      name === "shadowed" ? "shadow-tooltip-content" : "slotted-tooltip-content",
    );
    const popover = page.getByTestId(
      name === "shadowed" ? "shadow-popover-content" : "slotted-popover-content",
    );
    const requestClose = () => content.evaluate((node: HTMLDialogElement) => node.requestClose());

    await page.getByTestId(`open-${name}`).scrollIntoViewIfNeeded();

    if (name === "shadowed") {
      expect(await tooltip.evaluate((node) => node.getRootNode() instanceof ShadowRoot)).toBe(true);
      expect(await popover.evaluate((node) => node.getRootNode() instanceof ShadowRoot)).toBe(true);
    } else {
      // Light-DOM parts whose ancestor is assigned to a slot in the shadow-root <dialog>.
      expect(await content.evaluate((node) => node.getRootNode() instanceof ShadowRoot)).toBe(true);
      for (const part of [tooltip, popover]) {
        expect(
          await part.evaluate(
            (node) => node.getRootNode() === document && node.assignedSlot === null,
          ),
        ).toBe(true);
        expect(
          await part.evaluate(
            (node) => (node.parentElement?.assignedSlot?.closest("dialog") ?? null) !== null,
          ),
        ).toBe(true);
      }
    }

    for (const [open, part, expected] of [
      [`${name}-open-tooltip`, tooltip, "true true false"],
      [`${name}-open-popover`, popover, "true false true"],
    ] as const) {
      for (const close of [escape, requestClose]) {
        await script(page, `open-${name}`);
        await expectModal(content);
        await script(page, open);
        await expect.poll(shown(part)).toBe(true);
        await expect(state).toHaveText(expected);

        await close();
        await expect(state).toHaveText("true false false");
        await expect.poll(shown(part)).toBe(false);
        expect(await modal(content)).toBe(true);

        await close();
        await expectClosed(content);
        await expect(state).toHaveText("false false false");
      }
    }

    // D3: a foreground Popover takes the first backdrop click, also when it's slotted, and a
    // Tooltip doesn't defer.
    await script(page, `open-${name}`);
    await expectModal(content);
    await script(page, `${name}-open-popover`);
    await expect.poll(shown(popover)).toBe(true);
    await clickBackdrop(page);
    await expect(state).toHaveText("true false false");
    await expect.poll(shown(popover)).toBe(false);
    expect(await modal(content)).toBe(true);
    await clickBackdrop(page);
    await expectClosed(content);
    await expect(state).toHaveText("false false false");

    await script(page, `open-${name}`);
    await expectModal(content);
    await script(page, `${name}-open-tooltip`);
    await expect.poll(shown(tooltip)).toBe(true);
    await clickBackdrop(page);
    await expectClosed(content);
    await expect(state).toHaveText("false false false");
  }

  // A slotted Popover that isn't dismissible vetoes its own close and still keeps the Dialog open.
  const content = page.getByTestId("slotted-content");
  const state = page.getByTestId("slotted-state");

  await script(page, "slotted-popover-dismissible");
  await script(page, "open-slotted");
  await expectModal(content);
  await script(page, "slotted-open-popover");
  await expect.poll(shown(page.getByTestId("slotted-popover-content"))).toBe(true);
  await clickBackdrop(page);
  await elapse(page, 100);
  await expect(state).toHaveText("true false true");
  expect(await modal(content)).toBe(true);
  await page.getByTestId("slotted-popover-trigger").click();
  await expect(state).toHaveText("true false false");
  await clickBackdrop(page);
  await expectClosed(content);
  await expect(state).toHaveText("false false false");
  await script(page, "slotted-popover-dismissible");

  // A Tooltip's Content leaves the flat tree, and with it the modal, when it loses its slot, or
  // when it's slot fallback content and a node is assigned to that slot. While it's out, its
  // Tooltip stays shown, never takes the Dialog's close request, and its `open` stays true.
  const regioned = page.getByTestId("regioned-content");
  const regionedState = page.getByTestId("regioned-state");
  const regionedRequestClose = () =>
    regioned.evaluate((node: HTMLDialogElement) => node.requestClose());

  for (const [open, part, slot, inside, outside] of [
    [
      "regioned-open-region-tooltip",
      page.getByTestId("region-tooltip-content"),
      "region-slot-inactive",
      "true true false",
      "false true false",
    ],
    [
      "regioned-open-fallback-tooltip",
      page.getByTestId("fallback-tooltip-content"),
      "region-slot-extra",
      "true false true",
      "false false true",
    ],
  ] as const) {
    for (const close of [escape, regionedRequestClose]) {
      await script(page, "open-regioned");
      await expectModal(regioned);
      await script(page, open);
      await expect.poll(shown(part)).toBe(true);
      await expect(regionedState).toHaveText(inside);

      // In the flat tree, it takes the first close request.
      await close();
      await expect(regionedState).toHaveText("true false false");
      await expect.poll(shown(part)).toBe(false);
      expect(await modal(regioned)).toBe(true);

      await script(page, open);
      await expect.poll(shown(part)).toBe(true);
      await script(page, slot);
      expect(
        await part.evaluate((node, fallback) => {
          const parent = node.parentElement;

          return fallback
            ? parent instanceof HTMLSlotElement && parent.assignedNodes().length > 0
            : node.assignedSlot === null && parent?.shadowRoot !== null;
        }, slot === "region-slot-extra"),
      ).toBe(true);
      await settle(page);
      expect(await shown(part)()).toBe(true);

      await close();
      await expectClosed(regioned);
      await expect(regionedState).toHaveText(outside);

      await script(page, "regioned-close-tooltips");
      await script(page, "region-slot-visible");
      await expect(regionedState).toHaveText("false false false");
    }
  }
});

test("Y13: a Popover root co-applied with its Content renders on the server, hydrates closed, opens and closes; inside a Dialog it nests under the Dialog", async ({
  page,
}, info) => {
  const coapplied = page.getByTestId("coapplied-content");
  const inner = page.getByTestId("coapplied-inner-content");
  const shown = (part: Locator) => () => part.evaluate((node) => node.matches(":popover-open"));

  await fixture(page, "dialog", info, async () => {
    for (const part of [coapplied, inner]) {
      await expect(part).toHaveAttribute("popover", "manual");
      await expect(part).toHaveAttribute("inert", "");
    }
  });

  const state = page.getByTestId("coapplied-state");

  expect(await shown(coapplied)()).toBe(false);
  await expect(state).toHaveText("false");
  await script(page, "open-coapplied");
  await expect.poll(shown(coapplied)).toBe(true);
  await expect(state).toHaveText("true");
  await page.keyboard.press("Escape");
  await expect.poll(shown(coapplied)).toBe(false);
  await expect(state).toHaveText("false");
  await script(page, "open-coapplied");
  await expect.poll(shown(coapplied)).toBe(true);
  await script(page, "coapplied-trigger");
  await expect.poll(shown(coapplied)).toBe(false);
  await expect(state).toHaveText("false");

  const content = page.getByTestId("coapplied-dialog-content");
  const dialogState = page.getByTestId("coapplied-dialog-state");

  await script(page, "open-coapplied-dialog");
  await expectModal(content);
  await script(page, "coapplied-dialog-open-popover");
  await expect.poll(shown(inner)).toBe(true);
  await expect(dialogState).toHaveText("true true");
  await clickBackdrop(page);
  await expect(dialogState).toHaveText("true false");
  await expect.poll(shown(inner)).toBe(false);
  expect(await modal(content)).toBe(true);

  // The Dialog is its presentation parent: closing the Dialog hides it and keeps its `open`.
  await script(page, "coapplied-dialog-open-popover");
  await expect.poll(shown(inner)).toBe(true);
  await page.getByTestId("coapplied-dialog-close").click();
  await expectClosed(content);
  await expect(dialogState).toHaveText("false true");
  expect(await shown(inner)()).toBe(false);

  await script(page, "open-coapplied-dialog");
  await expectModal(content);
  await expect.poll(shown(inner)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialogState).toHaveText("true false");
  expect(await modal(content)).toBe(true);
  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(dialogState).toHaveText("false false");
});

test("Y14: a Popover root co-applied with Dialog Content nests under that Dialog: a backdrop click and Escape close only the Popover, and closing the Dialog hides it", async ({
  page,
}, info) => {
  await fixture(page, "dialog", info);

  const content = page.getByTestId("hosted-dialog-content");
  const popover = page.getByTestId("hosted-popover-content");
  const state = page.getByTestId("hosted-dialog-state");
  const shown = () => popover.evaluate((node) => node.matches(":popover-open"));

  await script(page, "open-hosted-dialog");
  await expectModal(content);
  await script(page, "hosted-open-popover");
  await expect.poll(shown).toBe(true);
  await expect(state).toHaveText("true true");
  await clickBackdrop(page);
  await expect(state).toHaveText("true false");
  await expect.poll(shown).toBe(false);
  expect(await modal(content)).toBe(true);

  await script(page, "hosted-open-popover");
  await expect.poll(shown).toBe(true);
  await page.keyboard.press("Escape");
  await expect(state).toHaveText("true false");
  await expect.poll(shown).toBe(false);
  expect(await modal(content)).toBe(true);

  // The Dialog is its presentation parent: closing the Dialog hides it and keeps its `open`.
  await script(page, "hosted-open-popover");
  await expect.poll(shown).toBe(true);
  await page.getByTestId("hosted-dialog-close").click();
  await expectClosed(content);
  await expect(state).toHaveText("false true");
  expect(await shown()).toBe(false);

  await script(page, "open-hosted-dialog");
  await expectModal(content);
  await expect.poll(shown).toBe(true);
  await page.keyboard.press("Escape");
  await expect(state).toHaveText("true false");
  expect(await modal(content)).toBe(true);
  await page.keyboard.press("Escape");
  await expectClosed(content);
  await expect(state).toHaveText("false false");
});

test("Y15: a Tooltip and a Popover projected through <ng-content> into a wrapper's <dialog>, or slotted into a shadow-root one, nest under that Dialog: Escape, close requests and backdrop clicks reach them first; the Dialog's close request hides them and keeps their open, and during its exit they take no Escape or close request; they present again when it reopens; a projected Dialog still open at the wrapper's native close is reported", async ({
  page,
  runtimeErrors,
  drainIssues,
}, info) => {
  runtimeErrors.expectExactly([
    {
      description: "an open-nested-Dialog Error for the wrapper closed over the projected inner",
      matches: isOpenNested,
    },
  ]);
  await fixture(page, "dialog", info);

  const shown = (part: Locator) => () => part.evaluate((node) => node.matches(":popover-open"));
  const escape = () => page.keyboard.press("Escape");

  await script(page, "slotted-motion");

  for (const name of ["projected", "slotted"] as const) {
    const content = page.getByTestId(`${name}-content`);
    const state = page.getByTestId(`${name}-state`);
    const tooltip = page.getByTestId(`${name}-tooltip-content`);
    const popover = page.getByTestId(`${name}-popover-content`);
    const requestClose = () => content.evaluate((node: HTMLDialogElement) => node.requestClose());

    await page.getByTestId(`open-${name}`).scrollIntoViewIfNeeded();

    if (name === "projected") {
      // Declared in the fixture's view, rendered inside the wrapper's <dialog> by projection.
      for (const part of [tooltip, popover]) {
        expect(
          await part.evaluate(
            (node) => node.closest("dialog")?.getAttribute("data-testid") ?? null,
          ),
        ).toBe("projected-content");
      }
    }

    for (const [open, part, expected] of [
      [`${name}-open-tooltip`, tooltip, "true true false"],
      [`${name}-open-popover`, popover, "true false true"],
    ] as const) {
      for (const close of [escape, requestClose]) {
        await script(page, `open-${name}`);
        await expectModal(content);
        await script(page, open);
        await expect.poll(shown(part)).toBe(true);
        await expect(state).toHaveText(expected);

        await close();
        await expect(state).toHaveText("true false false");
        await expect.poll(shown(part)).toBe(false);
        expect(await modal(content)).toBe(true);

        await close();
        await expectClosed(content);
        await expect(state).toHaveText("false false false");
      }
    }

    await script(page, `open-${name}`);
    await expectModal(content);
    await script(page, `${name}-open-popover`);
    await expect.poll(shown(popover)).toBe(true);
    await clickBackdrop(page);
    await expect(state).toHaveText("true false false");
    await expect.poll(shown(popover)).toBe(false);
    expect(await modal(content)).toBe(true);
    await clickBackdrop(page);
    await expectClosed(content);
    await expect(state).toHaveText("false false false");

    await script(page, `open-${name}`);
    await expectModal(content);
    await script(page, `${name}-open-tooltip`);
    await expect.poll(shown(tooltip)).toBe(true);
    await clickBackdrop(page);
    await expectClosed(content);
    await expect(state).toHaveText("false false false");

    // Both requested open when the Dialog's close is requested by model.
    await script(page, `open-${name}`);
    await expectModal(content);
    await script(page, `${name}-open-popover`);
    await script(page, `${name}-open-tooltip`);
    await expect.poll(shown(popover)).toBe(true);
    await expect.poll(shown(tooltip)).toBe(true);
    await expect(state).toHaveText("true true true");

    // In the page, on the exit's first frame: whether both are hidden, then an Escape keydown and a
    // cancelable close request while the Dialog is still modal.
    const exit = await content.evaluate(
      (dialog: HTMLDialogElement, name) =>
        new Promise<{ hidden: boolean; leaving: boolean; modal: boolean }>((resolve, reject) => {
          const part = (id: string) => document.querySelector(`[data-testid="${id}"]`);
          const close = part(`close-${name}`);
          const parts = [part(`${name}-popover-content`), part(`${name}-tooltip-content`)];
          const deadline = performance.now() + 5000;

          if (!(close instanceof HTMLButtonElement)) {
            reject(new Error("Expected the close button"));

            return;
          }

          const frame = (): void => {
            if (performance.now() > deadline) {
              reject(new Error("The exit did not start within 5 s"));

              return;
            }

            if (!dialog.hasAttribute("data-leaving")) {
              requestAnimationFrame(frame);

              return;
            }

            let hidden = true;

            for (const shownPart of parts) {
              if (shownPart === null || shownPart.matches(":popover-open")) {
                hidden = false;
              }
            }

            (dialog.ownerDocument.activeElement ?? dialog.ownerDocument).dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
            );
            dialog.requestClose();
            resolve({
              hidden,
              leaving: dialog.hasAttribute("data-leaving"),
              modal: dialog.matches(":modal"),
            });
          };

          close.click();
          requestAnimationFrame(frame);
        }),
      name,
    );

    expect(exit).toEqual({ hidden: true, leaving: true, modal: true });
    await expectClosed(content);
    await expect(state).toHaveText("false true true");
    expect(await shown(popover)()).toBe(false);
    expect(await shown(tooltip)()).toBe(false);

    await script(page, `open-${name}`);
    await expectModal(content);
    await expect.poll(shown(popover)).toBe(true);
    await expect.poll(shown(tooltip)).toBe(true);
    await expect(state).toHaveText("true true true");
    await escape();
    await escape();
    await expect(state).toHaveText("true false false");
    expect(await modal(content)).toBe(true);
    await escape();
    await expectClosed(content);
    await expect(state).toHaveText("false false false");
  }

  // A Dialog projected into the wrapper's <dialog> is nested in it.
  const content = page.getByTestId("projected-content");
  const inner = page.getByTestId("projected-inner-content");

  await script(page, "open-projected");
  await expectModal(content);
  await script(page, "projected-open-inner");
  await expectModal(inner);
  await content.evaluate((node: HTMLDialogElement) => node.requestClose());
  await expectClosed(content);
  await elapse(page, 100);
  expect(await modal(inner)).toBe(true);
  await expect(page.getByTestId("projected-inner-state")).toHaveText("true");
  await drainIssues();
  expect(runtimeErrors.records.length).toBe(1);
  await script(page, "projected-close-inner");
  await expectClosed(inner);
  await expect(page.getByTestId("projected-inner-state")).toHaveText("false");
});
