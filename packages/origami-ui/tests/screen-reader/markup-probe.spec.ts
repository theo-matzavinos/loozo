import { expect, test } from "./reader-test.js";
import type { Locator, Page } from "@playwright/test";
import type { Run } from "./reader-test.js";

// Records what each reader says for the Calendar markup probes on /calendar-probe-speech, next to
// Origami's own markup: S for "selected" (V1), K for a key into another month (V2), L for
// Previous and the view switch (V3); calendar-probe-speech.ts describes each probe. Same rules as
// calendar.spec.ts: speech is never asserted, every key and focus is its own captured step, a
// step's action waits only for the first DOM change proving it happened, and state is checked
// outside the captures. The keys are Playwright's, sent to the page. The file name keeps it out of
// the calendar-date-field group's `calendar` filter.

/** The focusable cell for `date` in the probe with root test ID `root`. */
function cell(page: Page, root: string, date: string): Locator {
  return page.getByTestId(root).locator(`[data-date="${date}"]`);
}

/** Presses `key` in one captured step and waits for focus to land on `target`. */
async function press(
  run: Run,
  page: Page,
  key: string,
  target: Locator,
  name: string,
): Promise<void> {
  await run.step(`${key} → ${name}`, async () => {
    await page.keyboard.press(key);
    await expect(target).toBeFocused();
  });
}

test("p1-selected", async ({ page, run }) => {
  await run.open("/calendar-probe-speech");

  for (const probe of ["s0", "s1", "s2", "s3", "s4", "s5"]) {
    const root = `${probe}-root`;
    const october26 = cell(page, root, "2026-10-26");
    const october27 = cell(page, root, "2026-10-27");

    await run.step(`${probe}: focus 27 October (selected)`, () => october27.focus());
    await run.step(`${probe}: focus 26 October`, () => october26.focus());
    await run.step(`${probe}: Enter on 26 October`, async () => {
      await page.keyboard.press("Enter");

      // The static probes mark only the gridcell; S1–S3 focus the button inside it.
      if (probe === "s1" || probe === "s2" || probe === "s3") {
        await expect(october26.locator("..")).toHaveAttribute("aria-selected", "true");
        return;
      }

      await expect(october26).toHaveAttribute("aria-selected", "true");
    });
  }
});

test("p2-month-key", async ({ page, run }) => {
  await run.open("/calendar-probe-speech");

  for (const probe of ["k0", "k1", "k2", "k3"]) {
    const root = `${probe}-root`;

    await run.step(`${probe}: focus 28 October (disabled)`, () =>
      cell(page, root, "2026-10-28").focus(),
    );
    await press(run, page, "ArrowDown", cell(page, root, "2026-11-04"), `${probe}: 4 November`);
    await press(run, page, "ArrowUp", cell(page, root, "2026-10-28"), `${probe}: 28 October`);
  }

  await run.check("K2's Heading is live again once focus left its grid", () =>
    expect(page.locator("#k2-heading")).toHaveAttribute("aria-live", "polite"),
  );
});

test("p3-step", async ({ page, run }) => {
  await run.open("/calendar-probe-speech");

  for (const probe of ["l0", "l1", "l2", "l3", "l4", "l5", "l6"]) {
    const previous = page.getByTestId(`${probe}-previous`);
    const viewSwitch = page.getByTestId(`${probe}-switch`);
    // L5 and L6 keep the Heading outside the view switch.
    const heading =
      probe === "l5" || probe === "l6" ? page.getByTestId(`${probe}-heading`) : viewSwitch;

    await run.step(`${probe}: focus Previous month`, () => previous.focus());
    await run.step(`${probe}: Enter on Previous month`, async () => {
      await page.keyboard.press("Enter");
      await expect(heading).toHaveText("September 2026");
    });
    await press(run, page, "Tab", viewSwitch, `${probe}: the view switch`);
    await run.step(`${probe}: Enter on the view switch`, async () => {
      await page.keyboard.press("Enter");
      await expect(heading).toHaveText("2016 – 2027");
    });
  }
});
