// C21 when the Select starts open: the server serves a visible listbox named by the generated
// trigger id, which doesn't exist, until the authored-id trigger binds; then one repair.
import { expect, test } from "@playwright/test";
import {
  captureMessages,
  evidence,
  expectClean,
  falsifiers,
  openObserved,
  serverAttributes,
} from "./harness";

test("an initially open, reversed-order Select is repaired once at bind", async ({
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

  const messages = captureMessages(page);

  await openObserved(page, "/open-order");
  await expect(page.locator("[data-testid=open-order] [uiSelectContent]")).toHaveAttribute(
    "aria-labelledby",
    "author-open-trigger",
  );
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__uiSdkProbe!.settle("open-order"));

  const records = await evidence(page);
  const repairs = records.mutations.filter((mutation) => mutation.name === "aria-labelledby");
  const triggerBound = records.bounds.find((bound) => bound.slot === "select-trigger");

  await testInfo.attach("evidence", {
    body: JSON.stringify(records, null, 2),
    contentType: "application/json",
  });
  expect(repairs).toHaveLength(1);
  expect(repairs[0]).toMatchObject({
    slot: "select-content",
    server: `${id}-trigger`,
    old: `${id}-trigger`,
    value: "author-open-trigger",
    phase: "init",
  });
  expect(triggerBound).toBeTruthy();
  expect(repairs[0]!.sequence).toBeGreaterThan(triggerBound!.sequence);
  await testInfo.attach("falsifiers", {
    body: JSON.stringify(falsifiers(records), null, 2),
    contentType: "application/json",
  });
  expectClean(messages);
});
