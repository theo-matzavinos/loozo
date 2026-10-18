import { test, expect } from "./contract-test.js";
import type { Locator, Page } from "playwright/test";
import { assertReferences, bootstrapHeld, stopRetentionObservation } from "./observation.js";

/** Holds the genuine lazy dependency response; never substitutes code, HTML or annotations. */
async function holdDependency(page: Page, marker: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];

  await page.route("**/*", async (route) => {
    if (
      route.request().resourceType() !== "script" ||
      /\/main(?:-[\w-]+)?\.(?:m?js|ts)$/.test(new URL(route.request().url()).pathname)
    ) {
      await route.fallback();

      return;
    }

    const response = await route.fetch();
    const text = await response.text();

    if (text.includes(marker)) {
      requests.push(route.request().url());
      await gate;
    }

    await route.fulfill({ response });
  });

  return { release, requests };
}

async function shell(page: Page, runtime: unknown): Promise<void> {
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-runtime", String(runtime));
}

for (const action of ["click", "Enter", "Space"]) {
  test(`H1 H2 H3 I4 R4: ${action} replay, genuine held unit dependency, B then A with C dehydrated`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.metadata.hydration !== "incremental",
      "Reverse deferred attachment belongs to incremental projects; eager retention is exercised separately.",
    );

    const releaseMain = await bootstrapHeld(page, "/hydration", info);
    const lazy = await holdDependency(page, "data-client-render-seen");

    try {
      const units = page.locator("[data-unit]");

      await expect(units).toHaveCount(3);

      // Approved boundary: these reused HydrationUnit owners all have real element hosts.
      // No no-host/application-injector call is asserted to match an SSR allocation.
      const ids = await units.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-generated-id")),
      );

      expect(new Set(ids).size).toBe(3);
      expect(ids.every(Boolean)).toBe(true);

      for (const label of ["A", "B"]) {
        const unit = page.locator(`[data-unit="${label}"]`);

        await expect(unit.getByTestId("hydration-presence-child")).toHaveCount(1);
        await expect(unit.getByTestId("hydration-popover-child")).toHaveCount(1);
        expect(
          await unit
            .getByTestId("hydration-popover-content")
            .evaluate((node) => node.matches(":popover-open")),
        ).toBe(false);
      }

      await expect(
        page.locator('[data-unit="C"]').getByTestId("hydration-presence-child"),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-unit="C"]').getByTestId("hydration-popover-child"),
      ).toHaveCount(0);
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      expect(lazy.requests).toEqual([]);

      for (const label of ["A", "B", "C"]) {
        await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
          "data-client-render-seen",
          "false",
        );
      }

      // Read-only observation of actual listener registration on the genuine replay container.
      // No private Angular hydration metadata or event-contract invocation is used.
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.acceptanceObservation.registrations.some(
              (item) => item.type === "click" && item.target === "body",
            ),
          ),
        )
        .toBe(true);

      const b = page.locator('[data-unit="B"]');
      const trigger = b.getByTestId("hydration-collapsible-trigger");

      if (action === "click") {
        await trigger.click();
      } else {
        await trigger.focus();
        await page.keyboard.press(action);
      }

      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(b.getByTestId("expanded-output-count")).toHaveText("0");
      await assertReferences(page, info);
      await info.attach("held-real-deferred-responses", {
        body: JSON.stringify(lazy.requests, null, 2),
        contentType: "application/json",
      });
      lazy.release();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
      await expect(b.getByTestId("expanded-output-count")).toHaveText("1");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator('[data-unit="A"]')).toHaveAttribute(
        "data-client-render-seen",
        "false",
      );
      await expect(page.locator('[data-unit="C"]')).toHaveAttribute(
        "data-client-render-seen",
        "false",
      );
      await assertReferences(page, info);
      await page.locator('[data-unit="A"]').getByTestId("hydrate-unit").click();
      await expect(page.locator('[data-unit="A"]')).toHaveAttribute(
        "data-client-render-seen",
        "true",
      );
      await expect(page.locator('[data-unit="A"]').getByTestId("interaction-count")).toHaveText(
        "1",
      );
      await expect(page.locator('[data-unit="C"]')).toHaveAttribute(
        "data-client-render-seen",
        "false",
      );
      await assertReferences(page, info);

      const afterIds = await units.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-generated-id")),
      );

      expect(afterIds).toEqual(ids);

      const retainedChild = await b.getByTestId("hydration-popover-child").elementHandle();

      await b.getByTestId("hydration-live-update").evaluate((node) => {
        if (!(node instanceof HTMLButtonElement)) {
          throw new Error("Missing ordinary live-binding control");
        }

        node.click();
      });
      await expect(b.getByTestId("hydration-popover-child")).toContainText(
        "updated-after-attachment",
      );
      expect(await retainedChild?.evaluate((node) => node.isConnected)).toBe(true);
      await assertReferences(page, info);

      const values = await b.getByTestId("hydration-accordion").getAttribute("data-item-values");
      const firstValue = values?.split(",")[0];

      expect(firstValue).toBeTruthy();
      await stopRetentionObservation(page);
      await b.getByTestId("generated-item-one").click();
      await expect(b.getByTestId("generated-selection")).toHaveText(firstValue ?? "");
      await trigger.click();
      await expect(b.getByTestId("expanded-output-count")).toHaveText("2");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
    } finally {
      releaseMain();
      lazy.release();
    }
  });
}

test("H1 H2 H3 I4 R4: Popover Trigger click replay, genuine held unit dependency, dismissible B closes once and reopens with A and C dehydrated", async ({
  page,
}, info) => {
  test.skip(
    info.project.metadata.hydration !== "incremental",
    "Deferred Popover Trigger replay belongs to incremental projects; eager units attach before any click.",
  );

  const releaseMain = await bootstrapHeld(page, "/hydration?dismissible=B", info);
  const lazy = await holdDependency(page, "data-client-render-seen");

  try {
    const b = page.locator('[data-unit="B"]');
    const trigger = b.getByTestId("hydration-popover-trigger");
    const content = b.getByTestId("hydration-popover-content");

    function nativeOpen(): Promise<boolean> {
      return content.evaluate((node) => node.matches(":popover-open"));
    }

    // Requested open in SSR: the gated children exist while the native host starts closed.
    await expect(b.getByTestId("hydration-popover-child")).toHaveCount(1);
    await expect(b.getByTestId("popover-intent")).toHaveText("true");
    const initiallyNativeOpen = await nativeOpen();
    expect(initiallyNativeOpen).toBe(false);
    releaseMain();
    await shell(page, info.project.metadata.runtime);
    expect(lazy.requests).toEqual([]);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.acceptanceObservation.registrations.some(
            (item) => item.type === "click" && item.target === "body",
          ),
        ),
      )
      .toBe(true);

    await trigger.click();
    await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
    await expect(b).toHaveAttribute("data-client-render-seen", "false");
    await expect(b.getByTestId("popover-output-count")).toHaveText("0");
    await expect(b.getByTestId("popover-intent")).toHaveText("true");
    await expect(b.getByTestId("interaction-count")).toHaveText("0");
    await expect(b.getByTestId("hydration-popover-child")).toHaveCount(1);
    const heldNativeOpen = await nativeOpen();
    expect(heldNativeOpen).toBe(false);
    await assertReferences(page, info);
    await info.attach("held-real-deferred-responses", {
      body: JSON.stringify(lazy.requests, null, 2),
      contentType: "application/json",
    });
    lazy.release();

    // The replayed click is B's own Trigger request-close: one output, no stale dismissal.
    await expect(b).toHaveAttribute("data-client-render-seen", "true");
    await expect(b.getByTestId("popover-intent")).toHaveText("false");
    await expect(b.getByTestId("popover-output-count")).toHaveText("1");
    await expect(b.getByTestId("hydration-popover-child")).toHaveCount(0);
    await expect(b.getByTestId("hydration-live-update")).toHaveCount(0);
    await expect.poll(nativeOpen).toBe(false);
    await expect(b.getByTestId("interaction-count")).toHaveText("0");

    for (const label of ["A", "C"]) {
      await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
        "data-client-render-seen",
        "false",
      );
    }

    // Only B's gated children leave; its hosts/parts and every A/C reference are retained.
    await assertReferences(page, info, {
      removed: ["B:hydration-live-update:0", "B:hydration-popover-child:0"],
    });
    await expect(b.getByTestId("popover-output-count")).toHaveText("1");
    await stopRetentionObservation(page);

    await trigger.click();
    await expect.poll(nativeOpen).toBe(true);
    await expect(b.getByTestId("popover-intent")).toHaveText("true");
    await expect(b.getByTestId("popover-output-count")).toHaveText("2");
    await expect(b.getByTestId("hydration-popover-child")).toContainText(
      "B retained Popover child: initial",
    );

    for (const label of ["A", "C"]) {
      await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
        "data-client-render-seen",
        "false",
      );
    }

    await expect(
      page.locator('[data-unit="C"]').getByTestId("hydration-popover-child"),
    ).toHaveCount(0);
  } finally {
    releaseMain();
    lazy.release();
  }
});

test("H1 H5 R4: eager raw SSR identities, settled markers, no transient child removal or initial replayed entrance", async ({
  page,
}, info) => {
  test.skip(
    info.project.metadata.hydration !== "eager",
    "Dedicated eager control; reverse incremental evidence lives in the other cases.",
  );

  const release = await bootstrapHeld(page, "/hydration", info);

  await expect(page.locator('[data-unit="A"]').getByTestId("hydration-presence")).toHaveAttribute(
    "data-present",
    "",
  );
  await expect(page.locator('[data-unit="B"]').getByTestId("hydration-popover-child")).toHaveCount(
    1,
  );
  await expect(page.locator('[data-unit="C"]').getByTestId("hydration-popover-child")).toHaveCount(
    0,
  );
  release();
  await shell(page, info.project.metadata.runtime);

  for (const label of ["A", "B", "C"]) {
    await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
      "data-client-render-seen",
      "true",
    );
  }

  await assertReferences(page, info);

  const discoveries = await page.evaluate(() => window.acceptanceObservation.discoveries);

  expect(
    discoveries.filter((read) => read.testid === "hydration-presence" && read.entering),
  ).toEqual([]);
  await stopRetentionObservation(page);

  const unit = page.locator('[data-unit="A"]');
  const host = await unit.getByTestId("hydration-popover-content").elementHandle();

  await unit.getByTestId("hydration-live-update").evaluate((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error("Missing ordinary live-binding control");
    }

    node.click();
  });
  await expect(unit.getByTestId("hydration-popover-child")).toContainText(
    "updated-after-attachment",
  );
  await unit.getByTestId("hydration-popover-trigger").click();
  await expect
    .poll(() =>
      unit
        .getByTestId("hydration-popover-content")
        .evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(false);
  await unit.getByTestId("hydration-popover-trigger").click();
  await expect
    .poll(() =>
      unit
        .getByTestId("hydration-popover-content")
        .evaluate((node) => node.matches(":popover-open")),
    )
    .toBe(true);
  expect(await host?.evaluate((node) => node.isConnected)).toBe(true);

  const values = await unit.getByTestId("hydration-accordion").getAttribute("data-item-values");

  await unit.getByTestId("generated-item-two").click();
  await expect(unit.getByTestId("generated-selection")).toHaveText(values?.split(",")[1] ?? "");
});

test("H3: actual early capture readiness and exactly-once initiating eager action while bootstrap is held", async ({
  page,
}, info) => {
  test.skip(info.project.metadata.hydration !== "eager", "Early-bootstrap eager replay control.");

  const release = await bootstrapHeld(page, "/hydration", info);

  try {
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.acceptanceObservation.registrations.some(
            (item) => item.type === "click" && item.target === "body",
          ),
        ),
      )
      .toBe(true);

    const unit = page.locator('[data-unit="B"]');

    await unit.getByTestId("hydration-collapsible-trigger").click();
    await expect(unit.getByTestId("expanded-output-count")).toHaveText("0");
    release();
    await shell(page, info.project.metadata.runtime);
    await expect(unit.getByTestId("expanded-output-count")).toHaveText("1");
    await expect(unit.getByTestId("hydration-collapsible-trigger")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await assertReferences(page, info);
  } finally {
    release();
  }
});

test("G3 H1 H2 H3: Toggle server pressed state and retained nodes; the first activation after attachment or replay flips once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    for (const label of ["A", "B"]) {
      const toggle = page.locator(`[data-unit="${label}"]`).getByTestId("hydration-toggle");

      await expect(toggle).toHaveAttribute("type", "button");
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(toggle).toHaveAttribute("data-pressed", "");
    }

    const unpressed = page.locator('[data-unit="C"]').getByTestId("hydration-toggle");

    await expect(unpressed).toHaveAttribute("aria-pressed", "false");
    await expect(unpressed).not.toHaveAttribute("data-pressed", /.*/);

    const b = page.locator('[data-unit="B"]');
    const toggle = b.getByTestId("hydration-toggle");

    if (incremental) {
      // Holds B's genuine deferred dependency so the initiating click must be replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.acceptanceObservation.registrations.some(
              (item) => item.type === "click" && item.target === "body",
            ),
          ),
        )
        .toBe(true);
      await toggle.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(b.getByTestId("pressed-output-count")).toHaveText("0");
      lazy.release();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");

      for (const label of ["A", "C"]) {
        await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
          "data-client-render-seen",
          "false",
        );
      }
    } else {
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
      await toggle.click();
    }

    await expect(b.getByTestId("pressed-output-count")).toHaveText("1");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).not.toHaveAttribute("data-pressed", /.*/);
    await assertReferences(page, info);
    await toggle.click();
    await expect(b.getByTestId("pressed-output-count")).toHaveText("2");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  } finally {
    releaseMain();
    releaseLazy();
  }
});

/** Server-rendered Tabs semantics; C has no selection and a disabled first Trigger. */
async function expectServerTabs(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const first = unit.getByTestId("hydration-tab-first");
    const second = unit.getByTestId("hydration-tab-second");
    const firstPanel = unit.getByTestId("hydration-panel-first");
    const secondPanel = unit.getByTestId("hydration-panel-second");

    await expect(first).toHaveAttribute("role", "tab");
    await expect(first).toHaveAttribute("type", "button");
    await expect(firstPanel).toHaveAttribute("role", "tabpanel");
    await expect(first).toHaveAttribute(
      "aria-controls",
      (await firstPanel.getAttribute("id")) ?? "",
    );
    await expect(secondPanel).toHaveAttribute(
      "aria-labelledby",
      (await second.getAttribute("id")) ?? "",
    );

    if (label === "C") {
      await expect(first).toBeDisabled();
      await expect(first).toHaveAttribute("aria-selected", "false");
      await expect(first).toHaveAttribute("tabindex", "-1");
      await expect(second).toHaveAttribute("aria-selected", "false");
      await expect(second).toHaveAttribute("tabindex", "0");
      await expect(firstPanel).toHaveAttribute("hidden", "");
      await expect(secondPanel).toHaveAttribute("hidden", "");
    } else {
      await expect(first).toHaveAttribute("aria-selected", "true");
      await expect(first).toHaveAttribute("tabindex", "0");
      await expect(second).toHaveAttribute("aria-selected", "false");
      await expect(second).toHaveAttribute("tabindex", "-1");
      await expect(firstPanel).not.toHaveAttribute("hidden", /.*/);
      await expect(secondPanel).toHaveAttribute("hidden", "");
    }

    // The conditional Trigger registers after the static ones but is first in DOM order.
    await expect(unit.getByTestId("hydration-order-early")).toHaveAttribute("tabindex", "0");
    await expect(unit.getByTestId("hydration-order-one")).toHaveAttribute("tabindex", "-1");
    await expect(unit.getByTestId("hydration-order-two")).toHaveAttribute("tabindex", "-1");
  }
}

test("S7 H1 H2 H3: Tabs server selection, DOM-order tab stop and associations survive hydration; a click after attachment or replay selects once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    await expectServerTabs(page, ["A", "B", "C"]);

    const b = page.locator('[data-unit="B"]');
    const second = b.getByTestId("hydration-tab-second");

    if (incremental) {
      // Holds B's genuine deferred dependency so the initiating click must be replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.acceptanceObservation.registrations.some(
              (item) => item.type === "click" && item.target === "body",
            ),
          ),
        )
        .toBe(true);
      await second.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(b.getByTestId("tab-output-count")).toHaveText("0");
      lazy.release();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");

      for (const label of ["A", "C"]) {
        await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
          "data-client-render-seen",
          "false",
        );
      }

      await expectServerTabs(page, ["A", "C"]);
    } else {
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
      // Hydration changes no server attribute.
      await expectServerTabs(page, ["A", "B", "C"]);
      await second.click();
    }

    await expect(b.getByTestId("tab-output-count")).toHaveText("1");
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(second).toHaveAttribute("tabindex", "0");
    await expect(b.getByTestId("hydration-tab-first")).toHaveAttribute("tabindex", "-1");
    await expect(b.getByTestId("hydration-panel-second")).not.toHaveAttribute("hidden", /.*/);
    await expect(b.getByTestId("hydration-panel-first")).toHaveAttribute("hidden", "");
    await expect(b.getByTestId("hydration-order-early")).toHaveAttribute("tabindex", "0");
    await assertReferences(page, info);
    await b.getByTestId("hydration-tab-first").click();
    await expect(b.getByTestId("tab-output-count")).toHaveText("2");
    await expect(b.getByTestId("hydration-tab-first")).toHaveAttribute("aria-selected", "true");
  } finally {
    releaseMain();
    releaseLazy();
  }
});

/**
 * In every unit: each roving widget's only tab stop is its third repeated item, Tabs Triggers
 * name the Panels a later `@for` renders, and the split Collapsible and Popover parts name each
 * other's bound IDs.
 */
async function expectRepeatedAndSplit(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);

    for (const widget of ["tab", "mark", "tool", "radio"]) {
      const items = unit.locator(`[data-testid^="repeated-${widget}-"]`);

      await expect(items).toHaveCount(3);
      await expect(items.and(page.locator('[tabindex="0"]'))).toHaveCount(1);
      await expect(unit.getByTestId(`repeated-${widget}-three`)).toHaveAttribute("tabindex", "0");
    }

    await expect(unit.getByTestId("repeated-tab-three")).toHaveAttribute("aria-selected", "true");
    await expect(unit.getByTestId("repeated-mark-three")).toHaveAttribute("aria-pressed", "true");
    await expect(unit.getByTestId("repeated-radio-three")).toHaveAttribute("aria-checked", "true");

    for (const key of ["one", "two", "three"]) {
      const trigger = unit.getByTestId(`repeated-tab-${key}`);
      const panel = unit.getByTestId(`repeated-panel-${key}`);

      await expect(trigger).toHaveAttribute("aria-controls", `${label}-repeated-panel-${key}`);
      await expect(panel).toHaveAttribute("id", `${label}-repeated-panel-${key}`);
      await expect(panel).toHaveAttribute(
        "aria-labelledby",
        (await trigger.getAttribute("id")) ?? "",
      );
    }

    await expect(unit.getByTestId("split-collapsible-trigger")).toHaveAttribute(
      "aria-controls",
      `${label}-split-panel`,
    );
    await expect(unit.getByTestId("split-collapsible-panel")).toHaveAttribute(
      "aria-labelledby",
      `${label}-split-trigger`,
    );
    await expect(unit.getByTestId("split-popover-trigger")).toHaveAttribute(
      "aria-controls",
      `${label}-split-content`,
    );
  }
}

test("S8 U7 K8 Q7 S9 L5 V15 H1 H2: repeated required-input items and parts rendered later keep one tab stop and complete associations in server HTML and through hydration", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);

  try {
    await expectRepeatedAndSplit(page, ["A", "B", "C"]);
    releaseMain();
    await shell(page, info.project.metadata.runtime);

    const b = page.locator('[data-unit="B"]');

    if (incremental) {
      await b.getByTestId("hydrate-unit").click();
    }

    await expect(b).toHaveAttribute("data-client-render-seen", "true");
    await expectRepeatedAndSplit(page, ["A", "B", "C"]);
    // Hydration changes no saved node, ID or association.
    await assertReferences(page, info);
  } finally {
    releaseMain();
  }
});

/** Every element ID in the document, with how often it occurs. */
async function documentIds(page: Page): Promise<Map<string, number>> {
  const ids = await page.evaluate(() => {
    const found: string[] = [];

    for (const element of document.querySelectorAll("[id]")) {
      found.push(element.id);
    }

    return found;
  });
  const counts = new Map<string, number>();

  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

test("I5 H1 H2: IDs the browser generates after a later block hydrates first collide with no ID of a dehydrated block", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);

  try {
    const serverIds = await documentIds(page);

    releaseMain();
    await shell(page, info.project.metadata.runtime);

    // Incremental: B, the later block, hydrates first while A and C stay dehydrated.
    const order = ["B", "A"];

    if (!incremental) {
      order.push("C");
    }

    for (const label of order) {
      const unit = page.locator(`[data-unit="${label}"]`);

      if (incremental) {
        await unit.getByTestId("hydrate-unit").click();
      }

      await expect(unit).toHaveAttribute("data-client-render-seen", "true");

      const trigger = unit.getByTestId("client-only-trigger");
      const panel = unit.getByTestId("client-only-panel");
      const triggerId = (await trigger.getAttribute("id")) ?? "";

      expect(triggerId).not.toBe("");
      expect(serverIds.has(triggerId)).toBe(false);
      expect(serverIds.has((await panel.getAttribute("id")) ?? "")).toBe(false);
      await expect(trigger).toHaveAttribute(
        "aria-controls",
        (await panel.getAttribute("id")) ?? "",
      );

      const duplicates: string[] = [];

      for (const [id, count] of await documentIds(page)) {
        if (count > 1) {
          duplicates.push(id);
        }
      }

      expect(duplicates).toEqual([]);
    }

    if (incremental) {
      await expect(page.locator('[data-unit="C"]')).toHaveAttribute(
        "data-client-render-seen",
        "false",
      );
      await expect(page.locator('[data-unit="C"]').getByTestId("client-only-trigger")).toHaveCount(
        0,
      );
    }

    await assertReferences(page, info);
  } finally {
    releaseMain();
  }
});

/** Server-rendered ToggleGroup semantics; C has no Single value, a disabled first item and no marks. */
async function expectServerToggleGroups(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const alignment = unit.getByTestId("hydration-alignment");
    const marks = unit.getByTestId("hydration-marks");
    const start = unit.getByTestId("hydration-align-start");
    const end = unit.getByTestId("hydration-align-end");
    const bold = unit.getByTestId("hydration-mark-bold");
    const italic = unit.getByTestId("hydration-mark-italic");
    const underline = unit.getByTestId("hydration-mark-underline");

    for (const group of [alignment, marks]) {
      await expect(group).toHaveAttribute("role", "group");
      await expect(group).toHaveAttribute("data-orientation", "horizontal");
      await expect(group).not.toHaveAttribute("aria-orientation", /.*/);
    }

    for (const item of [start, end, bold, italic, underline]) {
      await expect(item).toHaveAttribute("type", "button");
    }

    await expect(end).toHaveAttribute("aria-pressed", "false");
    await expect(underline).toHaveAttribute("aria-pressed", "false");
    await expect(underline).not.toHaveAttribute("data-pressed", /.*/);
    await expect(underline).toHaveAttribute("tabindex", "-1");
    await expect(italic).toHaveAttribute("tabindex", "-1");

    if (label === "C") {
      await expect(start).toBeDisabled();
      await expect(start).toHaveAttribute("aria-disabled", "true");
      await expect(start).toHaveAttribute("data-disabled", "");
      await expect(start).toHaveAttribute("aria-pressed", "false");
      await expect(start).toHaveAttribute("tabindex", "-1");
      await expect(end).toHaveAttribute("tabindex", "0");
      await expect(bold).toHaveAttribute("aria-pressed", "false");
      await expect(italic).toHaveAttribute("aria-pressed", "false");
      await expect(bold).toHaveAttribute("tabindex", "0");
    } else {
      await expect(start).toBeEnabled();
      await expect(start).toHaveAttribute("aria-pressed", "true");
      await expect(start).toHaveAttribute("data-pressed", "");
      await expect(start).toHaveAttribute("tabindex", "0");
      await expect(end).toHaveAttribute("tabindex", "-1");
      await expect(bold).toHaveAttribute("aria-pressed", "true");
      await expect(bold).toHaveAttribute("data-pressed", "");
      await expect(italic).toHaveAttribute("aria-pressed", "true");
      await expect(bold).toHaveAttribute("tabindex", "0");
    }
  }
}

test("U6 H1 H2 H3: ToggleGroup server pressed state and DOM-order tab stop survive hydration; a click after attachment or replay presses once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    await expectServerToggleGroups(page, ["A", "B", "C"]);

    const b = page.locator('[data-unit="B"]');
    const underline = b.getByTestId("hydration-mark-underline");

    if (incremental) {
      // Holds B's genuine deferred dependency so the initiating click must be replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.acceptanceObservation.registrations.some(
              (item) => item.type === "click" && item.target === "body",
            ),
          ),
        )
        .toBe(true);
      await underline.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(b.getByTestId("mark-output-count")).toHaveText("0");
      lazy.release();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");

      for (const label of ["A", "C"]) {
        await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
          "data-client-render-seen",
          "false",
        );
      }

      await expectServerToggleGroups(page, ["A", "C"]);
    } else {
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
      // Hydration changes no server attribute.
      await expectServerToggleGroups(page, ["A", "B", "C"]);
      await underline.click();
    }

    await expect(b.getByTestId("mark-output-count")).toHaveText("1");
    await expect(underline).toHaveAttribute("aria-pressed", "true");
    await expect(underline).toHaveAttribute("data-pressed", "");
    await expect(b.getByTestId("hydration-mark-bold")).toHaveAttribute("aria-pressed", "true");
    await expect(b.getByTestId("hydration-mark-italic")).toHaveAttribute("aria-pressed", "true");
    await assertReferences(page, info);
    await b.getByTestId("hydration-mark-bold").click();
    await expect(b.getByTestId("mark-output-count")).toHaveText("2");
    await expect(b.getByTestId("hydration-mark-bold")).toHaveAttribute("aria-pressed", "false");
    await expect(underline).toHaveAttribute("aria-pressed", "true");
  } finally {
    releaseMain();
    releaseLazy();
  }
});

/** Server-rendered Toolbar semantics; C is vertical with a disabled first item and no marks. */
async function expectServerToolbars(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const toolbar = unit.getByTestId("hydration-toolbar");
    const undo = unit.getByTestId("hydration-toolbar-undo");
    const redo = unit.getByTestId("hydration-toolbar-redo");
    const bold = unit.getByTestId("hydration-toolbar-bold");
    const italic = unit.getByTestId("hydration-toolbar-italic");
    const clear = unit.getByTestId("hydration-toolbar-clear");
    const groupToolbar = unit.getByTestId("hydration-group-toolbar");

    await expect(toolbar).toHaveAttribute("role", "toolbar");
    await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1);
    await expect(unit.getByTestId("hydration-toolbar-marks")).toHaveAttribute("role", "group");

    for (const item of [undo, redo, bold, italic, clear]) {
      await expect(item).toHaveAttribute("type", "button");
    }

    await expect(italic).toHaveAttribute("aria-pressed", "false");
    await expect(italic).toHaveAttribute("tabindex", "-1");
    await expect(clear).toHaveAttribute("tabindex", "-1");

    if (label === "C") {
      await expect(toolbar).toHaveAttribute("aria-orientation", "vertical");
      await expect(toolbar).toHaveAttribute("data-orientation", "vertical");
      await expect(undo).toBeDisabled();
      await expect(undo).toHaveAttribute("aria-disabled", "true");
      await expect(undo).toHaveAttribute("data-disabled", "");
      await expect(undo).toHaveAttribute("tabindex", "-1");
      await expect(redo).toHaveAttribute("tabindex", "0");
      await expect(bold).toHaveAttribute("aria-pressed", "false");
    } else {
      await expect(toolbar).toHaveAttribute("aria-orientation", "horizontal");
      await expect(toolbar).toHaveAttribute("data-orientation", "horizontal");
      await expect(undo).toBeEnabled();
      await expect(undo).toHaveAttribute("tabindex", "0");
      await expect(redo).toHaveAttribute("tabindex", "-1");
      // A pressed Toolbar group item is not preferred.
      await expect(bold).toHaveAttribute("aria-pressed", "true");
      await expect(bold).toHaveAttribute("tabindex", "-1");
    }

    // The Toolbar group comes first: its first item is the tab stop, not the pressed second one.
    await expect(groupToolbar.locator('button[tabindex="0"]')).toHaveCount(1);
    await expect(unit.getByTestId("hydration-group-first")).toHaveAttribute("tabindex", "0");
    await expect(unit.getByTestId("hydration-group-second")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(unit.getByTestId("hydration-group-second")).toHaveAttribute("tabindex", "-1");
  }
}

test("K6 H1 H2 H3: Toolbar server tab stop across Toolbar groups survives hydration; a click after attachment or replay runs the handler once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    await expectServerToolbars(page, ["A", "B", "C"]);

    const b = page.locator('[data-unit="B"]');
    const clear = b.getByTestId("hydration-toolbar-clear");

    if (incremental) {
      // Holds B's genuine deferred dependency so the initiating click must be replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.acceptanceObservation.registrations.some(
              (item) => item.type === "click" && item.target === "body",
            ),
          ),
        )
        .toBe(true);
      await clear.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(b.getByTestId("toolbar-clear-count")).toHaveText("0");
      lazy.release();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");

      for (const label of ["A", "C"]) {
        await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
          "data-client-render-seen",
          "false",
        );
      }

      await expectServerToolbars(page, ["A", "C"]);
    } else {
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
      // Hydration changes no server attribute.
      await expectServerToolbars(page, ["A", "B", "C"]);
      await clear.click();
    }

    await expect(b.getByTestId("toolbar-clear-count")).toHaveText("1");
    await assertReferences(page, info);
    await b.getByTestId("hydration-toolbar-italic").click();
    await expect(b.getByTestId("hydration-toolbar-italic")).toHaveAttribute("aria-pressed", "true");
    await expect(b.getByTestId("hydration-toolbar-bold")).toHaveAttribute("aria-pressed", "true");
    await expect(b.getByTestId("toolbar-clear-count")).toHaveText("1");
    await expect(b.getByTestId("toolbar-undo-count")).toHaveText("0");
  } finally {
    releaseMain();
    releaseLazy();
  }
});

/** Server-rendered K10 Toolbar: one binding disables the Popover Trigger and its toolbar item in A and B. */
async function expectServerFormat(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const format = unit.getByTestId("hydration-format");
    const bold = unit.getByTestId("hydration-format-bold");

    await expect(
      unit.getByTestId("hydration-format-toolbar").locator('button[tabindex="0"]'),
    ).toHaveCount(1);

    if (label === "C") {
      await expect(format).not.toHaveAttribute("disabled");
      await expect(format).not.toHaveAttribute("aria-disabled", /.*/);
      await expect(format).not.toHaveAttribute("data-disabled", /.*/);
      await expect(format).toHaveAttribute("tabindex", "0");
      await expect(bold).toHaveAttribute("tabindex", "-1");
    } else {
      await expect(format).toHaveAttribute("disabled");
      await expect(format).toHaveAttribute("aria-disabled", "true");
      await expect(format).toHaveAttribute("data-disabled", "");
      await expect(format).toHaveAttribute("tabindex", "-1");
      await expect(bold).toHaveAttribute("tabindex", "0");
    }
  }
}

test("K10 H1 H2: a disabled Popover Trigger co-applied with a toolbar item is skipped in server HTML and once hydrated; the enabled one opens its Popover", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);

  try {
    await expectServerFormat(page, ["A", "B", "C"]);
    releaseMain();
    await shell(page, info.project.metadata.runtime);

    const b = page.locator('[data-unit="B"]');
    const c = page.locator('[data-unit="C"]');

    for (const unit of [b, c]) {
      if (incremental) {
        await unit.getByTestId("hydrate-unit").click();
      }

      await expect(unit).toHaveAttribute("data-client-render-seen", "true");
    }

    if (incremental) {
      await expect(page.locator('[data-unit="A"]')).toHaveAttribute(
        "data-client-render-seen",
        "false",
      );
    }

    // Hydration changes no server attribute.
    await expectServerFormat(page, ["A", "B", "C"]);
    await assertReferences(page, info);

    function nativeOpen(unit: Locator): Promise<boolean> {
      return unit
        .getByTestId("hydration-format-content")
        .evaluate((node) => node.matches(":popover-open"));
    }

    // B, disabled: Tab reaches Bold, ArrowRight keeps it and the click opens nothing.
    await b.getByTestId("hydration-format-before").focus();
    await page.keyboard.press("Tab");
    await expect(b.getByTestId("hydration-format-bold")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(b.getByTestId("hydration-format-bold")).toBeFocused();
    await b.getByTestId("hydration-format").click({ force: true });
    // A wrong open would render only after the zoneless scheduler's next turn (an animation frame
    // or a timer), so let both pass, and check before any outside click could dismiss it.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
    );
    expect(await nativeOpen(b)).toBe(false);

    // C, enabled: Tab reaches the Trigger, ArrowRight moves to Bold and clicks open and close.
    const format = c.getByTestId("hydration-format");

    await c.getByTestId("hydration-format-before").focus();
    await page.keyboard.press("Tab");
    await expect(format).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(c.getByTestId("hydration-format-bold")).toBeFocused();
    await format.click();
    await expect.poll(() => nativeOpen(c)).toBe(true);
    await format.click();
    await expect.poll(() => nativeOpen(c)).toBe(false);
  } finally {
    releaseMain();
  }
});

/** Server-rendered V16 Popover: the Trigger's own input disables it in A and B; the root stays enabled. */
async function expectServerShare(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const share = unit.getByTestId("hydration-share");

    await expect(unit.getByTestId("hydration-share-root-disabled")).toHaveText("false");

    if (label === "C") {
      await expect(share).not.toHaveAttribute("disabled");
      await expect(share).not.toHaveAttribute("aria-disabled", /.*/);
      await expect(share).not.toHaveAttribute("data-disabled", /.*/);
    } else {
      await expect(share).toHaveAttribute("disabled");
      await expect(share).toHaveAttribute("aria-disabled", "true");
      await expect(share).toHaveAttribute("data-disabled", "");
    }
  }
}

test("V16 H1 H2: a Popover Trigger disabled by its own input keeps its disabled attributes in server HTML and once hydrated; the enabled one opens its Popover", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);

  try {
    await expectServerShare(page, ["A", "B", "C"]);
    releaseMain();
    await shell(page, info.project.metadata.runtime);

    const b = page.locator('[data-unit="B"]');
    const c = page.locator('[data-unit="C"]');

    for (const unit of [b, c]) {
      if (incremental) {
        await unit.getByTestId("hydrate-unit").click();
      }

      await expect(unit).toHaveAttribute("data-client-render-seen", "true");
    }

    // Hydration changes no server attribute.
    await expectServerShare(page, ["A", "B", "C"]);
    await assertReferences(page, info);

    function nativeOpen(unit: Locator): Promise<boolean> {
      return unit
        .getByTestId("hydration-share-content")
        .evaluate((node) => node.matches(":popover-open"));
    }

    // B, disabled: native `disabled` drops the trusted click before any listener runs. A
    // dispatched click still reaches the listeners, so only the Trigger's own guard keeps it closed.
    const disabledShare = b.getByTestId("hydration-share");

    await disabledShare.click({ force: true });

    const dispatched = await disabledShare.evaluate((element) => {
      let received = 0;

      element.addEventListener("click", () => {
        received += 1;
      });
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

      return received;
    });

    expect(dispatched).toBe(1);
    // A wrong open would render only after the zoneless scheduler's next turn (an animation frame
    // or a timer), so let both pass.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))),
    );
    expect(await nativeOpen(b)).toBe(false);

    // C, enabled: clicks open and close.
    const share = c.getByTestId("hydration-share");

    await share.click();
    await expect.poll(() => nativeOpen(c)).toBe(true);
    await share.click();
    await expect.poll(() => nativeOpen(c)).toBe(false);
  } finally {
    releaseMain();
  }
});

/**
 * Server-rendered content and observations read through composing directives' `state`: open,
 * expanded and pressed in A and B, closed with nothing gated in C.
 */
async function expectServerComposedState(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const present = label !== "C";
    let children = 0;

    if (present) {
      children = 1;
    }

    await expect(unit.getByTestId("hydration-state-panel-child")).toHaveCount(children);
    await expect(unit.getByTestId("hydration-state-item-child")).toHaveCount(children);
    await expect(unit.getByTestId("hydration-state-item-expanded")).toHaveText(String(present));
    await expect(unit.getByTestId("hydration-state-start-pressed")).toHaveText(String(present));

    for (const panel of ["hydration-state-panel", "hydration-state-item-panel"]) {
      if (present) {
        await expect(unit.getByTestId(panel)).not.toHaveAttribute("hidden", /.*/);
      } else {
        await expect(unit.getByTestId(panel)).toHaveAttribute("hidden", "");
      }
    }
  }
}

test("L7 A7 A8 U8 H1 H2: content gated on a Panel's state and Item state observations are in server HTML and kept through hydration; they follow interaction once hydrated", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);

  try {
    await expectServerComposedState(page, ["A", "B", "C"]);
    releaseMain();
    await shell(page, info.project.metadata.runtime);

    const b = page.locator('[data-unit="B"]');
    const c = page.locator('[data-unit="C"]');

    for (const unit of [b, c]) {
      if (incremental) {
        await unit.getByTestId("hydrate-unit").click();
      }

      await expect(unit).toHaveAttribute("data-client-render-seen", "true");
    }

    // Hydration changes no server observation and removes no saved node.
    await expectServerComposedState(page, ["A", "B", "C"]);
    await assertReferences(page, info);

    // C, initially closed: interaction opens, expands and presses through the same references.
    await c.getByTestId("hydration-state-trigger").click();
    await expect(c.getByTestId("hydration-state-panel-child")).toHaveCount(1);
    await c.getByTestId("hydration-state-item-trigger").click();
    await expect(c.getByTestId("hydration-state-item-expanded")).toHaveText("true");
    await expect(c.getByTestId("hydration-state-item-child")).toHaveCount(1);
    await c.getByTestId("hydration-state-start").click();
    await expect(c.getByTestId("hydration-state-start-pressed")).toHaveText("true");

    // B, initially open: collapsing releases the gated children.
    await b.getByTestId("hydration-state-trigger").click();
    await expect(b.getByTestId("hydration-state-panel-child")).toHaveCount(0);
    await b.getByTestId("hydration-state-item-trigger").click();
    await expect(b.getByTestId("hydration-state-item-expanded")).toHaveText("false");
    await expect(b.getByTestId("hydration-state-item-child")).toHaveCount(0);
  } finally {
    releaseMain();
  }
});

/** Server-rendered RadioGroup semantics; C has nothing checked and a disabled first radio. */
async function expectServerRadioGroups(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const group = unit.getByTestId("hydration-speed");
    const standard = unit.getByTestId("hydration-speed-standard");
    const express = unit.getByTestId("hydration-speed-express");
    const sameDay = unit.getByTestId("hydration-speed-same-day");
    const lockedFirst = unit.getByTestId("hydration-locked-first");
    const lockedSecond = unit.getByTestId("hydration-locked-second");
    const toolbar = unit.getByTestId("hydration-radio-toolbar");
    const center = unit.getByTestId("hydration-radio-center");

    await expect(group).toHaveAttribute("role", "radiogroup");
    await expect(group.locator('button[tabindex="0"]')).toHaveCount(1);

    for (const item of [standard, express, sameDay]) {
      await expect(item).toHaveAttribute("type", "button");
      await expect(item).toHaveAttribute("role", "radio");
    }

    await expect(sameDay).toHaveAttribute("aria-checked", "false");
    await expect(sameDay).not.toHaveAttribute("data-checked", /.*/);
    await expect(sameDay).toHaveAttribute("tabindex", "-1");
    // Express is the tab stop in every unit: checked in A and B, the first enabled in C.
    await expect(express).toHaveAttribute("tabindex", "0");

    if (label === "C") {
      await expect(standard).toBeDisabled();
      await expect(standard).toHaveAttribute("aria-disabled", "true");
      await expect(standard).toHaveAttribute("data-disabled", "");
      await expect(standard).toHaveAttribute("tabindex", "-1");
      await expect(express).toHaveAttribute("aria-checked", "false");
    } else {
      await expect(standard).toBeEnabled();
      await expect(standard).toHaveAttribute("tabindex", "-1");
      await expect(express).toHaveAttribute("aria-checked", "true");
      await expect(express).toHaveAttribute("data-checked", "");
    }

    // A disabled checked radio stays checked and the first enabled radio is the tab stop.
    await expect(lockedFirst).toBeDisabled();
    await expect(lockedFirst).toHaveAttribute("aria-checked", "true");
    await expect(lockedFirst).toHaveAttribute("tabindex", "-1");
    await expect(lockedSecond).toHaveAttribute("tabindex", "0");

    // A checked Toolbar Radio Group radio is not preferred: the Toolbar's first control is its tab stop.
    await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1);
    await expect(unit.getByTestId("hydration-radio-copy")).toHaveAttribute("tabindex", "0");
    await expect(center).toHaveAttribute("aria-checked", "true");
    await expect(center).toHaveAttribute("tabindex", "-1");
  }
}

test("Q6 H1 H2 H3: RadioGroup server checked state and DOM-order tab stops survive hydration; a click after attachment or replay checks once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    await expectServerRadioGroups(page, ["A", "B", "C"]);

    const b = page.locator('[data-unit="B"]');
    const sameDay = b.getByTestId("hydration-speed-same-day");

    if (incremental) {
      // Holds B's genuine deferred dependency so the initiating click must be replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.acceptanceObservation.registrations.some(
              (item) => item.type === "click" && item.target === "body",
            ),
          ),
        )
        .toBe(true);
      await sameDay.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(b.getByTestId("speed-output-count")).toHaveText("0");
      lazy.release();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");

      for (const label of ["A", "C"]) {
        await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
          "data-client-render-seen",
          "false",
        );
      }

      await expectServerRadioGroups(page, ["A", "C"]);
    } else {
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
      // Hydration changes no server attribute.
      await expectServerRadioGroups(page, ["A", "B", "C"]);
      await sameDay.click();
    }

    await expect(b.getByTestId("speed-output-count")).toHaveText("1");
    await expect(sameDay).toHaveAttribute("aria-checked", "true");
    await expect(sameDay).toHaveAttribute("data-checked", "");
    await expect(b.getByTestId("hydration-speed-express")).toHaveAttribute("aria-checked", "false");
    await assertReferences(page, info);
    await b.getByTestId("hydration-speed-standard").click();
    await expect(b.getByTestId("speed-output-count")).toHaveText("2");
    await expect(b.getByTestId("hydration-speed-standard")).toHaveAttribute("aria-checked", "true");
    await expect(sameDay).toHaveAttribute("aria-checked", "false");
  } finally {
    releaseMain();
    releaseLazy();
  }
});

test("H4: nested real owner/part boundaries attach ancestor first, retain SSR nodes, suppress and remount", async ({
  page,
}, info) => {
  const releaseMain = await bootstrapHeld(page, "/nested", info);
  const lazy = await holdDependency(page, "data-parts-render");

  try {
    releaseMain();
    await shell(page, info.project.metadata.runtime);

    if (info.project.metadata.hydration === "incremental") {
      await expect(page.locator("acceptance-nested-owner")).toHaveAttribute(
        "data-owner-render",
        "false",
      );
      await page.getByTestId("nested-parts-attach").click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(page.locator("acceptance-nested-owner")).toHaveAttribute(
        "data-owner-render",
        "true",
      );
      await expect(page.locator("acceptance-nested-parts")).toHaveAttribute(
        "data-parts-render",
        "false",
      );
    }

    lazy.release();
    await expect(page.locator("acceptance-nested-parts")).toHaveAttribute(
      "data-parts-render",
      "true",
    );

    if (info.project.metadata.hydration === "incremental") {
      await expect(page.getByTestId("nested-parts-actions")).toHaveText("1");
    }

    await assertReferences(page, info);
    await stopRetentionObservation(page);
    await expect(page.getByTestId("nested-child-intent")).toHaveText("true");

    const liveChild = await page.getByTestId("nested-child-owner").elementHandle();

    await page.getByTestId("nested-child-action").focus();
    await page.getByTestId("nested-parent-close").evaluate((node) => {
      if (!(node instanceof HTMLButtonElement)) {
        throw new Error("Expected script close control");
      }

      node.click();
    });
    await expect(page.getByTestId("nested-child-intent")).toHaveText("true");
    await expect
      .poll(() =>
        page.getByTestId("nested-child-content").evaluate((node) => node.matches(":popover-open")),
      )
      .toBe(false);

    if (info.project.metadata.motion !== "reduce") {
      await expect(page.getByTestId("nested-content")).toHaveJSProperty("inert", true);
      expect(
        await page
          .getByTestId("nested-content")
          .evaluate((node) =>
            node.getAnimations().some((animation) => animation.playState === "running"),
          ),
      ).toBe(true);
    }

    // Settle ordinary gated children independently: the logical child owner must still be exact/live.
    await expect(page.getByTestId("nested-content-child")).toHaveCount(0);
    await expect(page.getByTestId("nested-child-intent")).toHaveText("true");
    expect(
      await liveChild?.evaluate(
        (node) =>
          node.isConnected && node === document.querySelector('[data-testid="nested-child-owner"]'),
      ),
    ).toBe(true);

    const old = await page.getByTestId("nested-content").elementHandle();

    await page.getByTestId("nested-mount").click();
    await expect(page.getByTestId("nested-owner")).toHaveCount(0);
    expect(await liveChild?.evaluate((node) => node.isConnected)).toBe(false);
    await page.getByTestId("nested-mount").click();
    // This is a fresh client defer render, not a dehydrated SSR boundary needing replay.
    // Clicking its external Attach button would correctly dismiss the newly opened parent.
    await expect(page.locator("acceptance-nested-parts")).toHaveAttribute(
      "data-parts-render",
      "true",
    );
    await expect(page.getByTestId("nested-panel-child")).toHaveCount(1);
    await expect(page.getByTestId("nested-parent-intent")).toHaveText("true");
    await expect(page.getByTestId("nested-child-intent")).toHaveText("true");
    await expect
      .poll(() =>
        page.getByTestId("nested-content").evaluate((node) => node.matches(":popover-open")),
      )
      .toBe(true);
    expect(await old?.evaluate((node) => node.isConnected)).toBe(false);
  } finally {
    releaseMain();
    lazy.release();
  }
});
