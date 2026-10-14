import { test, expect } from "./contract-test.js";
import type { Page } from "playwright/test";
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
