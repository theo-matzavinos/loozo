import { test, expect } from "./contract-test.js";
import { bootstrapHeld, fixture, stopRetentionObservation } from "./observation.js";
import type { Locator } from "playwright/test";

const core = (page: Parameters<typeof fixture>[0], info: Parameters<typeof fixture>[2]) =>
  fixture(page, "core", info);

/**
 * A wrong write would render only after the zoneless scheduler's next turn (an animation frame
 * or a timer), so let both pass before asserting it never happened.
 */
async function settle(page: Parameters<typeof fixture>[0]): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
  );
}

test("C1 C2 C3: keyed collection insert/remove read DOM order, a keyed move notifies no reader, reactive values exclude nested owners", async ({
  page,
}, info) => {
  await core(page, info);
  await expect(page.getByTestId("collection-values")).toHaveText("one,two,original");

  const keyed = await page.locator('[data-item-key="one"]').elementHandle();

  // A keyed move keeps membership, so readers keep the order of the latest membership change.
  await page.getByTestId("reverse-items").click();
  await expect(page.locator("[data-item-key]")).toHaveText(["two", "one"]);
  await expect(page.getByTestId("collection-values")).toHaveText("one,two,original");
  expect(
    await keyed?.evaluate((node) => node === document.querySelector('[data-item-key="one"]')),
  ).toBe(true);
  await page.getByTestId("rename-item").click();
  await expect(page.getByTestId("collection-values")).toHaveText("one,two,renamed");

  const initial = await page.getByTestId("variant-collection-values").textContent();

  expect(initial).toMatch(/^one,two,.+/);

  const generated = initial?.split(",")[2];

  await page.getByTestId("collection-add").click();
  await expect(page.getByTestId("variant-collection-values")).toHaveText(
    `three,one,two,${generated}`,
  );

  const surviving = await page.locator('[data-key="two"]').elementHandle();

  await page.getByTestId("collection-remove").click();
  await expect(page.getByTestId("variant-collection-values")).toHaveText(`three,two,${generated}`);
  await page.getByTestId("collection-move").click();
  await expect(page.getByTestId("variant-collection").locator("[data-key]")).toHaveText([
    "two",
    "three",
  ]);
  await expect(page.getByTestId("variant-collection-values")).toHaveText(`three,two,${generated}`);
  expect(
    await surviving?.evaluate((node) => node === document.querySelector('[data-key="two"]')),
  ).toBe(true);
});

test("C1 C3 C4: a first order read after unread keyed moves and insertion reports rendered order; a later keyed move publishes nothing until membership changes", async ({
  page,
}, info) => {
  await core(page, info);
  await expect(page.getByTestId("late-values")).toHaveText("");
  await page.getByTestId("late-reverse").click();
  await expect(page.locator("[data-late-key]")).toHaveText(["two", "one"]);
  await page.getByTestId("late-insert").click();
  await expect(page.locator("[data-late-key]")).toHaveText(["three", "two", "one"]);
  await page.getByTestId("late-read").click();
  await expect(page.getByTestId("late-values")).toHaveText("three,two,one");

  // A later settled render proves the first read's unchanged order was not republished.
  await page.getByTestId("late-unrelated").click();
  await expect(page.getByTestId("late-unrelated-count")).toHaveText("1");
  await expect(page.getByTestId("late-publications")).toHaveText("1");
  await page.getByTestId("late-move").click();
  await expect(page.locator("[data-late-key]")).toHaveText(["one", "three", "two"]);
  await page.getByTestId("late-unrelated").click();
  await expect(page.getByTestId("late-unrelated-count")).toHaveText("2");
  await expect(page.getByTestId("late-values")).toHaveText("three,two,one");
  await expect(page.getByTestId("late-publications")).toHaveText("1");
  // A removal changes membership: readers get current DOM order.
  await page.getByTestId("late-remove").click();
  await expect(page.getByTestId("late-values")).toHaveText("one,two");
  await expect(page.getByTestId("late-publications")).toHaveText("2");
});

test("C3 R4: raw SSR observation and settled present/absent children before bootstrap", async ({
  page,
}, info) => {
  const release = await bootstrapHeld(page, "/core", info);

  try {
    await expect(page.getByTestId("collection-values")).toHaveText("one,two,original");
    await expect(page.getByTestId("variant-collection-values")).toHaveText(/^one,two,.+/);
    await expect(page.getByTestId("variant-presence")).toHaveAttribute("data-present", "");
    await expect(page.getByTestId("variant-presence-child")).toHaveCount(1);
    await expect(page.getByTestId("absent-gated")).toHaveCount(0);
    await expect(page.getByTestId("absent-unconditional")).toHaveCount(1);
    await expect(page.getByTestId("absent-presence")).not.toHaveAttribute("data-entering", "");
  } finally {
    release();
  }
});

for (const motion of ["finite", "none", "zero", "infinite", "mixed"]) {
  test(`R1 R2 L3: real ${motion} animation settlement, retention and write-before-discovery`, async ({
    page,
  }, info) => {
    await core(page, info);
    await page.getByTestId("motion").selectOption(motion);
    await page.getByTestId("variant-present").click();

    if (
      (motion === "finite" || motion === "mixed") &&
      info.project.metadata.motion === "no-preference"
    ) {
      await expect(page.getByTestId("variant-presence")).toHaveAttribute("data-phase", "closing");
      await expect(page.getByTestId("variant-presence-child")).toHaveCount(1);
      await expect
        .poll(() =>
          page.getByTestId("variant-presence").evaluate((node) => node.getAnimations().length),
        )
        .toBeGreaterThan(0);

      const reads = await page.evaluate(() =>
        window.acceptanceObservation.discoveries.filter(
          (item) => item.testid === "variant-presence" && item.leaving,
        ),
      );

      expect(reads.length).toBeGreaterThan(0);

      for (const read of reads) {
        expect(read.children).toBe(2);
        expect(read.hidden).toBe(false);
      }
    }

    await expect(page.getByTestId("variant-presence")).toHaveAttribute("data-phase", "closed");
    await expect(page.getByTestId("variant-presence-child")).toHaveCount(0);
    await expect(page.getByTestId("unconditional-child")).toHaveCount(1);
    await expect(page.getByTestId("variant-presence")).not.toHaveAttribute("hidden", /.*/);
    await expect(page.getByTestId("variant-presence")).not.toHaveAttribute("data-state", /.*/);
    await page.getByTestId("variant-present").click();
    await expect(page.getByTestId("variant-presence")).toHaveAttribute("data-phase", "open");
    await expect(page.getByTestId("variant-presence")).toHaveAttribute("data-present", "");
    await expect(page.getByTestId("variant-presence-child")).toHaveCount(1);

    await page.getByTestId("variant-trigger").click();

    if (
      (motion === "finite" || motion === "mixed") &&
      info.project.metadata.motion === "no-preference"
    ) {
      await expect(page.getByTestId("variant-panel")).toHaveAttribute("data-phase", "closing");
      await expect(page.getByTestId("variant-panel")).not.toHaveAttribute("hidden", /.*/);
      await expect(page.getByTestId("variant-panel")).not.toHaveAttribute("data-expanded", /.*/);
    }

    await expect(page.getByTestId("variant-panel")).toHaveAttribute("data-phase", "closed");
    await expect(page.getByTestId("variant-panel")).toHaveAttribute("hidden", "");
  });
}

test("R2 R3: native finite cancellation, reversal, independent host, destroy/remount", async ({
  page,
}, info) => {
  await core(page, info);
  await page.getByTestId("variant-present").click();

  if (info.project.metadata.motion === "no-preference") {
    await expect(page.getByTestId("variant-presence")).toHaveAttribute("data-phase", "closing");
    await page.getByTestId("variant-presence").evaluate((node) => {
      for (const animation of node.getAnimations()) {
        animation.cancel();
      }
    });
  }

  await expect(page.getByTestId("variant-presence")).toHaveAttribute("data-phase", "closed");
  await page.getByTestId("variant-present").click();
  await page.getByTestId("variant-present").click();
  await page.getByTestId("variant-present").click();
  await expect(page.getByTestId("variant-presence")).toHaveAttribute("data-phase", "open");
  await expect(page.getByTestId("second-presence")).toHaveAttribute("data-phase", "open");
  await page.getByTestId("second-present").click();
  await page.getByTestId("variant-present").click();
  await page.getByTestId("presence-mount").click();
  await expect(page.getByTestId("variant-presence")).toHaveCount(0);
  await page.getByTestId("variant-present").click();
  await page.getByTestId("presence-mount").click();
  await expect(page.getByTestId("variant-presence")).toHaveAttribute("data-phase", "open");
  await expect(page.getByTestId("second-presence")).toHaveAttribute("data-phase", "closed");
});

test("L1: native click/Enter/Space, form type, combined disabled and authoritative writes", async ({
  page,
}, info) => {
  await core(page, info);

  const trigger = page.getByTestId("variant-trigger");

  await expect(trigger).toHaveAttribute("type", "button");
  await trigger.click();
  await expect(page.getByTestId("variant-expanded-outputs")).toHaveText("1");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("variant-expanded-outputs")).toHaveText("2");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("variant-expanded-outputs")).toHaveText("3");
  await expect(page.getByTestId("form-submits")).toHaveText("0");
  await page.getByTestId("variant-disable").click();
  await expect(trigger).toBeDisabled();
  await expect(trigger).toHaveAttribute("aria-disabled", "true");
  await expect(trigger).toHaveAttribute("data-disabled", "");
  await page.getByTestId("variant-script-expand").click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("variant-expanded-outputs")).toHaveText("3");
});

test("L6: a Trigger's own disabled combines with the root's; focusableWhenDisabled keeps its tab stop and still blocks activation", async ({
  page,
}, info) => {
  await core(page, info);

  const part = (role: string) =>
    page.locator(`[data-collapsible-case="trigger-disabled"] [data-role="${role}"]`);
  const trigger = part("trigger");
  const root = part("root");

  /** `native` is the native `disabled`; `disabled` is the effective disabled state. */
  async function expectTrigger(native: boolean, disabled: boolean): Promise<void> {
    await expect(trigger).toHaveJSProperty("disabled", native);

    if (disabled) {
      await expect(trigger).toHaveAttribute("aria-disabled", "true");
      await expect(trigger).toHaveAttribute("data-disabled", "");
    } else {
      await expect(trigger).not.toHaveAttribute("aria-disabled", /.*/);
      await expect(trigger).not.toHaveAttribute("data-disabled", /.*/);
    }
  }

  await expectTrigger(false, false);
  await trigger.click();
  await expect(part("expanded")).toHaveText("true");
  await expect(part("outputs")).toHaveText("1");

  // The Trigger's own disabled leaves the root, its State and its data-disabled enabled.
  await part("trigger-disable").click();
  await expectTrigger(true, true);
  await expect(root).not.toHaveAttribute("data-disabled", /.*/);
  await expect(part("state-disabled")).toHaveText("false");
  await trigger.click({ force: true });
  await settle(page);
  await expect(part("expanded")).toHaveText("true");

  // Focusable while disabled: native Enter, Space and click reach the button but don't toggle.
  await part("focusable").click();
  await expectTrigger(false, true);
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await trigger.click({ force: true });
  await settle(page);
  await expect(part("expanded")).toHaveText("true");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(part("outputs")).toHaveText("1");

  // Application writes stay authoritative and emit no output.
  await part("external").click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(part("outputs")).toHaveText("1");

  // The root's disabled combines with the Trigger's and follows focusableWhenDisabled too.
  await part("root-disable").click();
  await part("trigger-disable").click();
  await expectTrigger(false, true);
  await expect(root).toHaveAttribute("data-disabled", "");
  await expect(part("state-disabled")).toHaveText("true");
  await part("focusable").click();
  await expectTrigger(true, true);
  await part("root-disable").click();
  await expectTrigger(false, false);
  await expect(root).not.toHaveAttribute("data-disabled", /.*/);
  await trigger.click();
  await expect(part("expanded")).toHaveText("true");
  await expect(part("outputs")).toHaveText("2");
});

test("L2 I3: authoritative reactive IDs and mounted-only associations survive role replacement", async ({
  page,
}, info) => {
  await core(page, info);
  await expect(page.getByTestId("variant-trigger")).toHaveAttribute(
    "aria-controls",
    "initial-variant-panel",
  );
  await expect(page.getByTestId("variant-panel")).toHaveAttribute(
    "aria-labelledby",
    "initial-variant-trigger",
  );
  await page.getByTestId("variant-change-ids").click();
  await expect(page.getByTestId("variant-trigger")).toHaveAttribute("id", "replacement-trigger");
  await expect(page.getByTestId("variant-trigger")).toHaveAttribute(
    "aria-controls",
    "replacement-panel",
  );
  await expect(page.getByTestId("variant-panel")).toHaveAttribute(
    "aria-labelledby",
    "replacement-trigger",
  );
  await page.getByTestId("variant-trigger-mount").click();
  await expect(page.getByTestId("variant-panel")).not.toHaveAttribute("aria-labelledby", /.*/);
  await page.getByTestId("variant-trigger-mount").click();
  await expect(page.getByTestId("variant-panel")).toHaveAttribute(
    "aria-labelledby",
    "replacement-trigger",
  );
  await page.getByTestId("variant-panel-mount").click();
  await expect(page.getByTestId("variant-trigger")).not.toHaveAttribute("aria-controls", /.*/);
  await page.getByTestId("variant-panel-mount").click();
  await expect(page.getByTestId("variant-trigger")).toHaveAttribute(
    "aria-controls",
    "replacement-panel",
  );
});

test("L4: ordinary hiding everywhere; actual native find enhancement reported separately", async ({
  page,
}, info) => {
  await core(page, info);
  await page.getByTestId("motion").selectOption("none");
  await page.getByTestId("variant-trigger").click();
  await expect(page.getByTestId("variant-panel")).toHaveAttribute("hidden", "");
  await page.getByTestId("until-found").click();

  const panel = page.getByTestId("variant-panel");
  const trigger = page.getByTestId("variant-trigger");
  const root = page.getByTestId("variant-collapsible");
  const supportsReveal = await panel.evaluate((node) => "onbeforematch" in node);
  let expectedHidden = "";

  if (supportsReveal) {
    expectedHidden = "until-found";
  }

  await expect(panel).toHaveAttribute("hidden", expectedHidden);

  if (supportsReveal) {
    const found = await page.evaluate(() => {
      const native = Reflect.get(window, "find");

      if (typeof native !== "function") {
        return false;
      }

      return Boolean(native.call(window, "origami-find-target-7392"));
    });
    let nativeRevealObserved = false;

    if (found) {
      try {
        await page.waitForFunction(
          () =>
            window.acceptanceObservation.trust.some(
              (event) => event.type === "beforematch" && event.trusted,
            ),
          undefined,
          { timeout: 3000 },
        );
        nativeRevealObserved = true;
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "TimeoutError") {
          throw error;
        }
      }
    }

    if (nativeRevealObserved) {
      await expect(page.getByTestId("variant-trigger")).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByTestId("variant-expanded-outputs")).toHaveText("2");
      await page.evaluate(() => {
        const native = Reflect.get(window, "find");

        if (typeof native === "function") {
          native.call(window, "origami-find-target-7392");
        }
      });
      await expect(page.getByTestId("variant-expanded-outputs")).toHaveText("2");
    } else {
      info.annotations.push({
        type: "optional-enhancement-unproven",
        description:
          "Native window.find did not produce observed trusted beforematch within the bounded observation; synthetic beforematch is not counted as platform evidence.",
      });
    }
  } else {
    await expect(panel).toBeHidden();
  }

  // A real native reveal may have opened it; establish a closed enabled owner before disabled policy.
  if ((await trigger.getAttribute("aria-expanded")) === "true") {
    await trigger.click();
  }

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveAttribute("hidden", expectedHidden);

  // Synthetic event verifies policy only. It is explicitly not native find evidence.
  await page.getByTestId("variant-disable").click();
  await expect(trigger).toHaveJSProperty("disabled", true);
  await expect(trigger).toHaveAttribute("data-disabled", "");
  await expect(root).toHaveAttribute("data-disabled", "");
  await expect(panel).toHaveAttribute("hidden", "");

  const outputs = await page.getByTestId("variant-expanded-outputs").textContent();

  await panel.dispatchEvent("beforematch");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("variant-expanded-outputs")).toHaveText(outputs ?? "");
  await expect(panel).toHaveAttribute("hidden", "");
  await page.getByTestId("variant-disable").click();
  await expect(trigger).toHaveJSProperty("disabled", false);
  await expect(trigger).not.toHaveAttribute("data-disabled", /.*/);
  await expect(root).not.toHaveAttribute("data-disabled", /.*/);
  await expect(panel).toHaveAttribute("hidden", expectedHidden);
});

test("A1: Single selected non-collapsible button remains focusable; unknown values authoritative", async ({
  page,
}, info) => {
  await core(page, info);
  await page.getByTestId("single-billing").click();
  await expect(page.getByTestId("single-value")).toHaveText("billing");
  // ARIA-disabled is intentional; establish native enabledness independently of driver actionability.
  await expect(page.getByTestId("single-billing")).toHaveJSProperty("disabled", false);
  await expect(page.getByTestId("single-billing")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("single-billing")).toHaveAttribute("data-disabled", "");
  await page.getByTestId("single-billing").focus();
  await expect(page.getByTestId("single-billing")).toBeFocused();

  const activation = await page.getByTestId("single-billing").evaluateHandle((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("A1 requires the actual native button host");
    }

    const events: { type: string; trusted: boolean; exactTarget: boolean; key?: string }[] = [];

    button.addEventListener(
      "keydown",
      (event) => {
        events.push({
          type: event.type,
          trusted: event.isTrusted,
          exactTarget: event.target === button,
          key: event.key,
        });
      },
      { once: true, capture: true },
    );
    button.addEventListener(
      "click",
      (event) => {
        events.push({
          type: event.type,
          trusted: event.isTrusted,
          exactTarget: event.target === button,
        });
      },
      { once: true, capture: true },
    );

    return events;
  });

  await page.keyboard.press("Enter");

  const actualActivation = await activation.jsonValue();

  await activation.dispose();
  await info.attach("A1-trusted-native-Enter", {
    body: JSON.stringify(actualActivation),
    contentType: "application/json",
  });
  expect(actualActivation).toEqual([
    { type: "keydown", trusted: true, exactTarget: true, key: "Enter" },
    { type: "click", trusted: true, exactTarget: true },
  ]);
  await expect(page.getByTestId("single-value")).toHaveText("billing");
  await page.getByTestId("single-security").click();
  await expect(page.getByTestId("single-value")).toHaveText("security");
  // Selection moved, so the lock moved with it.
  await expect(page.getByTestId("single-billing")).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(page.getByTestId("single-billing")).not.toHaveAttribute("data-disabled", /.*/);
  await expect(page.getByTestId("single-security")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("single-security")).toHaveAttribute("data-disabled", "");
  await page.getByTestId("toggle-single-collapsible").click();
  await expect(page.getByTestId("single-security")).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(page.getByTestId("single-security")).not.toHaveAttribute("data-disabled", /.*/);
  await page.getByTestId("single-security").click();
  await expect(page.getByTestId("single-value")).toHaveText("");
  await page.getByTestId("set-unknown-single").click();
  await expect(page.getByTestId("single-value")).toHaveText("unmounted");

  // Collapsible Single: trusted Enter selects another item, trusted Space clears it; one output each.
  await page.getByTestId("keyboard-first").click();
  await expect(page.getByTestId("keyboard-value")).toHaveText("first");
  await expect(page.getByTestId("keyboard-outputs")).toHaveText("1");
  await page.getByTestId("keyboard-second").focus();
  await expect(page.getByTestId("keyboard-second")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("keyboard-value")).toHaveText("second");
  await expect(page.getByTestId("keyboard-outputs")).toHaveText("2");
  await expect(page.getByTestId("keyboard-second")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("keyboard-first")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("keyboard-value")).toHaveText("");
  await expect(page.getByTestId("keyboard-outputs")).toHaveText("3");
  await expect(page.getByTestId("keyboard-second")).toHaveAttribute("aria-expanded", "false");
});

test("A2: Multiple frozen caller array, immutable ordered toggles, unknown selection and unmount", async ({
  page,
}, info) => {
  await core(page, info);
  await expect(page.getByTestId("variant-multiple-frozen")).toHaveText("true");
  await page.getByTestId("variant-multiple-billing").click();
  await expect(page.getByTestId("variant-multiple-value")).toHaveText("unmounted,billing");
  await page.getByTestId("variant-multiple-security").click();
  await expect(page.getByTestId("variant-multiple-value")).toHaveText("unmounted,billing,security");
  await page.getByTestId("variant-multiple-billing").click();
  await expect(page.getByTestId("variant-multiple-value")).toHaveText("unmounted,security");
  await expect(page.getByTestId("variant-multiple-outputs")).toHaveText("3");
  await page.getByTestId("variant-multiple-billing").click();
  await page.getByTestId("multiple-mount").click();
  await expect(page.getByTestId("variant-multiple-value")).toHaveText("unmounted,security,billing");
  await expect(page.getByTestId("variant-multiple-original")).toHaveText("unmounted");
  await expect(page.getByTestId("variant-multiple-outputs")).toHaveText("4");
});

test("A3 A4 A5: effective factory setter reentry, combined disabled, mounted order/default values", async ({
  page,
}, info) => {
  await core(page, info);
  await page.getByTestId("single-reentry-arm").click();
  await page.getByTestId("factory-single-billing").click();
  await expect(page.getByTestId("factory-single-value")).toHaveText("security");
  await expect(page.getByTestId("single-setter-history")).toHaveText("security:false");
  await expect(page.getByTestId("factory-single-billing")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("factory-single-security")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByTestId("unused-single-outputs")).toHaveText("0");
  // An already-satisfied effective expansion request is idempotent: no factory setter write.
  // The following ordinary activation proves the setter journal is still live.
  await page.getByTestId("single-idempotent-security").click();
  await page.getByTestId("factory-single-billing").click();
  await expect(page.getByTestId("factory-single-value")).toHaveText("billing");
  await expect(page.getByTestId("single-setter-history")).toHaveText("security:false,billing:true");
  await expect(page.getByTestId("unused-single-outputs")).toHaveText("0");

  const initial = await page.getByTestId("factory-single-values").textContent();
  const generated = initial?.split(",")[2];

  expect(generated).toBeTruthy();
  // A keyed move keeps membership: itemValues keeps the order of the latest membership change.
  await page.getByTestId("single-item-move").click();
  await expect
    .poll(() =>
      page
        .getByTestId("factory-single-security")
        .evaluate((security) =>
          security.compareDocumentPosition(
            document.querySelector('[data-testid="factory-single-billing"]') ?? security,
          ),
        ),
    )
    .toBe(4);
  await expect(page.getByTestId("factory-single-values")).toHaveText(
    `billing,security,${generated}`,
  );
  await page.getByTestId("single-item-remove").click();
  await expect(page.getByTestId("factory-single-values")).toHaveText(`security,${generated}`);
  await page.getByTestId("single-item-remount").click();
  await expect(page.getByTestId("factory-single-values")).toHaveText(
    `billing,security,${generated}`,
  );
  await page.getByTestId("factory-generated-item").click();
  await expect(page.getByTestId("factory-single-value")).toHaveText(generated ?? "");
  await page.getByTestId("single-root-disable").click();
  await expect(page.getByTestId("factory-single-billing")).toBeDisabled();
  await page.getByTestId("single-external").click();
  await expect(page.getByTestId("factory-single-value")).toHaveText("unmounted");
  await page.getByTestId("single-root-disable").click();
  await page.getByTestId("single-item-disable").click();
  await expect(page.getByTestId("factory-single-billing")).toBeDisabled();
  await expect(page.getByTestId("factory-single-billing")).not.toHaveAttribute("role", /.*/);
  await expect(page.getByTestId("factory-single-billing")).not.toHaveAttribute("tabindex", "-1");
  await stopRetentionObservation(page);
});

test("A3: native Accordion reveal attempts and combined disabled policy route through actual Single Options", async ({
  page,
}, info) => {
  await core(page, info);
  await page.getByTestId("single-item-hiding").click();

  const panel = page.getByTestId("factory-single-panel-billing");
  const trigger = page.getByTestId("factory-single-billing");
  const item = trigger.locator("..");

  async function nativeDisabled(): Promise<boolean> {
    return trigger.evaluate((node) => {
      if (!(node instanceof HTMLButtonElement)) {
        throw new Error("Expected actual native Accordion Trigger button");
      }

      return node.disabled;
    });
  }

  const supportsReveal = await panel.evaluate((node) => "onbeforematch" in node);
  let expectedHidden = "";

  if (supportsReveal) {
    expectedHidden = "until-found";
  }

  await expect(panel).toHaveAttribute("hidden", expectedHidden);

  let nativeObserved = false;

  if (supportsReveal) {
    const found = await page.evaluate(() => {
      const find = Reflect.get(window, "find");

      if (typeof find !== "function") {
        return false;
      }

      window.getSelection()?.removeAllRanges();

      return Boolean(find.call(window, "billing-accordion-native-reveal-4816"));
    });

    if (found) {
      try {
        await page.waitForFunction(
          () =>
            window.acceptanceObservation.trust.some(
              (event) => event.type === "beforematch" && event.trusted,
            ),
          undefined,
          { timeout: 3000 },
        );
        nativeObserved = true;
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "TimeoutError") {
          throw error;
        }
      }
    }
  } else {
    await expect(panel).toBeHidden();
  }

  if (nativeObserved) {
    await expect(page.getByTestId("factory-single-value")).toHaveText("billing");
    await page.evaluate(() => {
      const find = Reflect.get(window, "find");

      if (typeof find === "function") {
        window.getSelection()?.removeAllRanges();
        find.call(window, "billing-accordion-native-reveal-4816");
      }
    });
    await expect(page.getByTestId("factory-single-value")).toHaveText("billing");
    await expect(page.getByTestId("unused-single-outputs")).toHaveText("0");
  } else {
    info.annotations.push({
      type: "optional-enhancement-unproven",
      description:
        "Native Accordion find/reveal was unsupported or did not produce observed trusted beforematch; synthetic policy is not native evidence.",
    });
  }

  await page.getByTestId("single-external").click();
  await expect(page.getByTestId("factory-single-value")).toHaveText("unmounted");

  for (const disabled of ["single-root-disable", "single-item-disable"]) {
    await page.getByTestId(disabled).click();
    await expect.poll(nativeDisabled).toBe(true);
    await expect(trigger).toHaveAttribute("data-disabled", "");
    await expect(item).toHaveAttribute("data-disabled", "");
    await expect(panel).toHaveAttribute("hidden", "");

    const history = await page.getByTestId("single-setter-history").textContent();

    await panel.dispatchEvent("beforematch");
    await expect(page.getByTestId("factory-single-value")).toHaveText("unmounted");
    await expect(page.getByTestId("single-setter-history")).toHaveText(history ?? "");
    await expect(page.getByTestId("unused-single-outputs")).toHaveText("0");
    await page.getByTestId(disabled).click();
    await expect.poll(nativeDisabled).toBe(false);
    await expect(trigger).not.toHaveAttribute("data-disabled", /.*/);
    await expect(item).not.toHaveAttribute("data-disabled", /.*/);
    await expect(panel).toHaveAttribute("hidden", expectedHidden);
  }
});

test("A4 A5: Multiple effective setter observation, normal output binding reentry/teardown, reactive mounted item values", async ({
  page,
}, info) => {
  await core(page, info);
  await page.getByTestId("multiple-reentry-arm").click();
  await page.getByTestId("factory-multiple-billing").click();
  await expect(page.getByTestId("factory-multiple-value")).toHaveText("unmounted,security");
  await expect(page.getByTestId("multiple-setter-history")).toHaveText("unmounted,security:false");
  await expect(page.getByTestId("factory-multiple-billing")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("factory-multiple-original")).toHaveText("unmounted");
  await page.getByTestId("output-reentry-arm").click();
  await page.getByTestId("output-billing").click();
  await expect(page.getByTestId("output-value")).toHaveText("security");
  await expect(page.getByTestId("output-count")).toHaveText("1");
  await expect(page.getByTestId("output-security")).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId("output-destroy-arm").click();
  await page.getByTestId("output-billing").click();
  await expect(page.getByTestId("output-billing")).toHaveCount(0);
  await page.getByTestId("output-owner-mount").click();
  await expect(page.getByTestId("output-billing")).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId("factory-single-billing").click();
  await page.getByTestId("single-item-rename").click();
  await expect(page.getByTestId("factory-single-values")).toHaveText(/^renamed,security,.+/);
  await expect(page.getByTestId("factory-single-value")).toHaveText("billing");
  await expect(page.getByTestId("factory-single-billing")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("A5 O1: two generated values survive a keyed reverse, which notifies no itemValues reader; replaced Item Options govern values and activation", async ({
  page,
}, info) => {
  await core(page, info);

  const initial = await page.getByTestId("generated-values").textContent();
  const generated = initial?.split(",") ?? [];

  expect(generated).toHaveLength(2);
  expect(generated[0]).toBeTruthy();
  expect(generated[1]).toBeTruthy();
  expect(new Set(generated).size).toBe(2);

  const nodes = [
    await page.locator('[data-generated-key="one"]').elementHandle(),
    await page.locator('[data-generated-key="two"]').elementHandle(),
  ];

  await page.getByTestId("generated-reverse").click();
  await expect
    .poll(() =>
      page
        .locator("[data-generated-key]")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-generated-key"))),
    )
    .toEqual(["two", "one"]);
  await expect(page.getByTestId("generated-values")).toHaveText(`${generated[0]},${generated[1]}`);

  for (const [index, key] of ["one", "two"].entries()) {
    expect(
      await nodes[index]?.evaluate(
        (node, key) => node === document.querySelector(`[data-generated-key="${key}"]`),
        key,
      ),
    ).toBe(true);
  }

  await page.getByTestId("generated-trigger-two").click();
  await expect(page.getByTestId("generated-selection")).toHaveText(generated[1] ?? "");
  await expect(page.getByTestId("generated-trigger-two")).toHaveAttribute("aria-expanded", "true");

  // The replaced lower Item Options, not a default input, define the observed Accordion value.
  await expect(page.getByTestId("replaced-item-values")).toHaveText("replacement-one");
  await page.getByTestId("replaced-value-trigger").click();
  await expect(page.getByTestId("replaced-item-selection")).toHaveText("replacement-one");
  await page.getByTestId("replace-item-value").click();
  await expect(page.getByTestId("replaced-item-values")).toHaveText("replacement-two");
  await expect(page.getByTestId("replaced-item-selection")).toHaveText("replacement-one");
  await expect(page.getByTestId("replaced-value-trigger")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByTestId("replaced-value-trigger").click();
  await expect(page.getByTestId("replaced-item-selection")).toHaveText("replacement-two");
  await expect(page.getByTestId("replaced-value-trigger")).toHaveAttribute("aria-expanded", "true");
});

/** One step of an A6 case: the control it clicks and the resulting state of Trigger A. */
interface LockedStep {
  readonly control: "item" | "root" | "collapsible" | "select-a" | "select-b";
  /** Item A or the root is disabled. */
  readonly disabled: boolean;
  /** A is selected. */
  readonly selected: boolean;
  /** A is selected and the root is not collapsible. */
  readonly locked: boolean;
}

/**
 * The locked state and the root/item disabled state both reach Trigger A's disabled attributes.
 * Each case flips one source at a time, so a change of either alone must leave the right values.
 */
const lockedCases: readonly {
  readonly name: string;
  readonly title: string;
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly steps: readonly LockedStep[];
}[] = [
  {
    name: "item-disabled",
    title:
      "its disabled item is enabled, disabled and enabled again, then it is unlocked and locked by collapsible and by selection",
    disabled: true,
    selected: true,
    steps: [
      { control: "item", disabled: false, selected: true, locked: true },
      { control: "item", disabled: true, selected: true, locked: true },
      { control: "item", disabled: false, selected: true, locked: true },
      { control: "collapsible", disabled: false, selected: true, locked: false },
      { control: "collapsible", disabled: false, selected: true, locked: true },
      { control: "select-b", disabled: false, selected: false, locked: false },
      { control: "select-a", disabled: false, selected: true, locked: true },
    ],
  },
  {
    name: "root-disabled",
    title: "its disabled root is enabled, disabled and enabled again",
    disabled: true,
    selected: true,
    steps: [
      { control: "root", disabled: false, selected: true, locked: true },
      { control: "root", disabled: true, selected: true, locked: true },
      { control: "root", disabled: false, selected: true, locked: true },
    ],
  },
  {
    name: "enabled",
    title: "its enabled item is disabled and enabled again, then the root becomes collapsible",
    disabled: false,
    selected: true,
    steps: [
      { control: "item", disabled: true, selected: true, locked: true },
      { control: "item", disabled: false, selected: true, locked: true },
      { control: "collapsible", disabled: false, selected: true, locked: false },
    ],
  },
  {
    name: "unselected",
    title: "its unselected disabled item is selected externally and then enabled",
    disabled: true,
    selected: false,
    steps: [
      { control: "select-a", disabled: true, selected: true, locked: true },
      { control: "item", disabled: false, selected: true, locked: true },
    ],
  },
];

for (const { name, title, disabled, selected, steps } of lockedCases) {
  test(`A6: a locked Trigger is focusable and aria- and data-disabled, natively disabled only with its item or root, after ${title}`, async ({
    page,
  }, info) => {
    await core(page, info);

    const part = (role: string) =>
      page.locator(`[data-accordion-case="${name}"] [data-role="${role}"]`);
    const trigger = part("a");

    /** Native `disabled` follows the item and root; `aria-disabled` and `data-disabled` also follow the lock. */
    async function expectTrigger(step: Omit<LockedStep, "control">): Promise<void> {
      await expect(trigger).toHaveAttribute("aria-expanded", String(step.selected));
      await expect(trigger).toHaveJSProperty("disabled", step.disabled);

      if (step.disabled || step.locked) {
        await expect(trigger).toHaveAttribute("aria-disabled", "true");
        await expect(trigger).toHaveAttribute("data-disabled", "");
      } else {
        await expect(trigger).not.toHaveAttribute("aria-disabled", /.*/);
        await expect(trigger).not.toHaveAttribute("data-disabled", /.*/);
      }

      if (!step.disabled) {
        await trigger.focus();
        await expect(trigger).toBeFocused();
      }
    }

    await expectTrigger({ disabled, selected, locked: selected });

    for (const step of steps) {
      await part(step.control).click();
      await expectTrigger(step);
    }

    await expect(part("value")).toHaveText("a");
  });
}

test("L4: trusted fragment navigation reveals an enabled until-found Panel in engines with beforematch", async ({
  page,
}, info) => {
  await core(page, info);
  await page.getByTestId("motion").selectOption("none");

  const trigger = page.getByTestId("variant-trigger");
  const panel = page.getByTestId("variant-panel");

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveAttribute("hidden", "");
  await page.getByTestId("until-found").click();

  const supportsReveal = await panel.evaluate((node) => "onbeforematch" in node);
  const outputs = Number(await page.getByTestId("variant-expanded-outputs").textContent());

  if (!supportsReveal) {
    await expect(panel).toHaveAttribute("hidden", "");
    await page.getByTestId("fragment-reveal").click();
    await expect(page).toHaveURL(/#origami-fragment-target$/);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    info.annotations.push({
      type: "optional-enhancement-unsupported",
      description: "Engine has no beforematch support; ordinary hiding stays authoritative.",
    });

    return;
  }

  await expect(panel).toHaveAttribute("hidden", "until-found");
  await page.getByTestId("fragment-reveal").click();
  await expect(page).toHaveURL(/#origami-fragment-target$/);
  // Engines with beforematch run the fragment ancestor-revealing steps: require the trusted
  // event itself, never a synthetic substitute.
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.acceptanceObservation.trust.some(
          (event) => event.type === "beforematch" && event.trusted,
        ),
      ),
    )
    .toBe(true);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).not.toHaveAttribute("hidden", /.*/);
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("variant-expanded-outputs")).toHaveText(String(outputs + 1));
});

/** Locates `role` inside the composed-State case marked `name`. */
function stateCase(page: Parameters<typeof fixture>[0], name: string, role: string) {
  return page.locator(`[data-state-case="${name}"] [data-role="${role}"]`);
}

/**
 * Closes `panel` through `close` and checks that its `state.open()`, read through its template
 * reference, keeps the `gated` content through a finite exit under no-preference motion and
 * releases it once the exit settles. Reduced-motion CSS removes the exit animation.
 */
async function expectExitRetention(
  page: Parameters<typeof fixture>[0],
  info: Parameters<typeof fixture>[2],
  { panel, gated, open, close }: Record<"panel" | "gated" | "open" | "close", Locator>,
): Promise<void> {
  const retained = info.project.metadata.motion === "no-preference";

  // Pause the 1000 ms exit in the page as it starts: on a loaded host, the round trips before the
  // retained exit is sampled can outlast it.
  if (retained) {
    await panel.evaluate((node) => {
      const observer = new MutationObserver(() => {
        if (!node.hasAttribute("data-leaving")) {
          return;
        }

        observer.disconnect();

        for (const animation of node.getAnimations()) {
          animation.pause();
        }
      });

      observer.observe(node, { attributes: true, attributeFilter: ["data-leaving"] });
    });
  }

  await close.click();

  if (retained) {
    await expect(panel).toHaveAttribute("data-leaving", "");
    await expect
      .poll(() => panel.evaluate((node) => node.getAnimations().length))
      .toBeGreaterThan(0);
    await expect(panel).not.toHaveAttribute("data-expanded", /.*/);
    await expect(panel).not.toHaveAttribute("hidden", /.*/);
    await expect(gated).toHaveCount(1);
    await expect(open).toHaveText("true");

    // Resume the exit: the gated content goes once it settles.
    await panel.evaluate((node) => {
      for (const animation of node.getAnimations()) {
        animation.play();
      }
    });
  }

  await expect(panel).not.toHaveAttribute("data-leaving", /.*/);
  await expect(gated).toHaveCount(0);
  await expect(open).toHaveText("false");
  await expect(panel).toHaveAttribute("hidden", "");
}

test("L7: a Collapsible Panel's state, read through its template reference, retains gated content through a finite exit", async ({
  page,
}, info) => {
  await core(page, info);

  const part = (role: string) => stateCase(page, "collapsible-panel", role);

  // Collapsed under an open ancestor Presence: the Panel's own Presence State is closed.
  await expect(part("open")).toHaveText("false");
  await expect(part("gated")).toHaveCount(0);
  await part("trigger").click();
  await expect(part("open")).toHaveText("true");
  await expect(part("gated")).toHaveCount(1);
  await expectExitRetention(page, info, {
    panel: part("panel"),
    gated: part("gated"),
    open: part("open"),
    close: part("trigger"),
  });
  await part("trigger").click();
  await expect(part("gated")).toHaveCount(1);
});

test("A7: an Accordion Item's state, read through its template reference, follows the selection and the combined disabled state", async ({
  page,
}, info) => {
  await core(page, info);

  const part = (role: string) => stateCase(page, "accordion", role);

  // Under an expanded, enabled ancestor Collapsible: each item reports its own composed State.
  await expect(part("billing-expanded")).toHaveText("false");
  await expect(part("billing-disabled")).toHaveText("false");
  await expect(part("security-expanded")).toHaveText("false");
  await part("billing-trigger").click();
  await expect(part("value")).toHaveText("billing");
  await expect(part("billing-expanded")).toHaveText("true");
  await expect(part("security-expanded")).toHaveText("false");
  await part("security-trigger").click();
  await expect(part("billing-expanded")).toHaveText("false");
  await expect(part("security-expanded")).toHaveText("true");
  await part("external").click();
  await expect(part("billing-expanded")).toHaveText("true");
  await expect(part("security-expanded")).toHaveText("false");

  // The root's disabled reaches every item; the item's own reaches only that item.
  await part("root-disable").click();
  await expect(part("billing-disabled")).toHaveText("true");
  await expect(part("security-disabled")).toHaveText("true");
  await part("root-disable").click();
  await part("item-disable").click();
  await expect(part("billing-disabled")).toHaveText("true");
  await expect(part("security-disabled")).toHaveText("false");
  await expect(part("billing-trigger")).toBeDisabled();
  await part("item-disable").click();
  await expect(part("billing-disabled")).toHaveText("false");
  await expect(part("billing-trigger")).toBeEnabled();
});

test("A8: an Accordion Panel's state, read through its template reference, retains gated content through a finite exit", async ({
  page,
}, info) => {
  await core(page, info);

  const part = (role: string) => stateCase(page, "accordion", role);

  // Collapsed under an open ancestor Presence: the Panel's own Presence State is closed.
  await expect(part("billing-open")).toHaveText("false");
  await expect(part("billing-gated")).toHaveCount(0);
  await part("billing-trigger").click();
  await expect(part("billing-open")).toHaveText("true");
  await expect(part("billing-gated")).toHaveCount(1);
  // Selecting another item closes billing's Panel.
  await expectExitRetention(page, info, {
    panel: part("billing-panel"),
    gated: part("billing-gated"),
    open: part("billing-open"),
    close: part("security-trigger"),
  });
  await expect(part("value")).toHaveText("security");
});
