import { test, expect } from "./contract-test.js";
import { fixture } from "./observation.js";
import type { Page } from "playwright/test";

async function script(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error("Missing script-action button");
    }

    node.click();
  });
}

for (const action of ["destroy-focus", "replace-focus", "destroy-beforetoggle-open"]) {
  test(`V8 V10: synchronous ${action} uses genuine ComponentRef lifetime during native activation`, async ({
    page,
  }, info) => {
    await fixture(page, "popover", info);
    await page.getByTestId("lifetime-mount").click();
    await page.getByTestId("lifetime-action").selectOption(action);

    const old = await page.getByTestId("first-managed-content").elementHandle();

    await script(page, "lifetime-open-first");
    await expect.poll(() => old?.evaluate((node) => node.isConnected)).toBe(false);

    if (action.startsWith("replace")) {
      await expect(page.getByTestId("first-managed-intent")).toHaveText("true");
      await expect
        .poll(() =>
          page
            .getByTestId("first-managed-content")
            .evaluate((node) => node.matches(":popover-open")),
        )
        .toBe(true);
      expect(
        await old?.evaluate(
          (node) => node === document.querySelector('[data-testid="first-managed-content"]'),
        ),
      ).toBe(false);
    } else {
      await expect(page.getByTestId("first-managed-content")).toHaveCount(0);
    }

    await expect(page.getByTestId("lifetime-events")).toContainText("first:beforetoggle-open:true");
  });
}

for (const action of [
  "destroy-dismiss",
  "replace-dismiss",
  "reopen-dismiss",
  "move-focus-close",
  "replace-beforetoggle-close",
]) {
  test(`V8 V9 V12: ${action} during actual writable Options/native callbacks does not write stale owner or steal moved focus`, async ({
    page,
  }, info) => {
    await fixture(page, "popover", info);
    await page.getByTestId("lifetime-mount").click();
    await script(page, "lifetime-open-first");
    await expect
      .poll(() =>
        page.getByTestId("first-managed-content").evaluate((node) => node.matches(":popover-open")),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const trigger = document.querySelector('[data-testid="first-managed-trigger"]');
          const content = document.querySelector('[data-testid="first-managed-content"]');

          if (!trigger || !content) {
            throw new Error("Missing ordinary default geometry roles");
          }

          const anchor = trigger.getBoundingClientRect();
          const box = content.getBoundingClientRect();

          return Math.max(
            Math.min(Math.abs(box.top - anchor.bottom), Math.abs(anchor.top - box.bottom)),
            Math.min(Math.abs(box.left - anchor.left), Math.abs(box.right - anchor.right)),
          );
        }),
      )
      .toBeLessThanOrEqual(2);
    await page.getByTestId("lifetime-action").selectOption(action);

    const old = await page.getByTestId("first-managed-content").elementHandle();

    if (!old) {
      throw new Error("Missing genuine managed content");
    }

    if (action.startsWith("replace") || action.startsWith("destroy")) {
      await expect
        .poll(() =>
          old.evaluate(
            (node) =>
              window.acceptanceObservation.observers.filter((record) =>
                record.targets.includes(node),
              ).length,
          ),
        )
        .toBeGreaterThan(0);
    }

    await script(page, "lifetime-close-first");

    if (action === "reopen-dismiss") {
      await expect(page.getByTestId("first-managed-intent")).toHaveText("true");
      await expect(page.getByTestId("lifetime-callback-state")).toHaveText("true");
    } else if (action.startsWith("replace")) {
      await expect.poll(() => old?.evaluate((node) => node.isConnected)).toBe(false);
      await expect(page.getByTestId("first-managed-intent")).toHaveText("true");
      await expect
        .poll(() =>
          page
            .getByTestId("first-managed-content")
            .evaluate((node) => node.matches(":popover-open")),
        )
        .toBe(true);
    } else if (action === "move-focus-close") {
      await expect(page.getByTestId("lifetime-outside")).toBeFocused();
      await expect(page.getByTestId("first-managed-intent")).toHaveText("false");
    } else {
      await expect(page.getByTestId("first-managed-content")).toHaveCount(0);
    }

    if (action.startsWith("replace") || action.startsWith("destroy")) {
      await expect
        .poll(() =>
          old.evaluate(
            (node) =>
              window.acceptanceObservation.observers.filter((record) =>
                record.targets.includes(node),
              ).length,
          ),
        )
        .toBe(0);
    }
  });
}

test("V8: an acquired trusted outside pointer cannot close a peer replacement created by another branch setter", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await page.getByTestId("lifetime-mount").click();
  await script(page, "lifetime-open-first");
  await script(page, "lifetime-open-second");

  for (const label of ["first", "second"]) {
    await expect
      .poll(() =>
        page
          .getByTestId(`${label}-managed-content`)
          .evaluate((node) => node.matches(":popover-open")),
      )
      .toBe(true);
  }

  await page.getByTestId("lifetime-action").selectOption("replace-peer-dismiss");

  const before = await page.getByTestId("lifetime-events").textContent();

  await page.getByTestId("lifetime-outside").click();
  await expect(page.getByTestId("lifetime-closed-actor")).toHaveText(/first|second/);

  const closedActor = await page.getByTestId("lifetime-closed-actor").textContent();
  let peer = "second";

  if (closedActor === "second") {
    peer = "first";
  }

  await expect(page.getByTestId(`${peer}-managed-intent`)).toHaveText("true");
  await expect
    .poll(() =>
      page.getByTestId(`${peer}-managed-content`).evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(true);

  const events = await page.getByTestId("lifetime-events").textContent();
  const acquired = events?.slice(before?.length ?? 0);

  await info.attach("actual-acquired-gesture-owner-interleaving", {
    body: acquired ?? "",
    contentType: "text/plain",
  });
  expect(acquired).toContain(`${closedActor}:desired-close:false`);
});

type JournalEntry = Record<string, unknown>;

async function journal(page: Page, testId: string): Promise<JournalEntry[]> {
  const text = await page.getByTestId(testId).textContent();
  const value: unknown = JSON.parse(text ?? "");

  if (!Array.isArray(value)) {
    throw new Error(`${testId} must hold a JSON array`);
  }

  const entries: JournalEntry[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`${testId} entries must be objects`);
    }

    entries.push({ ...entry });
  }

  return entries;
}

function only(entries: JournalEntry[], match: JournalEntry): JournalEntry {
  const found: JournalEntry[] = [];

  for (const entry of entries) {
    let matches = true;

    for (const [key, value] of Object.entries(match)) {
      if (entry[key] !== value) {
        matches = false;
      }
    }

    if (matches) {
      found.push(entry);
    }
  }

  expect(found, `exactly one journal entry matching ${JSON.stringify(match)}`).toHaveLength(1);

  return found[0] ?? {};
}

function count(entries: JournalEntry[], match: JournalEntry): number {
  let total = 0;

  for (const entry of entries) {
    let matches = true;

    for (const [key, value] of Object.entries(match)) {
      if (entry[key] !== value) {
        matches = false;
      }
    }

    if (matches) {
      total += 1;
    }
  }

  return total;
}

const authoredBaseline = {
  opacity: "0.74",
  opacityPriority: "important",
  pointer: "none",
  pointerPriority: "important",
};

test("V8 V9: a restored Trigger's focus listener destroying the owner during a script close stops the stale synchronization", async ({
  page,
}, info) => {
  await fixture(page, "popover", info);
  await page.getByTestId("owner-lifetime-enable").click();
  await page.getByTestId("owner-lifetime-mount").click();
  await page.getByTestId("owner-lifetime-trigger").click();

  const content = page.getByTestId("owner-lifetime-content");

  await expect(content).toHaveAttribute("data-present", "");
  await expect
    .poll(() =>
      content.evaluate(
        (node) => node.matches(":popover-open") && getComputedStyle(node).opacity !== "0",
      ),
    )
    .toBe(true);
  await page.getByTestId("owner-lifetime-arm-restore-destroy").click();

  const mutations = await page.evaluateHandle(() => {
    const host = document.querySelector("acceptance-native-owner-lifetime");
    const owner = document.querySelector("acceptance-native-lifetime-owner");

    if (!host || !owner) {
      throw new Error("Missing the owner lifetime case");
    }

    const records: { target: string; type: string; attribute: string | null; owned: boolean }[] =
      [];
    const observer = new MutationObserver((list) => {
      for (const record of list) {
        let target = record.target.nodeName;

        if (record.target instanceof Element) {
          target = record.target.getAttribute("data-testid") ?? record.target.localName;
        }

        records.push({
          target,
          type: record.type,
          attribute: record.attributeName,
          // Structural containment still holds for the detached dead subtree.
          owned: record.target === owner || owner.contains(record.target),
        });
      }
    });

    observer.observe(host, { attributes: true, childList: true, subtree: true });

    return { records, stop: () => observer.disconnect() };
  });

  // Focus stays inside Content; Enter activates the authored script-close control.
  await page.getByTestId("owner-lifetime-close").press("Enter");
  await expect(page.getByTestId("owner-lifetime-settled")).toHaveText("1");
  await expect(page.locator("acceptance-native-lifetime-owner")).toHaveCount(0);

  const records = await mutations.evaluate((observation) => {
    observation.stop();

    return observation.records;
  });

  await mutations.dispose();

  const entries = await journal(page, "owner-lifetime-journal");

  await info.attach("V9-restored-focus-destroys-owner", {
    body: JSON.stringify({ entries, records }, null, 2),
    contentType: "application/json",
  });
  expect(only(entries, { stage: "after-restore-destroy" })).toMatchObject({
    destroyed: true,
    viewDestroyed: true,
    intent: false,
  });

  const marker = records.findIndex(
    (record) =>
      record.target === "acceptance-native-owner-lifetime" &&
      record.attribute === "data-owner-destroyed",
  );

  expect(marker, "The consumer's post-destroy marker was observed").toBeGreaterThan(0);
  expect(
    records.slice(0, marker).some((record) => record.owned),
    "Teardown mutations of the dead owner are observable before the marker",
  ).toBe(true);
  expect(
    records.slice(marker + 1).filter((record) => record.owned),
    "No stale synchronization writes into the destroyed owner",
  ).toEqual([]);
});

for (const action of ["destroy", "replace"]) {
  test(`V8 V10: ${action} of the owner in a trusted opening beforetoggle invalidates the old activation; the detached host keeps its authored baseline`, async ({
    page,
  }, info) => {
    await fixture(page, "popover", info);
    await page.getByTestId("owner-lifetime-enable").click();
    await page.getByTestId("owner-lifetime-mount").click();

    const content = page.getByTestId("owner-lifetime-content");
    const authored = () =>
      content.evaluate((node) => {
        if (!(node instanceof HTMLElement)) {
          throw new Error("Expected the authored Content host");
        }

        return {
          opacity: node.style.getPropertyValue("opacity"),
          opacityPriority: node.style.getPropertyPriority("opacity"),
          pointer: node.style.getPropertyValue("pointer-events"),
          pointerPriority: node.style.getPropertyPriority("pointer-events"),
          consumerVisual: node.style.getPropertyValue("--consumer-visual").trim(),
        };
      });

    await expect.poll(authored).toEqual({ ...authoredBaseline, consumerVisual: "preserved" });

    const old = await content.elementHandle();

    if (!old) {
      throw new Error("Missing the first owner's Content host");
    }

    await page.getByTestId(`owner-lifetime-arm-${action}`).click();
    // Genuine trusted Trigger activation runs the native opening callback.
    await page.getByTestId("owner-lifetime-trigger").click();
    await expect(page.getByTestId("owner-lifetime-settled")).toHaveText("1");

    const entries = await journal(page, "owner-lifetime-journal");

    await info.attach("native-owner-lifetime-journal", {
      body: JSON.stringify(entries, null, 2),
      contentType: "application/json",
    });
    expect(only(entries, { stage: "beforetoggle", generation: 1, newState: "open" })).toMatchObject(
      { trusted: true, connected: true, native: false, intent: true, retained: true },
    );

    const after = only(entries, { stage: "after-action" });

    expect(after).toMatchObject({
      destroyed: true,
      viewDestroyed: true,
      connected: false,
      native: false,
    });
    // Nothing activates, positions or restyles the obsolete host after the render settles.
    expect(only(entries, { stage: "after-render" })).toMatchObject({
      connected: false,
      native: false,
      intent: after["intent"],
      retained: after["retained"],
      inert: true,
      styles: authoredBaseline,
    });
    expect(count(entries, { stage: "beforetoggle", generation: 1 })).toBe(1);
    expect(count(entries, { stage: "destroy-ref", generation: 1 })).toBe(1);

    const detached = () =>
      old.evaluate((node) => ({
        style: node.getAttribute("style"),
        hidden: node.getAttribute("hidden"),
        native: node.matches(":popover-open"),
        connected: node.isConnected,
        consumerVisual: node.style.getPropertyValue("--consumer-visual").trim(),
      }));
    const settledOld = await detached();

    if (action === "destroy") {
      await expect(page.locator("acceptance-native-lifetime-owner")).toHaveCount(0);
    } else {
      await expect(page.locator("acceptance-native-lifetime-owner")).toHaveCount(1);
      await page.getByTestId("owner-lifetime-trigger").click();
      await expect
        .poll(() =>
          content.evaluate(
            (node) => node.matches(":popover-open") && getComputedStyle(node).opacity !== "0",
          ),
        )
        .toBe(true);
      await page.getByTestId("owner-lifetime-live").click();
      await expect(page.getByTestId("owner-lifetime-live")).toHaveText("Live 1");

      const replaced = await journal(page, "owner-lifetime-journal");

      expect(
        only(replaced, { stage: "beforetoggle", generation: 2, newState: "open" }),
      ).toMatchObject({ trusted: true, connected: true, intent: true });
      expect(count(replaced, { stage: "beforetoggle", generation: 2 })).toBe(1);
      await expect(content).not.toHaveAttribute("data-entering", /.*/);
      await expect(content).toHaveAttribute("data-present", "");

      // The replacement keeps its own ordinary authored styles and its own Anchor geometry.
      const replacement = await content.evaluate((node) => {
        if (!(node instanceof HTMLElement)) {
          throw new Error("Expected the replacement Content host");
        }

        const anchor = document.querySelector('[data-testid="owner-lifetime-trigger"]');

        if (!anchor) {
          throw new Error("Missing the replacement Anchor");
        }

        const rect = node.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();

        return {
          native: node.matches(":popover-open"),
          inert: node.inert,
          leaving: node.hasAttribute("data-leaving"),
          opacity: node.style.getPropertyValue("opacity"),
          opacityPriority: node.style.getPropertyPriority("opacity"),
          pointer: node.style.getPropertyValue("pointer-events"),
          pointerPriority: node.style.getPropertyPriority("pointer-events"),
          gap: Math.min(
            Math.abs(rect.top - anchorRect.bottom - 8),
            Math.abs(anchorRect.top - rect.bottom - 8),
          ),
          alignment: Math.min(
            Math.abs(rect.left - anchorRect.left),
            Math.abs(rect.right - anchorRect.right),
          ),
        };
      });

      expect(replacement).toMatchObject({
        native: true,
        inert: false,
        leaving: false,
        opacity: "0.42",
        opacityPriority: "",
        pointer: "auto",
        pointerPriority: "",
      });
      expect(replacement.gap).toBeLessThanOrEqual(2);
      expect(replacement.alignment).toBeLessThanOrEqual(2);
    }

    // The detached obsolete host was not mutated or activated by later work, and destruction
    // left its unrelated consumer-authored custom property in place.
    expect(await detached()).toEqual(settledOld);
    expect(settledOld).toMatchObject({
      native: false,
      connected: false,
      consumerVisual: "preserved",
    });
  });
}

async function latePointerReady(page: Page): Promise<void> {
  await expect(page.getByTestId("late-pointer-ready")).toHaveText("true");
  await expect
    .poll(() =>
      page
        .getByTestId("late-pointer-content")
        .evaluate(
          (node) => node.matches(":popover-open") && getComputedStyle(node).opacity !== "0",
        ),
    )
    .toBe(true);
}

/** The document-capture down/up of one genuine primary gesture. */
function pointerPair(entries: JournalEntry[]): void {
  const downs: JournalEntry[] = [];
  const ups: JournalEntry[] = [];

  for (const entry of entries) {
    if (entry["stage"] === "document" && entry["type"] === "pointerdown") {
      downs.push(entry);
    }

    if (entry["stage"] === "document" && entry["type"] === "pointerup") {
      ups.push(entry);
    }
  }

  expect(downs).toHaveLength(1);
  expect(ups).toHaveLength(1);
  expect(downs[0]?.["id"]).toBe(ups[0]?.["id"]);

  for (const event of [...downs, ...ups]) {
    expect(event).toMatchObject({ trusted: true, primary: true, button: 0 });
  }
}

for (const [mode, label] of [
  ["veto-up", "dismissal veto"],
  ["destroy-up", "application destruction"],
] as const) {
  test(`V6 V8: a later window-bubble ${label} during a trusted outside pointerup emits and writes nothing`, async ({
    page,
  }, info) => {
    await fixture(page, "popover", info);
    await page.getByTestId("late-pointer-enable").click();
    await page.getByTestId(`late-pointer-mount-${mode}`).click();
    await latePointerReady(page);
    await expect(page.getByTestId("late-pointer-outputs")).toHaveText("[]");

    const start = (await journal(page, "late-pointer-journal")).length;
    const outside = await page.getByTestId("late-pointer-outside").boundingBox();

    if (!outside) {
      throw new Error("Missing the outside control");
    }

    await page.mouse.move(outside.x + outside.width / 2, outside.y + outside.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect
      .poll(async () =>
        count((await journal(page, "late-pointer-journal")).slice(start), {
          stage: "after-task",
          type: "pointerup",
          target: "late-pointer-outside",
        }),
      )
      .toBe(1);

    const entries = (await journal(page, "late-pointer-journal")).slice(start);

    await info.attach("late-pointer-journal", {
      body: JSON.stringify(entries, null, 2),
      contentType: "application/json",
    });
    pointerPair(entries);

    if (mode === "destroy-up") {
      // The destroyed application's queued decision wrote and emitted nothing.
      expect(only(entries, { stage: "app-destroyed" })).toMatchObject({ open: true, outputs: [] });
      expect(only(entries, { stage: "app-destroyed-after-task" })).toMatchObject({
        open: true,
        outputs: [],
      });
      await latePointerReady(page);
      await expect(page.getByTestId("late-pointer-intent")).toHaveText("true");
      await expect(page.getByTestId("late-pointer-outputs")).toHaveText("[]");
      await page.getByTestId("late-pointer-live").click();
      await expect(page.getByTestId("late-pointer-live")).toHaveText("Live 1");
      await expect(page.getByTestId("late-pointer-intent")).toHaveText("true");

      return;
    }

    expect(
      only(entries, { stage: "after-task", type: "pointerup", target: "late-pointer-outside" }),
    ).toMatchObject({ phase: 0 });
    await expect(page.getByTestId("late-pointer-intent")).toHaveText("true");
    await expect(page.getByTestId("late-pointer-outputs")).toHaveText("[]");
    await expect
      .poll(() =>
        page.getByTestId("late-pointer-content").evaluate((node) => node.matches(":popover-open")),
      )
      .toBe(true);
  });
}

test("C5 N12: parts whose view is destroyed before they register leave no registration", async ({
  page,
}, info) => {
  await fixture(page, "core", info);
  await page.getByTestId("unregistered-mount").click();

  // Each view cleared itself during initialization; no part from it is in the document.
  await expect(page.getByTestId("unregistered-radio-gone")).toHaveCount(0);
  await expect(page.getByTestId("unregistered-tab-gone")).toHaveCount(0);
  await expect(page.getByTestId("unregistered-collapsible-trigger-gone")).toHaveCount(0);
  await expect(page.locator("#unregistered-gone-popover-content")).toHaveCount(0);
  await expect(page.locator("#unregistered-gone-tooltip-content")).toHaveCount(0);
  await expect(page.getByTestId("unregistered-tooltip-trigger-gone")).toHaveCount(0);
  await expect(page.getByTestId("unregistered-collection-items")).toHaveText("");
  await expect(page.getByTestId("unregistered-tooltip-trigger")).not.toHaveAttribute(
    "aria-describedby",
  );

  await page.getByTestId("unregistered-remount").click();

  // A replacement under each surviving root is the only registration it sees.
  await expect(page.getByTestId("unregistered-collection-items")).toHaveText("kept");
  await expect(page.getByTestId("unregistered-radio-kept")).toHaveAttribute("tabindex", "0");
  await expect(page.getByTestId("unregistered-tab-kept")).toHaveAttribute("tabindex", "0");
  await expect(page.getByTestId("unregistered-tab-panel")).toHaveAttribute(
    "aria-labelledby",
    "unregistered-kept-tab",
  );
  await expect(page.getByTestId("unregistered-collapsible-panel")).toHaveAttribute(
    "aria-labelledby",
    "unregistered-kept-collapsible-trigger",
  );
  await expect(page.getByTestId("unregistered-collapsible-trigger-kept")).toHaveAttribute(
    "aria-controls",
    "unregistered-collapsible-panel",
  );
  await expect(page.getByTestId("unregistered-popover-trigger")).toHaveAttribute(
    "aria-controls",
    "unregistered-kept-popover-content",
  );
  // A replacement Tooltip Content and Trigger register without a duplicate-role error.
  await expect(page.getByTestId("unregistered-tooltip-trigger")).toHaveAttribute(
    "aria-describedby",
    "unregistered-kept-tooltip-content",
  );
  await expect(page.getByTestId("unregistered-tooltip-trigger-kept")).toHaveAttribute(
    "aria-describedby",
    "unregistered-tooltip-content",
  );
});
