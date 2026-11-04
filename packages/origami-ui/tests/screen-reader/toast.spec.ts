import { expect, test } from "./reader-test.js";

// What NVDA and VoiceOver are asked to say around Toast's live region (parked item 1e828f2f).
// Speech is never asserted: a test fails only when the reader or the fixture misbehaves. Each
// scenario's last step is the one it measures, which the run summary reports. A step's action
// waits only for the first DOM change proving it happened: VoiceOver starts listening once the
// action returns, so anything later, such as a held toast's arrival or a toast's removal, is
// checked after the capture. A delete flow whose toast didn't arrive after the modal session
// ended, with focus back on the opener, measured something else: the attempt fails as invalid.

const invalid =
  "invalid attempt: the toast must arrive with no modal dialog and focus on the opener";

test("q1-add", async ({ page, run }) => {
  // Positive control, no dialog: if T1 and Close aren't captured here, no other result counts.
  await run.open("/toast");
  await run.step("focus Add", () => page.getByTestId("add").focus());
  await run.step("Enter on Add", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("toast-T1")).toBeAttached();
  });
});

test("q2-template-delete", async ({ page, run }) => {
  // TO8: Deleted1 is held through the AlertDialog's exit and released at its native close.
  await run.open("/toast-modal");
  await run.step("focus Delete the invoice", () => page.getByTestId("delete-trigger").focus());
  await run.step("Enter on Delete the invoice", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("delete-cancel")).toBeFocused();
  });
  await run.step("Tab to Delete", async () => {
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("delete-action")).toBeFocused();
  });

  const modal = await page
    .getByTestId("delete-content")
    .evaluate((dialog) => dialog.matches(":modal"));

  expect(modal, "the AlertDialog is modal before Delete").toBe(true);

  const deleted = await run.step(
    "Enter on Delete",
    async () => {
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("delete-content")).toHaveAttribute("data-leaving");
    },
    { insertion: { toast: "toast-Deleted1" } },
  );

  expect(deleted.atInsertion, invalid).toEqual({ modal: false, focus: "delete-trigger" });
});

test("q2-opener-delete", async ({ page, run }) => {
  // TO10: Opened1 is released once the opener removed the dialog's host.
  await run.open("/toast-modal");
  await run.step("focus Delete the invoice", () => page.getByTestId("opened-delete-open").focus());
  await run.step("Enter on Delete the invoice", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("opened-delete-cancel")).toBeFocused();
  });
  await run.step("Tab to Delete", async () => {
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("opened-delete-action")).toBeFocused();
  });

  const modal = await page
    .getByTestId("opened-delete-content")
    .evaluate((dialog) => dialog.matches(":modal"));

  expect(modal, "the opened AlertDialog is modal before Delete").toBe(true);

  const deleted = await run.step(
    "Enter on Delete",
    async () => {
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("opened-delete-content")).toHaveAttribute("data-leaving");
    },
    { insertion: { toast: "toast-Opened1", host: "opened-delete-content" } },
  );

  // The opener removes the dialog's host before its closing events reach it (TO10).
  expect(deleted.atInsertion, invalid).toEqual({
    modal: false,
    focus: "opened-delete-open",
    hostConnected: false,
  });
});

test("q2-editor", async ({ page, run }) => {
  // TO9: E1 is held while the Editor stays open and released when it closes.
  await run.open("/toast-modal");
  await run.step("focus Edit", () => page.getByTestId("editor-trigger").focus());
  await run.step("Enter on Edit", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("editor-content")).toHaveJSProperty("open", true);
  });

  const modal = await page
    .getByTestId("editor-content")
    .evaluate((dialog) => dialog.matches(":modal"));

  expect(modal, "the Editor is modal before Copy").toBe(true);

  await run.step("focus Copy", () => page.getByTestId("editor-add").focus());
  await run.step("Enter on Copy", () => page.keyboard.press("Enter"));
  await expect(page.getByTestId("toast-E1")).not.toBeAttached();
  await run.step("focus Close the editor", () => page.getByTestId("editor-close").focus());

  const closed = await run.step(
    "Enter on Close the editor",
    async () => {
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("editor-content")).toHaveJSProperty("open", false);
    },
    { insertion: { toast: "toast-E1" } },
  );

  expect(closed.atInsertion, invalid).toEqual({ modal: false, focus: "editor-trigger" });
});

test("q3-limit", async ({ page, run }) => {
  // TO4: the limit of 3 closes the oldest; adding T4 shouldn't re-read T2 and T3.
  await run.open("/toast");
  await run.step("focus Add with an exit", () => page.getByTestId("add-exit").focus());

  for (const title of ["T1", "T2", "T3"]) {
    await run.step(`Enter on Add with an exit (${title})`, async () => {
      await page.keyboard.press("Enter");
      await expect(page.getByTestId(`toast-${title}`)).toBeAttached();
    });
  }

  await run.step("focus Add", () => page.getByTestId("add").focus());
  await run.step("Enter on Add (T4)", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("toast-T4")).toBeAttached();
    await expect(page.getByTestId("toast-T1")).toHaveAttribute("data-leaving");
  });
  await run.check("T1 removed after its 300 ms exit", () =>
    expect(page.getByTestId("toast-T1")).not.toBeAttached(),
  );
});

test("q4-exit", async ({ page, run }) => {
  // TO5: a closing toast is inert during its exit and shouldn't be announced again.
  await run.open("/toast");
  await run.step("focus Add with a long exit", () => page.getByTestId("add-long").focus());
  await run.step("Enter on Add with a long exit", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("toast-T1")).toBeAttached();
  });
  await run.step("focus Close the last", () => page.getByTestId("close-last").focus());
  await run.step("Enter on Close the last", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("toast-T1")).toHaveAttribute("data-leaving");
  });
  await run.check("T1 removed after its 1500 ms exit", () =>
    expect(page.getByTestId("toast-T1")).not.toBeAttached(),
  );
});
