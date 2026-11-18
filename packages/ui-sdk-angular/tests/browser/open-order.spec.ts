// Selects that start open. The server can't position the listbox or read the trigger's
// accessible name, so when the trigger binds core positions the content and names it with
// `aria-label` (the trigger's name) in place of `aria-labelledby`, in either template order.
// Content written before its authored-id trigger (C21) also names the generated trigger id on the
// server, which no element has, and core repairs that reference first.
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  captureMessages,
  evidence,
  expectClean,
  falsifiers,
  openObserved,
  serverAttributes,
} from "./harness";
import type { Evidence, Mutation } from "./observer";

/** The attributes core writes when it positions open content in the browser. */
const positioning = new Set([
  "popover",
  "style",
  "data-side",
  "data-align",
  "data-starting-style",
  "data-modality",
]);

async function observe(page: Page, testInfo: TestInfo): Promise<Evidence> {
  const messages = captureMessages(page);

  await openObserved(page, "/open-order");
  await expect(page.locator("[data-testid=open-shape] [uiSelectContent]")).toHaveAttribute(
    "aria-label",
    "Open shape",
  );
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    window.__uiSdkProbe!.settle("open-order");
    window.__uiSdkProbe!.settle("open-shape");
  });

  const records = await evidence(page);

  await testInfo.attach("evidence", {
    body: JSON.stringify(records, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("falsifiers", {
    body: JSON.stringify(falsifiers(records), null, 2),
    contentType: "application/json",
  });
  expectClean(messages);

  return records;
}

/** The falsifier records of one instance's content, minus core's positioning writes. */
function naming(records: Evidence, instance: string): Mutation[] {
  const named = [];

  for (const mutation of falsifiers(records)) {
    if (mutation.instance !== instance) {
      continue;
    }

    expect(mutation.slot, `${mutation.name} changes only on the content`).toBe("select-content");

    if (positioning.has(mutation.name)) {
      continue;
    }

    named.push(mutation);
  }

  return named;
}

function triggerBind(records: Evidence, instance: string): number {
  const bound = records.bounds.find(
    (record) => record.instance === instance && record.slot === "select-trigger",
  );

  expect(bound, `the ${instance} trigger binds`).toBeTruthy();

  return bound!.sequence;
}

test("an initially open Select is positioned and named by aria-label at bind", async ({
  page,
}, testInfo) => {
  const response = await page.request.get("/open-order");
  const html = await response.text();
  const root = await serverAttributes(page, html, "[data-testid=open-shape]");
  const content = await serverAttributes(page, html, "[data-testid=open-shape] [uiSelectContent]");
  const trigger = await serverAttributes(page, html, "[data-testid=open-shape] [uiSelectTrigger]");

  expect(response.status()).toBe(200);
  expect(root["data-ui-sdk-id"]).toMatch(/^ui-sdk-s/);
  expect(trigger["id"]).toBe("author-shape-trigger");
  expect(trigger["aria-expanded"]).toBe("true");
  expect(content).not.toHaveProperty("hidden");
  expect(content["aria-labelledby"]).toBe("author-shape-trigger");
  expect(content).not.toHaveProperty("aria-label");
  expect(content).not.toHaveProperty("popover");

  const records = await observe(page, testInfo);
  const named = naming(records, "open-shape");
  const bind = triggerBind(records, "open-shape");

  expect(named).toHaveLength(2);
  expect(named[0]).toMatchObject({
    name: "aria-labelledby",
    server: "author-shape-trigger",
    old: "author-shape-trigger",
    value: null,
    phase: "init",
  });
  expect(named[1]).toMatchObject({
    name: "aria-label",
    server: null,
    value: "Open shape",
    phase: "init",
  });

  for (const mutation of falsifiers(records)) {
    if (mutation.instance === "open-shape") {
      expect(mutation.sequence, `${mutation.name} follows the trigger's bind`).toBeGreaterThan(
        bind,
      );
    }
  }
});

test("an initially open, reversed-order Select is repaired and named by aria-label at bind", async ({
  page,
}, testInfo) => {
  const response = await page.request.get("/open-order");
  const html = await response.text();
  const root = await serverAttributes(page, html, "[data-testid=open-order]");
  const content = await serverAttributes(page, html, "[data-testid=open-order] [uiSelectContent]");
  const trigger = await serverAttributes(page, html, "[data-testid=open-order] [uiSelectTrigger]");
  const id = root["data-ui-sdk-id"]!;

  expect(response.status()).toBe(200);
  expect(trigger["id"]).toBe("author-open-trigger");
  expect(trigger["aria-expanded"]).toBe("true");
  expect(content).not.toHaveProperty("hidden");
  expect(content["aria-labelledby"]).toBe(`${id}-trigger`);
  expect(html).not.toContain(`id="${id}-trigger"`);

  const records = await observe(page, testInfo);
  const named = naming(records, "open-order");
  const bind = triggerBind(records, "open-order");

  await expect(page.locator("[data-testid=open-order] [uiSelectContent]")).toHaveAttribute(
    "aria-label",
    "Open order",
  );
  expect(named).toHaveLength(3);
  expect(named[0]).toMatchObject({
    name: "aria-labelledby",
    server: `${id}-trigger`,
    old: `${id}-trigger`,
    value: "author-open-trigger",
    phase: "init",
  });
  expect(named[1]).toMatchObject({
    name: "aria-labelledby",
    old: "author-open-trigger",
    value: null,
    phase: "init",
  });
  expect(named[2]).toMatchObject({
    name: "aria-label",
    server: null,
    value: "Open order",
    phase: "init",
  });
  expect(named[0]!.sequence).toBeGreaterThan(bind);
});
