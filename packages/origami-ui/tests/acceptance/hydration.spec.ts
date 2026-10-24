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

    await expect(end).toHaveAttribute("id", `hydration-align-end-${label}`);
    await expect(start).toHaveAttribute("id", /^og-toggle-group-item-s\d+$/);
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

test("U6 H1 H2 H3: ToggleGroup server pressed state, item IDs and DOM-order tab stop survive hydration; a click after attachment or replay presses once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    await expectServerToggleGroups(page, ["A", "B", "C"]);

    const b = page.locator('[data-unit="B"]');
    const underline = b.getByTestId("hydration-mark-underline");
    const start = b.getByTestId("hydration-align-start");
    const serverStartId = await start.getAttribute("id");

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
    // Hydration adopted the generated item ID and kept the bound one.
    await expect(start).toHaveAttribute("id", serverStartId ?? "");
    await expect(b.getByTestId("hydration-align-end")).toHaveAttribute(
      "id",
      "hydration-align-end-B",
    );
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

/** Server-rendered K10 Toolbar: the Toolbar Popover Trigger's own input disables it in A and B. */
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

test("K10 H1 H2: a disabled Toolbar Popover Trigger is skipped in server HTML and once hydrated; the enabled one opens its Popover", async ({
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

    // B, disabled: Tab reaches Bold, ArrowRight keeps it and the clicks open nothing.
    await b.getByTestId("hydration-format-before").focus();
    await page.keyboard.press("Tab");
    await expect(b.getByTestId("hydration-format-bold")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(b.getByTestId("hydration-format-bold")).toBeFocused();
    await b.getByTestId("hydration-format").click({ force: true });

    // Native `disabled` drops the trusted click before any listener runs. A dispatched click
    // still reaches the listeners, so only the hydrated Trigger's own guard keeps it closed.
    const dispatched = await b.getByTestId("hydration-format").evaluate((element) => {
      let received = 0;

      element.addEventListener("click", () => {
        received += 1;
      });
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

      return received;
    });

    expect(dispatched).toBe(1);
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

/** Server-rendered F2 Buttons: disabled in A and B, one of them focusable; enabled in C. */
async function expectServerButtons(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const button = unit.getByTestId("hydration-button");
    const focusable = unit.getByTestId("hydration-button-focusable");

    for (const candidate of [button, focusable]) {
      await expect(candidate).toHaveAttribute("type", "button");
    }

    if (label === "C") {
      for (const candidate of [button, focusable]) {
        await expect(candidate).not.toHaveAttribute("disabled");
        await expect(candidate).not.toHaveAttribute("aria-disabled", /.*/);
        await expect(candidate).not.toHaveAttribute("data-disabled", /.*/);
      }
    } else {
      await expect(button).toHaveAttribute("disabled");
      await expect(focusable).not.toHaveAttribute("disabled");

      for (const candidate of [button, focusable]) {
        await expect(candidate).toHaveAttribute("aria-disabled", "true");
        await expect(candidate).toHaveAttribute("data-disabled", "");
      }
    }
  }
}

test("F2 H1 H2: a Button's disabled attributes are in server HTML and kept through hydration; once hydrated a focusable disabled Button still runs its click listener", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);

  try {
    await expectServerButtons(page, ["A", "B", "C"]);
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
    await expectServerButtons(page, ["A", "B", "C"]);
    await assertReferences(page, info);

    // B: the natively disabled Button drops the trusted click; the focusable one takes focus and
    // its listener runs.
    await b.getByTestId("hydration-button").click({ force: true });
    await b.getByTestId("hydration-button-focusable").focus();
    await expect(b.getByTestId("hydration-button-focusable")).toBeFocused();
    await b.getByTestId("hydration-button-focusable").click({ force: true });
    await expect(b.getByTestId("focusable-button-click-count")).toHaveText("1");
    await expect(b.getByTestId("button-click-count")).toHaveText("0");

    // C: both are enabled.
    await c.getByTestId("hydration-button").click();
    await c.getByTestId("hydration-button-focusable").click();
    await expect(c.getByTestId("button-click-count")).toHaveText("1");
    await expect(c.getByTestId("focusable-button-click-count")).toHaveText("1");
  } finally {
    releaseMain();
  }
});

/** Server-rendered F5 Toolbar: Cut, a Toolbar Toggle pressed in A and B, a Toolbar Popover Trigger. */
async function expectServerVariants(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const spelling = unit.getByTestId("hydration-variants-spelling");
    const insert = unit.getByTestId("hydration-variants-insert");

    await expect(
      unit.getByTestId("hydration-variants-toolbar").locator('button[tabindex="0"]'),
    ).toHaveCount(1);
    await expect(unit.getByTestId("hydration-variants-cut")).toHaveAttribute("tabindex", "0");

    for (const control of [spelling, insert]) {
      await expect(control).toHaveAttribute("type", "button");
      await expect(control).toHaveAttribute("tabindex", "-1");
      await expect(control).not.toHaveAttribute("disabled");
    }

    await expect(insert).toHaveAttribute("aria-expanded", "false");
    await expect(insert).toHaveAttribute(
      "aria-controls",
      (await unit.getByTestId("hydration-variants-content").getAttribute("id")) ?? "",
    );

    if (label === "C") {
      await expect(spelling).toHaveAttribute("aria-pressed", "false");
      await expect(spelling).not.toHaveAttribute("data-pressed", /.*/);
      await expect(unit.getByTestId("hydration-variants-spelling-state")).toHaveText("false");
    } else {
      await expect(spelling).toHaveAttribute("aria-pressed", "true");
      await expect(spelling).toHaveAttribute("data-pressed", "");
      await expect(unit.getByTestId("hydration-variants-spelling-state")).toHaveText("true");
    }
  }
}

test("F5 H1 H2 H3: a Toolbar Toggle and a Toolbar Popover Trigger keep their server attributes and one tab stop through hydration; a click after attachment or replay presses once; both share the Toolbar's arrows", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    await expectServerVariants(page, ["A", "B", "C"]);

    const b = page.locator('[data-unit="B"]');
    const spelling = b.getByTestId("hydration-variants-spelling");

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
      await spelling.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(b.getByTestId("hydration-variants-spelling-outputs")).toHaveText("0");
      lazy.release();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");

      for (const label of ["A", "C"]) {
        await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
          "data-client-render-seen",
          "false",
        );
      }

      await expectServerVariants(page, ["A", "C"]);
    } else {
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
      // Hydration changes no server attribute.
      await expectServerVariants(page, ["A", "B", "C"]);
      await spelling.click();
    }

    await expect(b.getByTestId("hydration-variants-spelling-outputs")).toHaveText("1");
    await expect(spelling).toHaveAttribute("aria-pressed", "false");
    await expect(b.getByTestId("hydration-variants-spelling-state")).toHaveText("false");
    await assertReferences(page, info);

    // Both variants are stops in the Toolbar's one arrow sequence; moves press and open nothing.
    await b.getByTestId("hydration-variants-cut").focus();

    for (const testid of [
      "hydration-variants-spelling",
      "hydration-variants-insert",
      "hydration-variants-cut",
    ]) {
      await page.keyboard.press("ArrowRight");
      await expect(b.getByTestId(testid)).toBeFocused();
    }

    await expect(b.getByTestId("hydration-variants-spelling-outputs")).toHaveText("1");
    await expect(b.getByTestId("hydration-variants-insert-open")).toHaveText("false");

    const insert = b.getByTestId("hydration-variants-insert");

    await insert.click();
    await expect(b.getByTestId("hydration-variants-insert-open")).toHaveText("true");
    await expect
      .poll(() =>
        b
          .getByTestId("hydration-variants-content")
          .evaluate((node) => node.matches(":popover-open")),
      )
      .toBe(true);
    await expect(insert).toHaveAttribute("tabindex", "0");
    await insert.click();
    await expect(b.getByTestId("hydration-variants-insert-open")).toHaveText("false");
  } finally {
    releaseMain();
    releaseLazy();
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

/** Select server state: closed, labelled by the consumer from the selected option, no active descendant. */
async function expectServerSelects(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const trigger = unit.getByTestId("hydration-select-trigger");
    const content = unit.getByTestId("hydration-select-content");
    const mint = unit.getByTestId("hydration-flavor-mint");
    const selected = label !== "C";

    await expect(trigger).toHaveAttribute("role", "combobox");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveAttribute(
      "aria-controls",
      (await content.getAttribute("id")) ?? "",
    );
    await expect(trigger).not.toHaveAttribute("aria-activedescendant", /.*/);
    await expect(content).toHaveAttribute("role", "listbox");
    await expect(content).toHaveAttribute("popover", "manual");
    await expect(content).toHaveAttribute("inert", "");
    await expect(mint).toHaveAttribute("aria-selected", String(selected));

    if (selected) {
      await expect(trigger).toHaveText("Mint");
      await expect(trigger).not.toHaveAttribute("data-placeholder", /.*/);
    } else {
      await expect(trigger).toHaveText("Choose a flavor");
      await expect(trigger).toHaveAttribute("data-placeholder", "");
    }
  }
}

test("Z8 H1 H2 H3: a Select's server HTML is closed with the consumer's label and no active descendant, and hydration keeps it; a Trigger click after attachment or replay opens it once on the selected option", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    await expectServerSelects(page, ["A", "B", "C"]);

    const b = page.locator('[data-unit="B"]');
    const trigger = b.getByTestId("hydration-select-trigger");
    const content = b.getByTestId("hydration-select-content");

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
      await trigger.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(b.getByTestId("flavor-open-count")).toHaveText("0");
      lazy.release();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");

      for (const label of ["A", "C"]) {
        await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
          "data-client-render-seen",
          "false",
        );
      }

      await expectServerSelects(page, ["A", "C"]);
    } else {
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
      // Hydration changes no server attribute.
      await expectServerSelects(page, ["A", "B", "C"]);
      await trigger.click();
    }

    await expect.poll(() => content.evaluate((node) => node.matches(":popover-open"))).toBe(true);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      (await b.getByTestId("hydration-flavor-mint").getAttribute("id")) ?? "",
    );
    await expect(b.getByTestId("flavor-open-count")).toHaveText("1");
    await assertReferences(page, info);
    await b.getByTestId("hydration-flavor-vanilla").click();
    await expect.poll(() => content.evaluate((node) => node.matches(":popover-open"))).toBe(false);
    await expect(trigger).toHaveText("Vanilla");
    await expect(b.getByTestId("flavor-open-count")).toHaveText("2");
  } finally {
    releaseMain();
    releaseLazy();
  }
});

type FieldIds = {
  control: string | null;
  label: string | null;
  description: string | null;
  error: string | null;
  afterControl: string | null;
  afterLabel: string | null;
};

/** Field associations as rendered: B shows its error from the start. */
async function expectServerFields(page: Page, labels: string[]): Promise<Map<string, FieldIds>> {
  const ids = new Map<string, FieldIds>();

  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const field = unit.getByTestId("hydration-field");
    const control = unit.getByTestId("hydration-field-control");
    const error = unit.getByTestId("hydration-field-error");
    const afterControl = unit.getByTestId("hydration-field-after-control");
    const unitIds: FieldIds = {
      control: await control.getAttribute("id"),
      label: await unit.getByTestId("hydration-field-label").getAttribute("id"),
      description: await unit.getByTestId("hydration-field-description").getAttribute("id"),
      error: null,
      afterControl: await afterControl.getAttribute("id"),
      afterLabel: await unit.getByTestId("hydration-field-after-label").getAttribute("id"),
    };

    for (const id of [
      unitIds.control,
      unitIds.label,
      unitIds.description,
      unitIds.afterControl,
      unitIds.afterLabel,
    ]) {
      expect(id).toMatch(/\S/);
    }

    await expect(unit.getByTestId("hydration-field-label")).toHaveAttribute(
      "for",
      unitIds.control ?? "",
    );
    await expect(unit.getByTestId("hydration-field-after-label")).toHaveAttribute(
      "for",
      unitIds.afterControl ?? "",
    );
    await expect(afterControl).not.toHaveAttribute("aria-describedby", /.*/);
    await expect(field).toHaveAttribute("data-required", "");
    await expect(control).toHaveAttribute("required", "");
    await expect(control).not.toHaveAttribute("aria-required", /.*/);
    // Outside a Field, composed parts keep their own host's static attributes.
    await expect(unit.getByTestId("hydration-field-composed-label")).toHaveAttribute(
      "for",
      "composed-for",
    );
    await expect(unit.getByTestId("hydration-field-composed-control")).toHaveAttribute(
      "aria-describedby",
      "composed-static",
    );

    if (label === "B") {
      unitIds.error = await error.getAttribute("id");
      expect(unitIds.error).toMatch(/\S/);
      await expect(field).toHaveAttribute("data-invalid", "");
      await expect(control).toHaveAttribute("aria-invalid", "true");
      await expect(control).toHaveAttribute(
        "aria-describedby",
        `${unitIds.description} ${unitIds.error}`,
      );
    } else {
      await expect(error).toHaveCount(0);
      await expect(field).not.toHaveAttribute("data-invalid", /.*/);
      await expect(control).not.toHaveAttribute("aria-invalid", /.*/);
      await expect(control).toHaveAttribute("aria-describedby", unitIds.description ?? "");
    }

    ids.set(label, unitIds);
  }

  return ids;
}

test("M6 H1 H2: Field IDs, for and aria-describedby are in server HTML, Label before and after the control, with an error shown from the start, and composed parts outside a Field keep their static host attributes; hydration adopts them and the Field follows the form once hydrated", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);

  try {
    const server = await expectServerFields(page, ["A", "B", "C"]);
    const b = page.locator('[data-unit="B"]');

    releaseMain();
    await shell(page, info.project.metadata.runtime);

    if (incremental) {
      await b.getByTestId("hydrate-unit").click();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");

      for (const label of ["A", "C"]) {
        await expect(page.locator(`[data-unit="${label}"]`)).toHaveAttribute(
          "data-client-render-seen",
          "false",
        );
      }
    } else {
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
    }

    // Hydration adopts the server IDs and associations.
    expect(await expectServerFields(page, ["A", "B", "C"])).toEqual(server);
    await assertReferences(page, info);

    const control = b.getByTestId("hydration-field-control");
    const ids = server.get("B");

    await control.fill("me@example.com");
    await expect(b.getByTestId("hydration-field-error")).toHaveCount(0);
    await expect(b.getByTestId("hydration-field")).not.toHaveAttribute("data-invalid", /.*/);
    await expect(control).not.toHaveAttribute("aria-invalid", /.*/);
    await expect(control).toHaveAttribute("aria-describedby", ids?.description ?? "");
    await control.fill("");
    await expect(b.getByTestId("hydration-field-error")).toHaveCount(1);
    await expect(control).toHaveAttribute("aria-invalid", "true");
    await expect(control).toHaveAccessibleName("Email");
    await expect(control).toHaveAccessibleDescription("We never share it. Enter your email.");
  } finally {
    releaseMain();
  }
});

type BooleanFieldIds = { checkbox: string | null; switch: string | null };

/** Checkbox and Switch Fields as rendered: role, state, IDs, `for` and `aria-describedby`. */
async function expectServerBooleanFields(
  page: Page,
  labels: string[],
): Promise<Map<string, BooleanFieldIds>> {
  const ids = new Map<string, BooleanFieldIds>();

  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const checkbox = unit.getByTestId("hydration-checkbox");
    const toggle = unit.getByTestId("hydration-switch");
    const unitIds: BooleanFieldIds = {
      checkbox: await checkbox.getAttribute("id"),
      switch: await toggle.getAttribute("id"),
    };

    expect(unitIds.checkbox).toMatch(/\S/);
    expect(unitIds.switch).toMatch(/\S/);
    await expect(checkbox).toHaveAttribute("role", "checkbox");
    await expect(checkbox).toHaveAttribute("type", "button");
    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await expect(checkbox).toHaveAttribute("aria-required", "true");
    await expect(unit.getByTestId("hydration-checkbox-label")).toHaveAttribute(
      "for",
      unitIds.checkbox ?? "",
    );
    await expect(checkbox).toHaveAttribute(
      "aria-describedby",
      (await unit.getByTestId("hydration-checkbox-description").getAttribute("id")) ?? "",
    );
    await expect(toggle).toHaveAttribute("role", "switch");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(toggle).toHaveAttribute("data-checked", "");
    await expect(toggle).not.toHaveAttribute("aria-required", /.*/);
    await expect(unit.getByTestId("hydration-switch-label")).toHaveAttribute(
      "for",
      unitIds.switch ?? "",
    );
    await expect(toggle).toHaveAttribute(
      "aria-describedby",
      (await unit.getByTestId("hydration-switch-description").getAttribute("id")) ?? "",
    );
    ids.set(label, unitIds);
  }

  return ids;
}

test("J6 W6 H1 H2 H3: Checkbox and Switch role, aria-checked, IDs, the Label's for and aria-describedby are in server HTML and adopted by hydration; a click after attachment or replay writes the form model once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    const server = await expectServerBooleanFields(page, ["A", "B", "C"]);
    const b = page.locator('[data-unit="B"]');
    const checkbox = b.getByTestId("hydration-checkbox");
    const value = b.getByTestId("hydration-checkbox-value");

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
      await checkbox.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(value).toHaveText("false");
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
      await checkbox.click();
    }

    await expect(value).toHaveText("true");
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await assertReferences(page, info);

    // Hydration adopted the server IDs; B's own change aside, every association is unchanged.
    expect(server.get("B")).toEqual({
      checkbox: await checkbox.getAttribute("id"),
      switch: await b.getByTestId("hydration-switch").getAttribute("id"),
    });
    await expectServerBooleanFields(page, ["A", "C"]);
    await expect(page.getByRole("checkbox", { name: "Accept the terms" })).toHaveCount(3);

    const toggle = b.getByTestId("hydration-switch");

    await toggle.click();
    await expect(b.getByTestId("hydration-switch-value")).toHaveText("false");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(toggle).toHaveAccessibleName("Order notifications");
    await expect(toggle).toHaveAccessibleDescription("About your orders.");
    await checkbox.click();
    await expect(value).toHaveText("false");
  } finally {
    releaseMain();
    releaseLazy();
  }
});

/** Toggle Fields as rendered: `aria-pressed`, ID, the Label's `for` and `aria-describedby`. */
async function expectServerToggleFields(
  page: Page,
  labels: string[],
): Promise<Map<string, string | null>> {
  const ids = new Map<string, string | null>();

  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const toggle = unit.getByTestId("hydration-field-toggle");
    const id = await toggle.getAttribute("id");

    expect(id).toMatch(/\S/);
    await expect(toggle).toHaveAttribute("type", "button");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(unit.getByTestId("hydration-toggle-label")).toHaveAttribute("for", id ?? "");
    await expect(toggle).toHaveAttribute(
      "aria-describedby",
      (await unit.getByTestId("hydration-toggle-description").getAttribute("id")) ?? "",
    );
    await expect(unit.getByTestId("hydration-toggle-field")).toHaveAttribute("data-required", "");

    // ARIA doesn't support these on a button; the Field's data attributes carry them.
    for (const attribute of ["aria-invalid", "aria-required", "aria-readonly"]) {
      await expect(toggle).not.toHaveAttribute(attribute, /.*/);
    }

    ids.set(label, id);
  }

  return ids;
}

test("G8 H1 H2 H3: a Toggle's ID, the Label's for and its aria-describedby inside a Field are in server HTML and adopted by hydration; a click after attachment or replay writes the form model once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    const server = await expectServerToggleFields(page, ["A", "B", "C"]);
    const b = page.locator('[data-unit="B"]');
    const toggle = b.getByTestId("hydration-field-toggle");
    const value = b.getByTestId("hydration-toggle-value");

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
      await expect(value).toHaveText("false");
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

    await expect(value).toHaveText("true");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await assertReferences(page, info);

    // Hydration adopted the server IDs; the other units are unchanged.
    expect(server.get("B")).toEqual(await toggle.getAttribute("id"));
    await expectServerToggleFields(page, ["A", "C"]);
    await expect(toggle).toHaveAccessibleName("Bold headings");
    await expect(toggle).toHaveAccessibleDescription("Headings need emphasis.");
    await toggle.click();
    await expect(value).toHaveText("false");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  } finally {
    releaseMain();
    releaseLazy();
  }
});

type GroupFieldIds = { radio: string | null; radioLabel: string | null; marksLabel: string | null };

/** Each unit's RadioGroup and ToggleGroup Multiple are named by their Field Labels and described by its Description. */
async function expectServerGroupFields(
  page: Page,
  labels: string[],
): Promise<Map<string, GroupFieldIds>> {
  const ids = new Map<string, GroupFieldIds>();

  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const radio = unit.getByTestId("hydration-field-radio");
    const marks = unit.getByTestId("hydration-field-marks");
    const radioLabel = unit.getByTestId("hydration-radio-label");
    const marksLabel = unit.getByTestId("hydration-marks-label");
    const radioLabelId = await radioLabel.getAttribute("id");
    const marksLabelId = await marksLabel.getAttribute("id");

    expect(radioLabelId).toMatch(/\S/);
    expect(marksLabelId).toMatch(/\S/);
    // A group isn't labelable: no for, the group names the Label instead.
    await expect(radioLabel).not.toHaveAttribute("for", /.*/);
    await expect(marksLabel).not.toHaveAttribute("for", /.*/);
    await expect(radio).toHaveAttribute("role", "radiogroup");
    await expect(radio).toHaveAttribute("aria-labelledby", radioLabelId ?? "");
    await expect(radio).toHaveAttribute(
      "aria-describedby",
      (await unit.getByTestId("hydration-radio-description").getAttribute("id")) ?? "",
    );
    await expect(radio).toHaveAttribute("aria-required", "true");
    await expect(radio).not.toHaveAttribute("aria-invalid", /.*/);
    await expect(radio).not.toHaveAttribute("aria-readonly", /.*/);
    await expect(unit.getByTestId("hydration-radio-field")).toHaveAttribute("data-required", "");
    await expect(marks).toHaveAttribute("role", "group");
    await expect(marks).toHaveAttribute("aria-labelledby", marksLabelId ?? "");
    await expect(marks).toHaveAttribute(
      "aria-describedby",
      (await unit.getByTestId("hydration-marks-description").getAttribute("id")) ?? "",
    );

    // ARIA doesn't support these on a group; the Field's data attributes carry them.
    for (const attribute of ["aria-invalid", "aria-required", "aria-readonly"]) {
      await expect(marks).not.toHaveAttribute(attribute, /.*/);
    }

    ids.set(label, {
      radio: await radio.getAttribute("id"),
      radioLabel: radioLabelId,
      marksLabel: marksLabelId,
    });
  }

  return ids;
}

test("Q11 U12 H1 H2 H3: a RadioGroup's and a ToggleGroup's aria-labelledby and aria-describedby inside a Field are in server HTML and adopted by hydration; a click after attachment or replay writes the form model once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    const server = await expectServerGroupFields(page, ["A", "B", "C"]);
    const b = page.locator('[data-unit="B"]');
    const radio = b.getByTestId("hydration-field-radio");
    const courier = b.getByTestId("hydration-delivery-courier");
    const value = b.getByTestId("hydration-delivery-value");

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
      await courier.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(b).toHaveAttribute("data-client-render-seen", "false");
      await expect(value).toHaveText("");
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
      await courier.click();
    }

    await expect(value).toHaveText("courier");
    await expect(courier).toHaveAttribute("aria-checked", "true");
    await assertReferences(page, info);

    // Hydration adopted the server IDs; the other units are unchanged.
    expect(server.get("B")).toEqual({
      radio: await radio.getAttribute("id"),
      radioLabel: await b.getByTestId("hydration-radio-label").getAttribute("id"),
      marksLabel: await b.getByTestId("hydration-marks-label").getAttribute("id"),
    });
    await expectServerGroupFields(page, ["A", "C"]);
    await expect(radio).toHaveAccessibleName("Delivery");
    await expect(radio).toHaveAccessibleDescription("Pickup is free.");
    await expect(b.getByRole("radiogroup", { name: "Delivery" })).toHaveAttribute(
      "data-testid",
      "hydration-field-radio",
    );
    await expect(b.getByRole("group", { name: "Title marks" })).toHaveAttribute(
      "data-testid",
      "hydration-field-marks",
    );
    await b.getByTestId("hydration-field-mark-bold").click();
    await expect(b.getByTestId("hydration-marks-value")).toHaveText("bold");
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

function tooltipNative(unit: Locator): Promise<boolean> {
  return unit
    .getByTestId("hydration-tooltip-content")
    .evaluate((node) => node.matches(":popover-open"));
}

/** N14: server-rendered Tooltips, closed in A and C and open in B. */
async function expectServerTooltips(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const unit = page.locator(`[data-unit="${label}"]`);
    const trigger = unit.getByTestId("hydration-tooltip-trigger");
    const content = unit.getByTestId("hydration-tooltip-content");
    const id = await content.getAttribute("id");

    expect(id).toMatch(/.+/);
    await expect(trigger).toHaveAttribute("aria-describedby", id ?? "");
    await expect(content).toHaveAttribute("role", "tooltip");
    await expect(content).toHaveAttribute("popover", "manual");
    await expect(content).toHaveText("Switch between light and dark");

    if (label === "B") {
      await expect(content).toHaveAttribute("data-present", "");
    } else {
      await expect(content).not.toHaveAttribute("data-present", /.*/);
    }
  }
}

test("N14 H1 H2: Tooltip description, role, ID and text are in server HTML and kept through hydration; initially-open B activates without an entrance; a replayed keyboard focus on a still-focused Trigger opens it", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    await expectServerTooltips(page, ["A", "B", "C"]);

    for (const label of ["A", "B", "C"]) {
      const content = page
        .locator(`[data-unit="${label}"]`)
        .getByTestId("hydration-tooltip-content");

      // Server HTML: inert, and the native host starts closed even when open.
      await expect(content).toHaveAttribute("inert", "");
      expect(await tooltipNative(page.locator(`[data-unit="${label}"]`))).toBe(false);
    }

    const a = page.locator('[data-unit="A"]');
    const b = page.locator('[data-unit="B"]');
    const trigger = a.getByTestId("hydration-tooltip-trigger");

    if (incremental) {
      releaseMain();
      await shell(page, info.project.metadata.runtime);

      // The Tab keydown starts A's hydration; its genuine deferred dependency is held, so the
      // Trigger's focus must be replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      await a.getByTestId("hydration-tooltip-before").focus();
      await page.keyboard.press("Tab");
      await expect(trigger).toBeFocused();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(a).toHaveAttribute("data-client-render-seen", "false");
      await expect(a.getByTestId("hydration-tooltip-intent")).toHaveText("false");
      lazy.release();
      await expect(a).toHaveAttribute("data-client-render-seen", "true");
    } else {
      // Before bootstrap: the early event contract captures the focus for replay.
      await a.getByTestId("hydration-tooltip-before").focus();
      await page.keyboard.press("Tab");
      await expect(trigger).toBeFocused();
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect(a).toHaveAttribute("data-client-render-seen", "true");
    }

    // The replayed focus of the still-focused Trigger opened A.
    await expect(a.getByTestId("hydration-tooltip-intent")).toHaveText("true");
    await expect.poll(() => tooltipNative(a)).toBe(true);
    await expect(trigger).toBeFocused();

    if (incremental) {
      // B hydrates on a trusted click, an outside gesture for A's Tooltip, which it closes.
      await b.getByTestId("hydrate-unit").click();
      await expect(b).toHaveAttribute("data-client-render-seen", "true");
      await expect(a.getByTestId("hydration-tooltip-intent")).toHaveText("false");
      await expect(page.locator('[data-unit="C"]')).toHaveAttribute(
        "data-client-render-seen",
        "false",
      );
    }

    // B activates natively after its own hydration, settled open, without an entrance.
    await expect.poll(() => tooltipNative(b)).toBe(true);
    await expect(b.getByTestId("hydration-tooltip-content")).not.toHaveAttribute("inert");
    await expect(b.getByTestId("hydration-tooltip-content")).toHaveAttribute("data-present", "");
    await expect(b.getByTestId("hydration-tooltip-content")).not.toHaveAttribute(
      "data-entering",
      /.*/,
    );
    await expectServerTooltips(page, ["B", "C"]);
    await assertReferences(page, info);
  } finally {
    releaseMain();
    releaseLazy();
  }
});

test("N14 H2: a Trigger focused then blurred before hydration stays closed after its focus and blur are replayed", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    const a = page.locator('[data-unit="A"]');
    const after = a.getByTestId("hydration-tooltip-after");

    if (incremental) {
      releaseMain();
      await shell(page, info.project.metadata.runtime);

      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      await a.getByTestId("hydration-tooltip-before").focus();
      await page.keyboard.press("Tab");
      await expect(a.getByTestId("hydration-tooltip-trigger")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(after).toBeFocused();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      lazy.release();
    } else {
      await a.getByTestId("hydration-tooltip-before").focus();
      await page.keyboard.press("Tab");
      await expect(a.getByTestId("hydration-tooltip-trigger")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(after).toBeFocused();
      releaseMain();
      await shell(page, info.project.metadata.runtime);
    }

    await expect(a).toHaveAttribute("data-client-render-seen", "true");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
    await expect(a.getByTestId("hydration-tooltip-intent")).toHaveText("false");
    expect(await tooltipNative(a)).toBe(false);
    await expect(after).toBeFocused();
    await assertReferences(page, info);
  } finally {
    releaseMain();
    releaseLazy();
  }
});

test("N14 H2: hover before hydration isn't replayed, including the hover that hydrates a hover-triggered block; the next enter opens after the delay", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);

  try {
    let trigger: Locator;
    let intent: Locator;

    if (incremental) {
      releaseMain();
      await shell(page, info.project.metadata.runtime);

      const block = page.locator("acceptance-hover-tooltip");

      trigger = block.getByTestId("hover-hydration-trigger");
      intent = block.getByTestId("hover-hydration-intent");
      await trigger.scrollIntoViewIfNeeded();

      const bounds = await trigger.boundingBox();

      if (bounds === null) {
        throw new Error("Expected the server-rendered Trigger");
      }

      await expect(block).not.toHaveAttribute("data-client-render-seen", "true");
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await expect(block).toHaveAttribute("data-client-render-seen", "true");
    } else {
      const a = page.locator('[data-unit="A"]');

      trigger = a.getByTestId("hydration-tooltip-trigger");
      intent = a.getByTestId("hydration-tooltip-intent");
      await trigger.scrollIntoViewIfNeeded();

      const bounds = await trigger.boundingBox();

      if (bounds === null) {
        throw new Error("Expected the server-rendered Trigger");
      }

      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      releaseMain();
      await shell(page, info.project.metadata.runtime);
      await expect(a).toHaveAttribute("data-client-render-seen", "true");
    }

    // The pointer stays still: no enter is replayed, so nothing opens.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));
    await expect(intent).toHaveText("false");

    // The next enter opens it after its 150 ms delay: the client's delay group starts cold, also
    // with B's Tooltip open from the server, so the server wrote no group state.
    const bounds = await trigger.boundingBox();

    if (bounds === null) {
      throw new Error("Expected the hydrated Trigger");
    }

    await page.mouse.move(2, 2);

    const handle = await intent.elementHandle();
    const elapsed = trigger.evaluate(
      (node, output) =>
        new Promise<number>((resolve) => {
          let enteredAt = Number.NaN;

          node.addEventListener("pointerenter", () => {
            enteredAt = performance.now();
          });
          new MutationObserver((_, observer) => {
            if (output.textContent === "true") {
              observer.disconnect();
              resolve(performance.now() - enteredAt);
            }
          }).observe(output, { childList: true, characterData: true, subtree: true });
        }),
      handle,
    );

    // The listener and observer are installed before the pointer moves: this round trip follows.
    await trigger.evaluate(() => undefined);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(intent).toHaveText("true");
    expect(await elapsed).toBeGreaterThanOrEqual(150 - 2);
  } finally {
    releaseMain();
  }
});

test("N14 H2 H3: a click replayed after hydration doesn't open the Tooltip with its replayed focus, and a later keyboard focus opens it", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    const a = page.locator('[data-unit="A"]');
    const trigger = a.getByTestId("hydration-tooltip-trigger");

    await trigger.scrollIntoViewIfNeeded();

    if (incremental) {
      releaseMain();
      await shell(page, info.project.metadata.runtime);

      // The click starts A's hydration with its dependency held: press and click are replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      await trigger.click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(a).toHaveAttribute("data-client-render-seen", "false");
      lazy.release();
    } else {
      await trigger.click();
      releaseMain();
      await shell(page, info.project.metadata.runtime);
    }

    await expect(a).toHaveAttribute("data-client-render-seen", "true");
    await expect(a.getByTestId("hydration-tooltip-intent")).toHaveText("false");
    await a.getByTestId("hydration-tooltip-before").focus();
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    await expect(a.getByTestId("hydration-tooltip-intent")).toHaveText("true");
  } finally {
    releaseMain();
    releaseLazy();
  }
});

for (const held of [false, true]) {
  const title = held
    ? "N14 H2 H3: a mouse press held across hydration: its replayed focus doesn't open the Tooltip, and a later keyboard focus does"
    : "N14 H2 H3: a mouse press released outside the Trigger before hydration, with no Trigger click: its replayed focus doesn't open the Tooltip, and a later keyboard focus does";

  test(title, async ({ page }, info) => {
    const incremental = info.project.metadata.hydration === "incremental";
    const releaseMain = await bootstrapHeld(page, "/hydration", info);
    let releaseLazy = () => {};

    try {
      const a = page.locator('[data-unit="A"]');
      const trigger = a.getByTestId("hydration-tooltip-trigger");
      const intent = a.getByTestId("hydration-tooltip-intent");

      await trigger.scrollIntoViewIfNeeded();

      const bounds = await trigger.boundingBox();

      if (bounds === null) {
        throw new Error("Expected the server-rendered Trigger");
      }

      let resume = releaseMain;

      if (incremental) {
        releaseMain();
        await shell(page, info.project.metadata.runtime);

        // A click beside the Trigger starts A's hydration with its dependency held, so the press
        // is replayed.
        const lazy = await holdDependency(page, "data-client-render-seen");

        releaseLazy = lazy.release;
        resume = lazy.release;
        await a.getByTestId("hydration-tooltip-before").click();
        await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
        await expect(a).toHaveAttribute("data-client-render-seen", "false");
      }

      // The press focuses the Trigger; it is released outside, so no click reaches the Trigger.
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(2, 2, { steps: 4 });

      if (!held) {
        await page.mouse.up();
      }

      await expect(trigger).toBeFocused();
      resume();

      if (!incremental) {
        await shell(page, info.project.metadata.runtime);
      }

      await expect(a).toHaveAttribute("data-client-render-seen", "true");
      await expect(intent).toHaveText("false");

      if (held) {
        await page.mouse.up();
      }

      // Keyboard only: Tab away and back. Forward first: WebKit's Shift+Tab doesn't leave a
      // button the mouse focused.
      await page.keyboard.press("Tab");
      await expect(a.getByTestId("hydration-tooltip-after")).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(trigger).toBeFocused();
      await expect(intent).toHaveText("true");
    } finally {
      releaseMain();
      releaseLazy();
    }
  });
}

for (const focusedFirst of [false, true]) {
  const title = focusedFirst
    ? "N14 H2 H3: a mouse press on the keyboard-focused Trigger, released outside, then Tab away and Shift+Tab back, all before hydration: the replayed keyboard focus opens the Tooltip"
    : "N14 H2 H3: a mouse press released outside the Trigger, then Tab away and Shift+Tab back, all before hydration: the replayed keyboard focus opens the Tooltip";

  test(title, async ({ page }, info) => {
    const incremental = info.project.metadata.hydration === "incremental";
    const releaseMain = await bootstrapHeld(page, "/hydration", info);
    let releaseLazy = () => {};

    try {
      const a = page.locator('[data-unit="A"]');
      const trigger = a.getByTestId("hydration-tooltip-trigger");

      await trigger.scrollIntoViewIfNeeded();

      const bounds = await trigger.boundingBox();

      if (bounds === null) {
        throw new Error("Expected the server-rendered Trigger");
      }

      let resume = releaseMain;

      if (incremental) {
        releaseMain();
        await shell(page, info.project.metadata.runtime);

        // A click beside the Trigger starts A's hydration with its dependency held, so every
        // event below is replayed.
        const lazy = await holdDependency(page, "data-client-render-seen");

        releaseLazy = lazy.release;
        resume = lazy.release;
        await a.getByTestId("hydration-tooltip-before").click();
        await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
        await expect(a).toHaveAttribute("data-client-render-seen", "false");
      }

      // Pressing an already-focused Trigger sends a mousedown without a focus; only the replayed
      // blur that follows ends it, and that blur is stale.
      if (focusedFirst) {
        await a.getByTestId("hydration-tooltip-before").focus();
        await page.keyboard.press("Tab");
        await expect(trigger).toBeFocused();
      }

      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(2, 2, { steps: 4 });
      await page.mouse.up();
      await expect(trigger).toBeFocused();

      // Keyboard only, before hydration. Forward first: WebKit's Shift+Tab doesn't leave a button
      // the mouse focused.
      await page.keyboard.press("Tab");
      await expect(a.getByTestId("hydration-tooltip-after")).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(trigger).toBeFocused();
      await expect(a).toHaveAttribute("data-client-render-seen", "false");
      resume();

      if (!incremental) {
        await shell(page, info.project.metadata.runtime);
      }

      await expect(a).toHaveAttribute("data-client-render-seen", "true");
      await expect(a.getByTestId("hydration-tooltip-intent")).toHaveText("true");
      await expect.poll(() => tooltipNative(a)).toBe(true);
      await expect(trigger).toBeFocused();
    } finally {
      releaseMain();
      releaseLazy();
    }
  });
}

test("N14 H2 H3: a touch drag on a touch-action: none Trigger, then Tab onto it, all before hydration: the replayed keyboard focus opens the Tooltip", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    const a = page.locator('[data-unit="A"]');
    const trigger = a.getByTestId("hydration-tooltip-trigger");

    await trigger.scrollIntoViewIfNeeded();
    await trigger.evaluate((node) => {
      node.style.touchAction = "none";
    });

    const bounds = await trigger.boundingBox();

    if (bounds === null) {
      throw new Error("Expected the server-rendered Trigger");
    }

    let resume = releaseMain;

    if (incremental) {
      releaseMain();
      await shell(page, info.project.metadata.runtime);

      // A click beside the Trigger starts A's hydration with its dependency held, so every event
      // below is replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      resume = lazy.release;
      await a.getByTestId("hydration-tooltip-before").click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(a).toHaveAttribute("data-client-render-seen", "false");
    }

    // No pointercancel (nothing to pan) and no tap: a touch pointerup on the Trigger without a
    // mousedown, focus or click.
    if (info.project.use.browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });

      for (let step = 1; step <= 5; step++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: point.x + step * 40, y: point.y }],
        });
      }

      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      info.annotations.push({
        type: "handler-check",
        description:
          "Playwright has no dragged trusted touch in Firefox or WebKit; the drag's touch pointerdown and pointerup are synthetic",
      });
      await trigger.evaluate((node) => {
        for (const type of ["pointerdown", "pointerup"]) {
          node.dispatchEvent(
            new PointerEvent(type, {
              pointerType: "touch",
              pointerId: 7,
              isPrimary: true,
              bubbles: true,
            }),
          );
        }
      });
    }

    await expect(trigger).not.toBeFocused();
    await a.getByTestId("hydration-tooltip-before").focus();
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    await expect(a).toHaveAttribute("data-client-render-seen", "false");
    resume();

    if (!incremental) {
      await shell(page, info.project.metadata.runtime);
    }

    await expect(a).toHaveAttribute("data-client-render-seen", "true");
    await expect(a.getByTestId("hydration-tooltip-intent")).toHaveText("true");
    await expect.poll(() => tooltipNative(a)).toBe(true);
    await expect(trigger).toBeFocused();
  } finally {
    releaseMain();
    releaseLazy();
  }
});

test("N14 H2 H3: a mouse press and click that focus nothing, as on a Safari button, then Tab onto the Trigger, all before hydration: the replayed keyboard focus opens the Tooltip", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    const a = page.locator('[data-unit="A"]');
    const trigger = a.getByTestId("hydration-tooltip-trigger");
    let resume = releaseMain;

    await trigger.scrollIntoViewIfNeeded();

    if (incremental) {
      releaseMain();
      await shell(page, info.project.metadata.runtime);

      // A click beside the Trigger starts A's hydration with its dependency held, so every event
      // below is replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      resume = lazy.release;
      await a.getByTestId("hydration-tooltip-before").click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(a).toHaveAttribute("data-client-render-seen", "false");
    }

    // Replay delivers the press, its click and the later keyboard focus in one synchronous pass,
    // so only the click ends the press before that focus.
    info.annotations.push({
      type: "handler-check",
      description:
        "the press is a synthetic mousedown and click that focus nothing; every engine Playwright drives focuses a clicked button",
    });
    await trigger.evaluate((node) => {
      node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expect(trigger).not.toBeFocused();
    await a.getByTestId("hydration-tooltip-before").focus();
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    await expect(a).toHaveAttribute("data-client-render-seen", "false");
    resume();

    if (!incremental) {
      await shell(page, info.project.metadata.runtime);
    }

    await expect(a).toHaveAttribute("data-client-render-seen", "true");
    await expect(a.getByTestId("hydration-tooltip-intent")).toHaveText("true");
    await expect.poll(() => tooltipNative(a)).toBe(true);
    await expect(trigger).toBeFocused();
  } finally {
    releaseMain();
    releaseLazy();
  }
});

test("N14 H2 H3: a touch press canceled before hydration only closes, so a later keyboard focus opens the Tooltip", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const releaseMain = await bootstrapHeld(page, "/hydration", info);
  let releaseLazy = () => {};

  try {
    const a = page.locator('[data-unit="A"]');
    const trigger = a.getByTestId("hydration-tooltip-trigger");
    const intent = a.getByTestId("hydration-tooltip-intent");

    await trigger.scrollIntoViewIfNeeded();

    const bounds = await trigger.boundingBox();

    if (bounds === null) {
      throw new Error("Expected the server-rendered Trigger");
    }

    let resume = releaseMain;

    if (incremental) {
      releaseMain();
      await shell(page, info.project.metadata.runtime);

      // A click beside the Trigger starts A's hydration with its dependency held, so the press
      // is replayed.
      const lazy = await holdDependency(page, "data-client-render-seen");

      releaseLazy = lazy.release;
      resume = lazy.release;
      await a.getByTestId("hydration-tooltip-before").click();
      await expect.poll(() => lazy.requests.length).toBeGreaterThan(0);
      await expect(a).toHaveAttribute("data-client-render-seen", "false");
    }

    // The touch sends no mousedown and never focuses the Trigger.
    if (info.project.use.browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    } else {
      info.annotations.push({
        type: "handler-check",
        description:
          "Playwright has no held or canceled trusted touch in Firefox or WebKit; the touch pointerdown and pointercancel are synthetic",
      });
      await trigger.evaluate((node) => {
        for (const type of ["pointerdown", "pointercancel"]) {
          node.dispatchEvent(
            new PointerEvent(type, {
              pointerType: "touch",
              pointerId: 7,
              isPrimary: true,
              bubbles: true,
            }),
          );
        }
      });
    }

    resume();

    if (!incremental) {
      await shell(page, info.project.metadata.runtime);
    }

    await expect(a).toHaveAttribute("data-client-render-seen", "true");
    await expect(intent).toHaveText("false");
    await a.getByTestId("hydration-tooltip-before").focus();
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    await expect(intent).toHaveText("true");
  } finally {
    releaseMain();
    releaseLazy();
  }
});
