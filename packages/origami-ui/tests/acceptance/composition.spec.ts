import { test, expect } from "./contract-test.js";
import { fixture } from "./observation.js";
import { expectPreferred } from "./geometry.js";

for (const provider of ["existing", "factory"]) {
  test(`O1 O2 O3: ${provider} providers, upper-only Options, concrete state ownership and diamond matches`, async ({
    page,
  }, info) => {
    await fixture(page, "composition", info);

    const trigger = page.getByTestId(`${provider}-options-trigger`);
    const panel = page.getByTestId(`${provider}-options-panel`);

    await expect(page.getByTestId(`${provider}-same-state`)).toHaveText("true");
    await expect(page.getByTestId(`${provider}-nearest-state`)).toHaveText("true");

    for (const state of ["collection", "presence", "collapsible", "accordion", "popover"]) {
      await expect(page.getByTestId(`${provider}-${state}-readonly`)).toHaveText("true");
    }

    await expect(page.getByTestId(`${provider}-presence-child`)).toHaveCount(1);
    await page.getByTestId(`${provider}-present`).click();
    await expect(page.getByTestId(`${provider}-presence-child`)).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId(`${provider}-options-disable`).click();
    await expect(trigger).toBeDisabled();
    await page.getByTestId(`${provider}-options-disable`).click();
    await expect(trigger).toBeEnabled();
    await page.getByTestId(`${provider}-accordion-trigger`).click();
    await expect(page.getByTestId(`${provider}-single-value`)).toHaveText("one");
    await page.getByTestId(`${provider}-accordion-trigger`).click();
    await expect(page.getByTestId(`${provider}-single-value`)).toHaveText("");
    await page.getByTestId(`${provider}-multiple-trigger`).click();
    await expect(page.getByTestId(`${provider}-multiple-value`)).toHaveText("one");
    await page.getByTestId("all-provider-ids").click();
    await expect(trigger).toHaveAttribute("id", `changed-provider-${provider}`);
    await expect(trigger).toHaveAttribute("aria-controls", `changed-provider-panel-${provider}`);
    await expect(panel).toHaveAttribute("aria-labelledby", `changed-provider-${provider}`);
    await expect(page.getByTestId(`${provider}-accordion-trigger`)).toHaveAttribute(
      "id",
      `changed-provider-accordion-${provider}`,
    );
    await expect(page.getByTestId(`${provider}-accordion-trigger`)).toHaveAttribute(
      "aria-controls",
      `changed-provider-accordion-panel-${provider}`,
    );
    await expect(page.getByTestId(`${provider}-accordion-panel`)).toHaveAttribute(
      "aria-labelledby",
      `changed-provider-accordion-${provider}`,
    );
    // Earlier native controls can scroll near the document bottom: this is a preferred-fit fixture.
    await page
      .getByTestId(`${provider}-popover-anchor`)
      .evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
    await page.getByTestId(`${provider}-popover-trigger`).click();
    await expect(page.getByTestId(`${provider}-popover-content`)).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByTestId(`${provider}-popover-content`)
          .evaluate((node) => node.matches(":popover-open")),
      )
      .toBe(true);
    await expect(page.getByTestId(`${provider}-popover-open`)).toHaveText("true");
    await expect(page.getByTestId(`${provider}-popover-trigger`)).toHaveAttribute(
      "aria-controls",
      `changed-provider-content-${provider}`,
    );
    await expect(page.getByTestId(`${provider}-popover-anchor`)).toHaveAttribute(
      "id",
      `changed-provider-anchor-${provider}`,
    );

    const geometryHosts = {
      anchor: `${provider}-popover-anchor`,
      content: `${provider}-popover-content`,
    };

    // Shared independent oracle rejects an overflowing preferred-fixture assumption.
    await expectPreferred(page, "block-end", "start", 8, geometryHosts);
    await page.getByTestId(`${provider}-popover-reposition`).click();
    await expectPreferred(page, "inline-end", "end", 12, geometryHosts);
    await page.getByTestId(`${provider}-popover-protect`).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(`${provider}-popover-open`)).toHaveText("true");
    await page.getByTestId(`${provider}-popover-trigger`).click();
    await expect(page.getByTestId(`${provider}-popover-open`)).toHaveText("false");
    await expect(page.getByTestId("provider-unused-outputs")).toHaveText("0");
    await expect(page.getByTestId(`shared-${provider}-trigger`)).toBeDisabled();
  });
}

test("I1 I2: deferred capture is nearest, later, cached and context-bound; factory outputs stay unused", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);
  await expect(page.getByTestId("deferred-lookups")).toHaveText("0");
  await page.getByTestId("resolve-second").click();
  await expect(page.getByTestId("second-resolution")).toHaveText("nearest-nested");
  await expect(page.getByTestId("deferred-lookups")).toHaveText("0");
  await page.getByTestId("resolve-first").click();
  await expect(page.getByTestId("first-resolution")).toHaveText("nearest-component");
  await expect(page.getByTestId("deferred-lookups")).toHaveText("1");
  await page.getByTestId("resolve-first").click();
  await expect(page.getByTestId("deferred-lookups")).toHaveText("1");
  await page.getByTestId("utilities-outside").click();
  await expect(page.getByTestId("outside-injection-errors")).toHaveText("3");
  await page.getByTestId("factory-trigger").click();
  await expect(page.getByTestId("factory-expanded")).toHaveText("true");
  await expect(page.getByTestId("unused-lower-outputs")).toHaveText("0");
});

test("I3: generated element IDs are host IDs until the consumer binds one, stable through keyed order; independent applications", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  const first = page.locator('acceptance-identity-owner[data-key="first"]');
  const second = page.locator('acceptance-identity-owner[data-key="second"]');
  const ids = [
    await first.getAttribute("data-generated-id"),
    await second.getAttribute("data-generated-id"),
  ];

  expect(ids[0]).toBeTruthy();
  expect(ids[1]).toBeTruthy();
  expect(new Set(ids).size).toBe(2);
  await expect(first).toHaveAttribute("id", ids[0] ?? "");
  await expect(second).toHaveAttribute("id", ids[1] ?? "");

  const firstNode = await first.elementHandle();

  await page.getByTestId("identity-dom-id").click();
  await expect(first).toHaveAttribute("id", "changed-domain-first");
  await expect(first).toHaveAttribute("data-generated-id", ids[0] ?? "");
  await page.getByTestId("identity-reorder").click();
  await expect(second).toHaveAttribute("data-generated-id", ids[1] ?? "");
  expect(
    await firstNode?.evaluate(
      (node) => node === document.querySelector('acceptance-identity-owner[data-key="first"]'),
    ),
  ).toBe(true);
  await page.getByTestId("independent-applications").click();

  for (const label of ["a", "b"]) {
    const owners = page
      .getByTestId(`independent-host-${label}`)
      .locator("acceptance-identity-owner");

    await expect(owners).toHaveCount(2);

    const values = await owners.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-generated-id")),
    );

    expect(values.every(Boolean)).toBe(true);
    expect(new Set(values).size).toBe(2);
  }

  // Cross-application document uniqueness and exact allocator spelling/sequence are deliberately not asserted.
  await expect(first).toHaveAttribute("data-generated-id", ids[0] ?? "");
});

test("I3: hosted ID and value allocations, no-host application identities and reused-host application isolation", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  const owners = page.locator('[data-testid="identity-owner"]');

  async function allocations(): Promise<string[][]> {
    const values = await owners.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-generated-allocations") ?? ""),
    );
    const parsed: string[][] = [];

    for (const value of values) {
      const decoded: unknown = JSON.parse(value);

      if (!Array.isArray(decoded) || !decoded.every((item) => typeof item === "string")) {
        throw new Error("Identity owner allocations must be a JSON string array");
      }

      parsed.push(decoded);
    }

    return parsed;
  }

  const before = await allocations();
  const all: string[] = [];

  expect(before).toHaveLength(2);

  for (const [index, owner] of before.entries()) {
    // An element ID and a value default with the same key on one host stay distinct.
    expect(owner).toHaveLength(2);
    expect(new Set(owner).size).toBe(2);
    await expect(owners.nth(index)).toHaveAttribute("data-generated-id", owner[0] ?? "");
    all.push(...owner);
  }

  for (const value of all) {
    expect(value).not.toBe("");
  }

  expect(new Set(all).size).toBe(4);

  const unhosted = page.getByTestId("unhosted-identities");

  await expect(unhosted).toHaveText(/^\[/);

  const unhostedText = await unhosted.textContent();
  const unhostedValues: unknown = JSON.parse(unhostedText ?? "");

  if (!Array.isArray(unhostedValues)) {
    throw new Error("Unhosted identities must be an array");
  }

  // Application service plus two repeated allocations in each of two EnvironmentInjectors.
  expect(unhostedValues).toHaveLength(5);
  expect(new Set(unhostedValues).size).toBe(5);

  for (const value of unhostedValues) {
    expect(typeof value).toBe("string");
    expect(value).not.toBe("");
  }

  await page.getByTestId("identity-dom-id").click();
  await expect(owners.first()).toHaveAttribute("id", "changed-domain-first");
  await page.getByTestId("identity-reorder").click();
  await expect(owners.first()).toHaveAttribute("data-key", "second");
  await page.getByTestId("application-isolation").click();
  await expect(page.getByTestId("application-isolation-result")).toHaveText("true");

  const after = await allocations();

  // Mounted allocations are stable across DOM ID changes, keyed reorder and other applications.
  expect([...after].reverse()).toEqual(before);
  await expect(unhosted).toHaveText(unhostedText ?? "");
});

const collapsibleCases = [
  "factory-upper-first",
  "factory-lower-first",
  "existing-upper-first",
  "existing-lower-first",
  "factory-diamond",
  "existing-diamond",
];

test("O1 O2 O3: whole Collapsible/Presence replacements win over direct inputs in both import orders and diamonds", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  for (const name of collapsibleCases) {
    await test.step(name, async () => {
      const part = (role: string) => page.locator(`[data-case="${name}"] [data-role="${role}"]`);

      await expect(part("expanded")).toHaveText("true");
      // Replacement, not a merged lower default or direct input.
      await expect(part("disabled")).toHaveText("false");
      await expect(part("shared")).toHaveText("true");
      await expect(part("presence-shared")).toHaveText("true");
      await expect(part("independent")).toHaveText("true");
      // Nested defaults must not inherit an outer replacement.
      await expect(part("nested-expanded")).toHaveText("false");
      await expect(part("trigger")).toHaveAttribute("id", `${name}-trigger`);
      await expect(part("panel")).toHaveAttribute("id", `${name}-panel`);
      await expect(part("trigger")).toHaveAttribute("aria-controls", `${name}-panel`);
      await expect(part("panel")).toHaveAttribute("aria-labelledby", `${name}-trigger`);
      await expect(part("presence")).toHaveAttribute("data-phase", "open");
      await expect(part("panel")).toHaveAttribute("data-phase", "open");
      await expect(part("nested-panel")).toHaveAttribute("data-phase", "closed");

      // Effective replaced hiding is until-found where the engine supports it, never the
      // direct hidden input; unsupported engines keep ordinary hiding.
      const supportsReveal = await part("panel").evaluate((node) => "onbeforematch" in node);
      let replacedHidden = "";

      if (supportsReveal) {
        replacedHidden = "until-found";
      }

      await part("trigger").click();
      await expect(part("panel")).toHaveAttribute("data-phase", "closed");
      await expect(part("expanded")).toHaveText("false");
      await expect(part("panel")).toHaveAttribute("hidden", replacedHidden);
      await part("trigger").click();
      await expect(part("panel")).toHaveAttribute("data-phase", "open");
      await expect(part("expanded")).toHaveText("true");

      // Disabled replacement blocks activation; external intent stays authoritative and a
      // disabled collapse hides ordinarily.
      await part("disable").click();
      await expect(part("trigger")).toBeDisabled();
      await part("external").click();
      await expect(part("panel")).toHaveAttribute("data-phase", "closed");
      await expect(part("panel")).toHaveAttribute("hidden", "");
      await part("external").click();
      await expect(part("panel")).toHaveAttribute("data-phase", "open");
      await part("disable").click();
      await expect(part("trigger")).toBeEnabled();

      await part("ids").click();
      await expect(part("trigger")).toHaveAttribute("id", `${name}-changed-trigger`);
      await expect(part("panel")).toHaveAttribute("id", `${name}-changed-panel`);
      await expect(part("trigger")).toHaveAttribute("aria-controls", `${name}-changed-panel`);
      await expect(part("panel")).toHaveAttribute("aria-labelledby", `${name}-changed-trigger`);
      await part("presence-toggle").click();
      await expect(part("presence")).toHaveAttribute("data-phase", "closed");
      await part("presence-toggle").click();
      await expect(part("presence")).toHaveAttribute("data-phase", "open");
      // Replacement writes never emit unused primitive outputs.
      await expect(part("outputs")).toHaveText("0");
      await expect(part("nested-expanded")).toHaveText("false");
    });
  }

  const isolated = (role: string) => page.locator(`[data-role="isolated-${role}"]`);

  await expect(isolated("expanded")).toHaveText("false");
  await expect(isolated("disabled")).toHaveText("false");
  await expect(isolated("trigger")).toHaveAttribute("id", "isolated-trigger");
  await expect(isolated("panel")).toHaveAttribute("id", "isolated-panel");
  await expect(isolated("presence")).toHaveAttribute("data-phase", "closed");
  await expect(isolated("panel")).toHaveAttribute("hidden", "");
  await isolated("trigger").click();
  await expect(isolated("panel")).toHaveAttribute("data-phase", "open");
  await expect(isolated("expanded")).toHaveText("true");
  await expect(isolated("presence")).toHaveAttribute("data-phase", "closed");
});

test("O1 O3 A3: Collection/Accordion direct and host-composed replacements in both import orders", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  for (const order of ["upper-first", "lower-first"]) {
    await test.step(order, async () => {
      const co = (role: string) =>
        page.locator(`[data-case="accordion-${order}"] [data-co="${role}"]`);

      // Replaced Item Options govern values; an ancestor replacement does not leak to defaults.
      await expect(co("collection")).toHaveText("factory-value,existing-value,child-default");
      await expect(co("shared-disabled")).toHaveText("true");
      await expect(co("factory-trigger")).toBeDisabled();
      await expect(co("factory-trigger")).toHaveAttribute("id", `${order}-factory-trigger`);
      await expect(co("factory-trigger")).toHaveAttribute(
        "aria-controls",
        `${order}-factory-panel`,
      );
      await expect(co("factory-panel")).toHaveAttribute(
        "aria-labelledby",
        `${order}-factory-trigger`,
      );
      await expect(co("existing-trigger")).toHaveAttribute("id", `${order}-existing-trigger`);
      await expect(co("existing-trigger")).toHaveAttribute(
        "aria-controls",
        `${order}-existing-panel`,
      );
      await expect(co("existing-panel")).toHaveAttribute(
        "aria-labelledby",
        `${order}-existing-trigger`,
      );
      await expect(co("diamond-trigger")).toHaveAttribute("id", `${order}-diamond-trigger`);

      const diamondPanel = await co("diamond-panel").getAttribute("id");

      expect(diamondPanel).toBeTruthy();
      await expect(co("diamond-trigger")).toHaveAttribute("aria-controls", diamondPanel ?? "");
      await expect(co("diamond-panel")).toHaveAttribute(
        "aria-labelledby",
        `${order}-diamond-trigger`,
      );
      await co("enable").click();
      await expect(co("shared-disabled")).toHaveText("false");
      await expect(co("factory-trigger")).toBeEnabled();
      await co("factory-trigger").click();
      await expect(co("single")).toHaveText("first");
      await expect(co("factory-trigger")).toHaveAttribute("aria-expanded", "true");
      await co("existing-trigger").click();
      await expect(co("single")).toHaveText("second");
      await co("diamond-trigger").click();
      await expect(co("single")).toHaveText("diamond");
      await expect(co("diamond-trigger")).toHaveAttribute("aria-expanded", "true");
      // The shared existing replacement wins over the Multiple replacement's own disabled.
      await expect(co("multiple-trigger")).toBeEnabled();
      await co("multiple-trigger").click();
      await expect(co("multiple")).toHaveText("external,first");
      await expect(co("existing-single")).toHaveText("existing-seed");
      await co("existing-single-trigger").click();
      await expect(co("existing-single")).toHaveText("first");
      await expect(co("factory-multiple")).toHaveText("factory-external");
      await co("factory-multiple-trigger").click();
      await expect(co("factory-multiple")).toHaveText("factory-external,first");
      await expect(co("unused")).toHaveText("0");
    });
  }
});

const popoverCases = [
  "popover-factory-first",
  "popover-factory-last",
  "popover-existing-first",
  "popover-existing-last",
];

test("O1 O3 V3 V5: whole Popover replacements win over direct root/role inputs in both import orders", async ({
  page,
}, info) => {
  await fixture(page, "composition", info);

  const nativeOpen = (name: string) =>
    page
      .locator(`[data-case="${name}"] [data-co="content"]`)
      .evaluate((node) => node.matches(":popover-open"));

  // Before any action, every effective replacement contradicts the direct inputs.
  for (const name of popoverCases) {
    const co = (role: string) => page.locator(`[data-case="${name}"] [data-co="${role}"]`);

    await expect(co("open")).toHaveText("false");
    await expect(co("disabled")).toHaveText("true");
    await expect(co("dismissible")).toHaveText("false");
    expect(await nativeOpen(name)).toBe(false);
    await expect(co("trigger")).toBeDisabled();
    await expect(co("trigger")).toHaveAttribute("type", "button");
    await expect(co("trigger")).toHaveAttribute("id", (await co("trigger-id").textContent()) ?? "");
    await expect(co("anchor")).toHaveAttribute("id", (await co("anchor-id").textContent()) ?? "");
    await expect(co("content")).toHaveAttribute("id", (await co("content-id").textContent()) ?? "");
    await expect(co("trigger")).toHaveAttribute(
      "aria-controls",
      (await co("content-id").textContent()) ?? "",
    );
    await expect(co("content").locator("button")).toHaveCount(0);
  }

  for (const name of popoverCases) {
    await test.step(name, async () => {
      const co = (role: string) => page.locator(`[data-case="${name}"] [data-co="${role}"]`);
      const hosts = { anchor: `${name}-anchor`, content: `${name}-content` };

      await co("enable").click();
      await expect(co("disabled")).toHaveText("false");
      await expect(co("trigger")).toBeEnabled();
      await co("anchor").evaluate((node) =>
        node.scrollIntoView({ block: "center", inline: "center" }),
      );
      await co("write-open").click();
      await expect(co("open")).toHaveText("true");
      await expect.poll(() => nativeOpen(name)).toBe(true);
      await expect(co("trigger")).toHaveAttribute("aria-expanded", "true");
      await expectPreferred(page, "inline-end", "center", 11, hosts);

      // Complete four-field Content replacement: reactive placement and IDs.
      const originalId = await co("content").getAttribute("id");

      await co("placement").click();
      await expectPreferred(page, "block-end", "start", 7, hosts);
      await co("ids").click();
      await expect(co("content")).toHaveAttribute("id", `${originalId}-changed`);
      await expect(co("trigger")).toHaveAttribute("aria-controls", `${originalId}-changed`);
      await expect(co("trigger")).toHaveAttribute(
        "id",
        (await co("trigger-id").textContent()) ?? "",
      );
      await expect(co("anchor")).toHaveAttribute("id", (await co("anchor-id").textContent()) ?? "");

      // Effective dismissible=false vetoes Escape; the own native Trigger still toggles.
      await page.keyboard.press("Escape");
      await expect(co("open")).toHaveText("true");
      expect(await nativeOpen(name)).toBe(true);
      await co("trigger").press("Enter");
      await expect(co("open")).toHaveText("false");
      await expect.poll(() => nativeOpen(name)).toBe(false);
      await co("trigger").click();
      await expect.poll(() => nativeOpen(name)).toBe(true);
      await co("trigger").press("Space");
      await expect.poll(() => nativeOpen(name)).toBe(false);
      await expect(co("open")).toHaveText("false");
      await expect(co("unused-outputs")).toHaveText("0");
    });
  }
});
