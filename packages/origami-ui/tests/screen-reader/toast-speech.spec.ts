import { expect, test } from "./reader-test.js";

// Isolates the first run's findings on /toast-speech, a page with no live diagnostics (results of
// run 41803377782): which list and Close markup make a toast re-read its siblings or say "times",
// whether the Editor's held toast is spoken on a clean page, and whether text written into a plain
// live region right after a native modal dialog closes is dropped, with no Origami involved. Same
// rules as toast.spec.ts: speech is never asserted, each scenario's last step is the one it
// measures, a step's action waits only for the first DOM change proving it happened, and an
// attempt whose insertion happened in the wrong state fails as invalid.

const invalid =
  "invalid attempt: the insertion must happen with no modal dialog and focus where the dialog returned it";

for (const list of ["ol", "ol-none", "ul"]) {
  for (const close of ["label", "text"]) {
    test(`s1-add-${list}-${close}`, async ({ page, run }) => {
      // The limit of 3 closes Todo 1 when Todo 4 is added; no toast has an exit animation.
      await run.open(`/toast-speech?list=${list}&close=${close}`);
      await run.step("focus Create todo", () => page.getByTestId("create-todo").focus());

      for (let todo = 1; todo <= 4; todo += 1) {
        await run.step(`Enter on Create todo (Todo ${todo})`, async () => {
          await page.keyboard.press("Enter");
          await expect(page.getByTestId(`toast-todo-${todo}`)).toBeAttached();
        });
      }

      await run.check("Todo 1 removed by the limit", () =>
        expect(page.getByTestId("toast-todo-1")).not.toBeAttached(),
      );
    });
  }
}

test("s2-editor", async ({ page, run }) => {
  // q2-editor's flow without the diagnostics: Link copied is held while the Editor is open and
  // shown once it closes, with focus back on the Editor button.
  await run.open("/toast-speech?list=ul&close=text");
  await run.step("focus Editor", () => page.getByTestId("editor-trigger").focus());
  await run.step("Enter on Editor", async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("editor-content")).toHaveJSProperty("open", true);
  });

  const modal = await page
    .getByTestId("editor-content")
    .evaluate((dialog) => dialog.matches(":modal"));

  expect(modal, "the Editor is modal before Copy link").toBe(true);

  await run.step("focus Copy link", () => page.getByTestId("editor-copy").focus());
  await run.step("Enter on Copy link", () => page.keyboard.press("Enter"));
  await expect(page.getByTestId("toast-link-1"), "Link copied is held").not.toBeAttached();
  await run.step("focus Close", () => page.getByTestId("editor-close").focus());

  const closed = await run.step(
    "Enter on Close",
    async () => {
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("editor-content")).toHaveJSProperty("open", false);
    },
    { insertion: { toast: "toast-link-1" } },
  );

  expect(closed.atInsertion, invalid).toEqual({ modal: false, focus: "editor-trigger" });
});

for (const release of ["task", "frame"]) {
  test(`s3-native-${release}`, async ({ page, run }) => {
    // The control: Save closes a native modal dialog, which returns focus to its opener, and
    // writes "Saved" into an already-mounted, empty polite region in that task or a frame later.
    await run.open(`/toast-speech?release=${release}`);
    await run.step("focus Native editor", () => page.getByTestId("native-open").focus());
    await run.step("Enter on Native editor", async () => {
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("native-save")).toBeFocused();
    });

    const modal = await page
      .getByTestId("native-content")
      .evaluate((dialog) => dialog.matches(":modal"));

    expect(modal, "the native dialog is modal before Save").toBe(true);

    const saved = await run.step(
      "Enter on Save",
      async () => {
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("native-content")).toHaveJSProperty("open", false);
      },
      { insertion: { liveRegion: "native-status" } },
    );

    expect(saved.atInsertion, invalid).toEqual({ modal: false, focus: "native-open" });
  });
}
