import { test, expect } from "./contract-test.js";
import type { CDPSession, Locator, Page, TestInfo } from "playwright/test";
import { open, writeFile } from "node:fs/promises";
import { bootstrapHeld, fixture } from "./observation.js";

// File field (section 33, FF). FF1 is the package, type and documentation gates, FF8 the `errors`
// fixture. Chromium drives native external drops of a disk file through CDP
// (`Input.dispatchDragEvent`); Firefox and WebKit can't be driven that way, so they run the
// synthetic `DataTransfer` sequences only, which prove the zone's listeners, not the browser's
// protected-mode drag data (U4: their OS file drags are assumed to carry "Files", as the HTML spec
// requires). Chooser cases go through Playwright's intercepted chooser, not an OS dialog.

declare global {
  interface Window {
    fileFieldFixture: {
      billing: { invoice: () => { value: () => File | null } };
      plainFile: File | null;
    };
    ffZoneDrops: string[];
  }
}

function out(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

/**
 * Focuses `target` from script, as a click or a key does: focus moves straight to it. Playwright's
 * own `focus()` blurs to nothing first.
 */
async function moveFocus(target: Locator): Promise<void> {
  await target.evaluate((element: HTMLElement) => element.focus());
}

async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

/** The Input's native selection: its file names. */
async function nativeFiles(input: Locator): Promise<string[]> {
  return input.evaluate((element: HTMLInputElement) =>
    Array.from(element.files ?? [], (file) => file.name),
  );
}

/** A disk file of `size` bytes, sparse, for a chooser or a CDP drop. */
async function diskFile(info: TestInfo, name: string, size = 16): Promise<string> {
  const path = info.outputPath(name);

  await writeFile(path, "");

  const handle = await open(path, "r+");

  await handle.truncate(size);
  await handle.close();

  return path;
}

/**
 * Dispatches synthetic drag events at `target` carrying `kind`: page-made files, or text. Returns
 * whether each was cancelled and the `dropEffect` a listener assigned during it ("unset" without
 * one): a constructed transfer ignores the assignment, so an own accessor records it. A handler
 * check, never trusted drag evidence.
 */
async function syntheticDrag(
  target: Locator,
  steps: readonly ("dragenter" | "dragover" | "dragleave" | "drop")[],
  kind: { readonly files: readonly { name: string; size: number }[] } | { readonly text: string },
): Promise<{ type: string; prevented: boolean; dropEffect: string }[]> {
  return target.evaluate(
    (element, { steps, kind }) => {
      const transfer = new DataTransfer();
      let dropEffect = "unset";

      Object.defineProperty(transfer, "dropEffect", {
        get: () => dropEffect,
        set: (value: string) => {
          dropEffect = value;
        },
      });

      if ("files" in kind) {
        for (const file of kind.files) {
          transfer.items.add(new File([new Uint8Array(file.size)], file.name));
        }
      } else {
        transfer.setData("text/plain", kind.text);
      }

      return steps.map((type) => {
        const event = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer: transfer,
        });

        dropEffect = "unset";
        element.dispatchEvent(event);

        return { type, prevented: event.defaultPrevented, dropEffect };
      });
    },
    { steps, kind },
  );
}

/** What a page does after a drop: navigations it requested, new pages, the main frame's URL. */
interface NavigationProbe {
  readonly requested: { url: string; disposition: string }[];
  readonly pages: number;
}

/**
 * Chromium only: a CDP session that drags a disk file onto the page, and a probe of what the page
 * then asked the browser to open. An outside drop opens the file in a new tab without navigating
 * the source page: `Page.frameRequestedNavigation` with `newTab`, which the probe records before
 * any new page renders; the headless shell may crash rendering that page, so it is closed at once.
 */
async function cdpDrops(page: Page): Promise<{
  readonly probe: NavigationProbe;
  drop(target: Locator, path: string): Promise<void>;
}> {
  const session: CDPSession = await page.context().newCDPSession(page);
  const probe = { requested: [] as { url: string; disposition: string }[], pages: 0 };

  await session.send("Page.enable");
  session.on("Page.frameRequestedNavigation", (event) => {
    probe.requested.push({ url: event.url, disposition: event.disposition });
  });
  page.context().on("page", (other) => {
    probe.pages += 1;
    void other.close().catch(() => {});
  });

  return {
    probe,
    async drop(target: Locator, path: string): Promise<void> {
      await target.scrollIntoViewIfNeeded();

      const box = await target.boundingBox();

      expect(box).not.toBeNull();

      const x = box!.x + Math.min(20, box!.width / 2);
      const y = box!.y + Math.min(20, box!.height / 2);
      const data = { items: [], files: [path], dragOperationsMask: 1 };

      await session.send("Input.dispatchDragEvent", { type: "dragEnter", x, y, data });
      await session.send("Input.dispatchDragEvent", { type: "dragOver", x, y, data });
      await session.send("Input.dispatchDragEvent", { type: "drop", x, y, data });
    },
  };
}

/** Records every `drop` the browser delivers to `zone`, passively: no listener cancels anything. */
async function recordZoneDrops(zone: Locator): Promise<void> {
  await zone.evaluate((element) => {
    window.ffZoneDrops = [];
    element.addEventListener("drop", (event) => {
      window.ffZoneDrops.push((event.target as Element).getAttribute("data-testid") ?? "");
    });
  });
}

/** The billing field's attributes and its Label's and zone's, as the contract names them. */
async function describeBilling(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const read = (element: Element, names: string[]): Record<string, string | null> => {
      const attributes: Record<string, string | null> = {};

      for (const name of names) {
        attributes[name] = element.getAttribute(name);
      }

      return attributes;
    };
    const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`)!;
    const clearAttributes = ["type", "disabled", "aria-disabled", "data-disabled"];

    return {
      input: read(byTestId("billing-input"), [
        "type",
        "id",
        "accept",
        "aria-describedby",
        "aria-required",
        "aria-invalid",
        "disabled",
        "role",
      ]),
      labelFor: document.querySelector("#billing-label")!.getAttribute("for"),
      zone: read(byTestId("billing-zone"), ["data-drag-over"]),
      // The template's own attributes and Angular's aside, the root has no attribute of its own.
      root: byTestId("billing-root")
        .getAttributeNames()
        .filter(
          (name) =>
            !["ngh", "data-testid", "ogfilefield"].includes(name) && !name.startsWith("_ngcontent"),
        ),
      image: read(byTestId("image-input"), ["type", "id", "aria-describedby", "aria-required"]),
      imageLabelFor: document.querySelector("#image-label")!.getAttribute("for"),
      disabled: read(byTestId("disabled-input"), ["type", "disabled"]),
      imageClear: read(byTestId("image-clear"), clearAttributes),
      disabledClear: read(byTestId("disabled-clear"), clearAttributes),
    };
  });
}

test("FF2 server HTML and hydration: the Input is the Field's named, described, required file control; the zone shows no drag", async ({
  page,
}, info) => {
  let server: Record<string, unknown> = {};

  await fixture(page, "file-field", info, async () => {
    server = await describeBilling(page);
  });

  const id = (server["input"] as Record<string, string | null>)["id"];
  const imageId = (server["image"] as Record<string, string | null>)["id"];

  expect(id).toMatch(/^og-file-field-input-s\d+$/);
  expect(imageId).toMatch(/^og-file-field-input-s\d+$/);
  expect(imageId).not.toBe(id);
  expect(server).toEqual({
    input: {
      type: "file",
      id,
      accept: ".pdf,.jpg,.jpeg,.png",
      "aria-describedby": "billing-description",
      "aria-required": "true",
      "aria-invalid": null,
      disabled: null,
      role: null,
    },
    labelFor: id,
    zone: { "data-drag-over": null },
    root: [],
    image: {
      type: "file",
      id: imageId,
      "aria-describedby": "image-description",
      "aria-required": null,
    },
    imageLabelFor: imageId,
    disabled: { type: "file", disabled: "" },
    imageClear: {
      type: "button",
      disabled: null,
      "aria-disabled": null,
      "data-disabled": null,
    },
    disabledClear: {
      type: "button",
      disabled: "",
      "aria-disabled": "true",
      "data-disabled": "",
    },
  });

  expect(await describeBilling(page)).toEqual(server);

  const control = page.getByRole("button", { name: /^Επιλέξτε αρχείο ή σύρετέ το εδώ/ });

  await expect(control).toHaveAttribute("data-testid", "billing-input");
  await expect(control).toHaveAccessibleDescription("PDF, JPG ή PNG (max. 25MB)");
  await expect(page.getByRole("button", { name: /^Εικόνα Προώθησης/ })).toHaveAttribute(
    "data-testid",
    "image-input",
  );
  await expect(out(page, "disabled-input")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Αφαίρεση εικόνας" })).toHaveAttribute(
    "data-testid",
    "image-clear",
  );
});

test("FF3 picker and keyboard: a zone click picks once and touches, Space and Enter open the chooser, the same file again, and a null write re-arms it", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "file-field", info);

  const input = out(page, "billing-input");
  const same = await diskFile(info, "same.pdf", 4);

  // A click anywhere on the zone, which is the Label, opens the native picker.
  let choosing = page.waitForEvent("filechooser");

  await out(page, "billing-zone").click({ position: { x: 300, y: 12 } });

  let chooser = await choosing;

  expect(chooser.element()).toBeTruthy();
  expect(await chooser.element().getAttribute("data-testid")).toBe("billing-input");
  await chooser.setFiles(same);
  await expect(out(page, "billing-value")).toHaveText("same.pdf");
  await expect(out(page, "billing-writes")).toHaveText("1");
  await expect(out(page, "billing-touches")).toHaveText("1");
  await expect(out(page, "billing-touched")).toHaveText("true");
  expect(await nativeFiles(input)).toEqual(["same.pdf"]);

  // The same file again: Chromium and WebKit report no change; Firefox fires one with a new File.
  choosing = page.waitForEvent("filechooser");
  await out(page, "billing-zone").click({ position: { x: 300, y: 12 } });
  chooser = await choosing;
  await chooser.setFiles(same);
  await expect(out(page, "billing-value")).toHaveText("same.pdf");

  if (browserName === "firefox") {
    await expect(out(page, "billing-writes")).toHaveText("2");
  } else {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(out(page, "billing-writes")).toHaveText("1");
  }

  const writes = Number(await out(page, "billing-writes").textContent());

  // The keyboard: Tab reaches the visually hidden Input; Space and Enter open its chooser.
  await moveFocus(out(page, "billing-before"));
  await page.keyboard.press("Tab");
  expect(await focusedTestId(page)).toBe("billing-input");
  choosing = page.waitForEvent("filechooser");
  await page.keyboard.press("Space");
  chooser = await choosing;
  await chooser.setFiles({
    name: "space.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("s"),
  });
  await expect(out(page, "billing-value")).toHaveText("space.pdf");
  await moveFocus(input);
  choosing = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  chooser = await choosing;
  await chooser.setFiles({
    name: "enter.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("e"),
  });
  await expect(out(page, "billing-value")).toHaveText("enter.pdf");
  await expect(out(page, "billing-writes")).toHaveText(String(writes + 2));

  // Writing null empties the native selection, so picking the same file again writes it.
  await page.getByTestId("billing-model-null").click();
  await expect(out(page, "billing-value")).toHaveText("null");
  expect(await nativeFiles(input)).toEqual([]);
  choosing = page.waitForEvent("filechooser");
  await out(page, "billing-zone").click({ position: { x: 300, y: 12 } });
  chooser = await choosing;
  await chooser.setFiles(same);
  await expect(out(page, "billing-value")).toHaveText("same.pdf");
  await expect(out(page, "billing-writes")).toHaveText(String(writes + 3));
});

test("FF3 a pick rejected from valueChange through the root's own value empties the form field, the root and the native selection, so choosing the same file again writes again", async ({
  page,
}, info) => {
  await fixture(page, "file-field", info);

  const input = out(page, "rejected-input");
  const same = await diskFile(info, "same.pdf", 4);

  for (const rejected of ["1", "2"]) {
    // The fixture writes null to the root's own value inside the pick's valueChange.
    const choosing = page.waitForEvent("filechooser");

    await out(page, "rejected-choose").click();

    const chooser = await choosing;

    await chooser.setFiles(same);
    await expect(out(page, "rejected-count")).toHaveText(rejected);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(out(page, "rejected-value")).toHaveText("null");
    await expect(out(page, "rejected-root-value")).toHaveText("null");
    // Emptied, so the same file chosen again is a change in every engine and writes again.
    await expect.poll(() => nativeFiles(input)).toEqual([]);
  }
});

test("FF4 drops: data-drag-over stays across the zone's children, text drags are ignored, the first file of a drop is written and mirrored, and a native disk-file drop opens nothing", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "file-field", info);

  const zone = out(page, "billing-zone");
  const row = out(page, "billing-p");
  const span = out(page, "billing-span");
  const input = out(page, "billing-input");
  const file = { files: [{ name: "drag.pdf", size: 3 }] };

  // Enter-before-leave, as native traces order them, with no relatedTarget: zone > row > span.
  await syntheticDrag(zone, ["dragenter"], file);
  await expect(zone).toHaveAttribute("data-drag-over", "");
  await syntheticDrag(row, ["dragenter"], file);
  await syntheticDrag(zone, ["dragleave"], file);
  await expect(zone).toHaveAttribute("data-drag-over", "");
  await syntheticDrag(span, ["dragenter"], file);
  await syntheticDrag(row, ["dragleave"], file);
  await expect(zone).toHaveAttribute("data-drag-over", "");
  expect(await syntheticDrag(span, ["dragover"], file)).toEqual([
    { type: "dragover", prevented: true, dropEffect: "copy" },
  ]);
  await syntheticDrag(span, ["dragleave"], file);
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);

  // A text drag sets nothing and isn't accepted.
  expect(await syntheticDrag(zone, ["dragenter", "dragover"], { text: "words" })).toEqual([
    { type: "dragenter", prevented: false, dropEffect: "unset" },
    { type: "dragover", prevented: false, dropEffect: "unset" },
  ]);
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
  await syntheticDrag(zone, ["dragleave"], { text: "words" });

  // Two files dropped: the first is written, the Input holds exactly it, the field is touched and
  // its 26 MB is over the limit.
  const results = await syntheticDrag(span, ["dragenter", "dragover", "drop"], {
    files: [
      { name: "first.pdf", size: 26 * 1024 * 1024 },
      { name: "second.pdf", size: 3 },
    ],
  });

  expect(results.map((result) => result.prevented)).toEqual([false, true, true]);
  await expect(out(page, "billing-value")).toHaveText("first.pdf");
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
  await expect(out(page, "billing-writes")).toHaveText("1");
  await expect(out(page, "billing-touches")).toHaveText("1");
  await expect(out(page, "billing-error")).toHaveText("fileTooLarge");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect
    .poll(() =>
      input.evaluate(
        (element: HTMLInputElement) =>
          element.files?.length === 1 &&
          element.files[0] === window.fileFieldFixture.billing.invoice().value(),
      ),
    )
    .toBe(true);

  if (browserName !== "chromium") {
    return;
  }

  // A native drop of a disk file through CDP: one drop, read at once, one write, nothing opened.
  // No document listener cancels anything on this route: the zone's own cancellation is all.
  await recordZoneDrops(zone);

  const cdp = await cdpDrops(page);

  await cdp.drop(span, await diskFile(info, "drop.pdf", 8));
  await expect(out(page, "billing-value")).toHaveText("drop.pdf");
  await expect(out(page, "billing-writes")).toHaveText("2");
  expect(await page.evaluate(() => window.ffZoneDrops)).toEqual(["billing-span"]);
  expect(await nativeFiles(input)).toEqual(["drop.pdf"]);

  // The positive control: outside every zone, the browser opens the file in a new tab and keeps
  // this page. CDP delivers the drags in order, so the zone's drop requested nothing before it.
  await cdp.drop(out(page, "outside"), await diskFile(info, "outside.pdf", 8));
  await expect.poll(() => cdp.probe.requested.length).toBe(1);
  expect(cdp.probe.requested[0]?.disposition).toBe("newTab");
  expect(cdp.probe.requested[0]?.url).toMatch(/outside\.pdf$/);
  expect(new URL(page.url()).pathname).toBe("/file-field");
  await expect(out(page, "billing-value")).toHaveText("drop.pdf");
});

test("FF5 disabled: the Input is natively disabled, a drop is refused and writes nothing, and a model write still applies and is mirrored", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "file-field", info);

  const zone = out(page, "disabled-zone");
  const input = out(page, "disabled-input");

  await expect(input).toBeDisabled();
  expect(
    await syntheticDrag(zone, ["dragenter", "dragover", "drop"], {
      files: [{ name: "refused.pdf", size: 3 }],
    }),
  ).toEqual([
    { type: "dragenter", prevented: false, dropEffect: "unset" },
    { type: "dragover", prevented: true, dropEffect: "none" },
    { type: "drop", prevented: true, dropEffect: "unset" },
  ]);
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
  await expect(out(page, "disabled-value")).toHaveText("null");

  if (browserName === "chromium") {
    // A native disk-file drop: dropEffect "none" means the browser delivers no drop at all.
    await recordZoneDrops(zone);

    const cdp = await cdpDrops(page);

    await cdp.drop(zone, await diskFile(info, "refused.pdf", 8));
    await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
    // The positive control orders the check: outside the zone the file opens in a new tab.
    await cdp.drop(out(page, "outside"), await diskFile(info, "outside.pdf", 8));
    await expect.poll(() => cdp.probe.requested.length).toBe(1);
    expect(cdp.probe.requested[0]?.url).toMatch(/outside\.pdf$/);
    expect(await page.evaluate(() => window.ffZoneDrops)).toEqual([]);
    await expect(out(page, "disabled-value")).toHaveText("null");
  }

  // The application's write applies and is mirrored; it isn't the user's, so no valueChange.
  await page.getByTestId("disabled-write").click();
  await expect(out(page, "disabled-value")).toHaveText("model.pdf");
  await expect.poll(() => nativeFiles(input)).toEqual(["model.pdf"]);
  await expect(out(page, "disabled-writes")).toHaveText("0");
});

test("FF6 Signal Forms: required after submit() and blur, a bare reset() keeps the file, reset with a value and a model write clear it, focusBoundControl(), the disabled rule, composers and replaced Options", async ({
  page,
}, info) => {
  await fixture(page, "file-field", info);

  const input = out(page, "billing-input");

  // submit() touches: required shows, aria-invalid, the Error describes the Input.
  await expect(out(page, "billing-errors")).toHaveText("required");
  await expect(out(page, "billing-error")).toHaveCount(0);
  await page.getByTestId("billing-submit").click();
  await expect(out(page, "billing-error")).toHaveText("required");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute("aria-describedby", "billing-description billing-error");
  await page.getByTestId("billing-reset").click();
  await expect(out(page, "billing-touched")).toHaveText("false");
  await expect(out(page, "billing-error")).toHaveCount(0);

  // Leaving the Input touches.
  await moveFocus(input);
  await expect(out(page, "billing-touches")).toHaveText("0");
  await moveFocus(out(page, "before-fields"));
  await expect(out(page, "billing-touches")).toHaveText("1");
  await expect(out(page, "billing-error")).toHaveText("required");

  // A bare reset() resets touched only and keeps the file and the native selection.
  await page.getByTestId("billing-write").click();
  await expect(out(page, "billing-value")).toHaveText("written.pdf");
  await expect.poll(() => nativeFiles(input)).toEqual(["written.pdf"]);
  await expect(out(page, "billing-errors")).toHaveText("");
  await page.getByTestId("billing-reset").click();
  await expect(out(page, "billing-touched")).toHaveText("false");
  await expect(out(page, "billing-value")).toHaveText("written.pdf");
  expect(await nativeFiles(input)).toEqual(["written.pdf"]);

  // reset() with a value, and a model write, clear both.
  await page.getByTestId("billing-reset-null").click();
  await expect(out(page, "billing-value")).toHaveText("null");
  await expect.poll(() => nativeFiles(input)).toEqual([]);
  await page.getByTestId("billing-write").click();
  await expect.poll(() => nativeFiles(input)).toEqual(["written.pdf"]);
  await page.getByTestId("billing-model-null").click();
  await expect(out(page, "billing-value")).toHaveText("null");
  await expect.poll(() => nativeFiles(input)).toEqual([]);
  // No write was the user's.
  await expect(out(page, "billing-writes")).toHaveText("0");

  await page.getByTestId("billing-focus").click();
  expect(await focusedTestId(page)).toBe("billing-input");

  // Disabling discards a file drag entered while enabled: enabling again doesn't revive it.
  const zone = out(page, "billing-zone");

  await syntheticDrag(zone, ["dragenter"], { files: [{ name: "held.pdf", size: 1 }] });
  await expect(zone).toHaveAttribute("data-drag-over", "");
  await page.getByTestId("billing-lock").click();
  await expect(input).toBeDisabled();
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
  await page.getByTestId("billing-lock").click();
  await expect(input).toBeEnabled();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);

  // The disabled rule: natively disabled, no drag highlight, focusBoundControl() does nothing.
  await page.getByTestId("billing-lock").click();
  await expect(input).toBeDisabled();
  await syntheticDrag(zone, ["dragenter"], { files: [{ name: "locked.pdf", size: 1 }] });
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
  await moveFocus(out(page, "before-fields"));
  await page.getByTestId("billing-focus").click();
  expect(await focusedTestId(page)).toBe("billing-focus");
  await page.getByTestId("billing-lock").click();
  await expect(input).toBeEnabled();

  // A consumer component through hostDirectives is the control [formField] finds.
  await out(page, "composed-input").setInputFiles({
    name: "composed.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("c"),
  });
  await expect(out(page, "composed-value")).toHaveText("composed.pdf");
  await expect(out(page, "composed-state")).toHaveText("composed.pdf");
  await expect(out(page, "composed-touched")).toHaveText("true");
  await expect(out(page, "composed-errors")).toHaveText("");
  await page.getByTestId("composed-focus").click();
  expect(await focusedTestId(page)).toBe("composed-input");

  // Existing replacement Options drive the parts; the composed root's own model is never written.
  await out(page, "owned-input").setInputFiles({
    name: "owned.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("o"),
  });
  await expect(out(page, "owned-value")).toHaveText("owned.pdf");
  await expect(out(page, "owned-state")).toHaveText("owned.pdf");
  await expect(out(page, "owned-own-value")).toHaveText("null");
  await expect(out(page, "owned-touched")).toHaveText("true");
  await page.getByTestId("owned-focus").click();
  expect(await focusedTestId(page)).toBe("owned-input");
  await page.getByTestId("owned-lock").click();
  await expect(out(page, "owned-input")).toBeDisabled();
});

/**
 * Loads `url` with bootstrap held and runs `before` while the fixture is still the server's: under
 * eager hydration before the application bootstraps, under incremental hydration once the shell
 * attached with the fixture's block still dehydrated, so `before` is what hydrates it. With
 * `holdChunks`, incremental hydration's script requests after the shell attached are held until
 * `before` has run, so a pick made then lands before the block hydrates.
 */
async function hydrateAfter(
  page: Page,
  info: TestInfo,
  before: () => Promise<void>,
  { url = "/file-field", holdChunks = false }: { url?: string; holdChunks?: boolean } = {},
): Promise<void> {
  const incremental = info.project.metadata.hydration === "incremental";
  const host = page.locator("acceptance-file-field-fixture");
  const release = await bootstrapHeld(page, url, info);
  let releaseChunks = (): void => {};
  let chunkHeld = false;

  try {
    if (incremental) {
      release();
      await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");

      if (holdChunks) {
        const gate = new Promise<void>((resolve) => {
          releaseChunks = resolve;
        });

        await page.route("**/*", async (route) => {
          if (route.request().resourceType() !== "script") {
            await route.fallback();

            return;
          }

          chunkHeld = true;
          await gate;
          await route.continue();
        });
      }
    }

    await expect(host).not.toHaveAttribute("data-client-rendered", /.*/);
    await before();

    if (incremental && holdChunks) {
      await expect.poll(() => chunkHeld).toBe(true);
      await expect(host).not.toHaveAttribute("data-client-rendered", /.*/);
    }
  } finally {
    releaseChunks();
    release();
  }

  if (!incremental) {
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  }

  await expect(host).toHaveAttribute("data-client-rendered", "true");
}

/**
 * Lets eager replay run (`?hold-stability`), by a script click that moves no focus, then waits
 * two frames.
 */
async function releaseReplay(page: Page): Promise<void> {
  await page.getByTestId("release-stability").evaluate((button: HTMLElement) => button.click());
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

test("FF7 a file picked through the zone before its block hydrates is adopted once and touches; Angular's replayed change doesn't write it again", async ({
  page,
}, info) => {
  const picked = await diskFile(info, "early.pdf", 6);
  const input = out(page, "billing-input");

  await hydrateAfter(
    page,
    info,
    async () => {
      const choosing = page.waitForEvent("filechooser");

      await out(page, "billing-zone").click({ position: { x: 300, y: 12 } });
      await (await choosing).setFiles(picked);
    },
    { url: "/file-field?hold-stability", holdChunks: true },
  );
  await expect(out(page, "billing-value")).toHaveText("early.pdf");
  await releaseReplay(page);
  await expect(out(page, "billing-value")).toHaveText("early.pdf");
  await expect(out(page, "billing-writes")).toHaveText("1");
  await expect(out(page, "billing-touches")).toHaveText("1");
  await expect(out(page, "billing-touched")).toHaveText("true");
  expect(
    await input.evaluate(
      (element: HTMLInputElement) =>
        element.files?.length === 1 &&
        element.files[0] === window.fileFieldFixture.billing.invoice().value(),
    ),
  ).toBe(true);
});

test("FF7 a file over the limit picked before hydration is touched and shows its error once the block hydrates", async ({
  page,
}, info) => {
  const picked = await diskFile(info, "large.pdf", 26 * 1024 * 1024);

  await hydrateAfter(
    page,
    info,
    async () => {
      const choosing = page.waitForEvent("filechooser");

      await out(page, "billing-zone").click({ position: { x: 300, y: 12 } });
      await (await choosing).setFiles(picked);
    },
    { holdChunks: true },
  );
  await expect(out(page, "billing-value")).toHaveText("large.pdf");
  await expect(out(page, "billing-error")).toHaveText("fileTooLarge");
  await expect(out(page, "billing-input")).toHaveAttribute("aria-invalid", "true");
  await expect(out(page, "billing-writes")).toHaveText("1");
});

test("FF7 a pick made while hydration finishes with the chooser still open is an ordinary change that writes once", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const host = page.locator("acceptance-file-field-fixture");
  const release = await bootstrapHeld(page, "/file-field", info);

  if (incremental) {
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  }

  await expect(host).not.toHaveAttribute("data-client-rendered", /.*/);

  const choosing = page.waitForEvent("filechooser");

  // Under incremental hydration this click is the block's hydration trigger.
  await out(page, "billing-zone").click({ position: { x: 300, y: 12 } });

  const chooser = await choosing;

  release();
  await expect(host).toHaveAttribute("data-client-rendered", "true");
  await chooser.setFiles(await diskFile(info, "open.pdf", 4));
  await expect(out(page, "billing-value")).toHaveText("open.pdf");
  await expect(out(page, "billing-writes")).toHaveText("1");
  await expect(out(page, "billing-touches")).toHaveText("1");
});

test("FF7 leaving the server-rendered Input before its block hydrates touches the field once it hydrates", async ({
  page,
}, info) => {
  await hydrateAfter(page, info, async () => {
    await moveFocus(out(page, "billing-input"));
    // A click on another control in the block, which takes focus from the Input.
    await page.getByTestId("before-fields").click();
  });
  await expect(out(page, "billing-touches")).toHaveText("1");
  await expect(out(page, "billing-touched")).toHaveText("true");
  await expect(out(page, "billing-error")).toHaveText("required");
  await expect(out(page, "billing-writes")).toHaveText("0");
});

test("FF7 focus leaving the Input before its root's first render touches once the root has rendered; a touch that destroys the root ends it", async ({
  page,
}, info) => {
  await fixture(page, "file-field", info);
  // The Input takes focus and loses it during the change detection that creates its root.
  await page.getByTestId("early-show").click();
  await expect(out(page, "early-input")).toHaveCount(1);
  await expect(out(page, "early-touches")).toHaveText("1");

  // The root's touch, delivered at its first render, destroys it: nothing written after it.
  await page.getByTestId("dropped-show").click();
  await expect(out(page, "dropped-touches")).toHaveText("1");
  await expect(out(page, "dropped-input")).toHaveCount(0);
  await expect(out(page, "dropped-value")).toHaveText("null");
  await expect(out(page, "dropped-sets")).toHaveText("0");
});

test("FF7 a Clear clicked before its block hydrates does nothing once replayed: an empty field stays empty, untouched, and focus stays where the user moved it", async ({
  page,
}, info) => {
  await hydrateAfter(
    page,
    info,
    async () => {
      await out(page, "image-clear").click();
      await out(page, "before-fields").click();
    },
    { url: "/file-field?hold-stability", holdChunks: true },
  );
  await releaseReplay(page);
  await expect(out(page, "before-fields")).toBeFocused();
  await expect(out(page, "image-value")).toHaveText("null");
  await expect(out(page, "image-writes")).toHaveText("0");
  await expect(out(page, "image-touches")).toHaveText("0");
});

test("FF7 a pick and then a Clear before the block hydrates keep the adopted pick: the replayed click doesn't empty the field or move focus", async ({
  page,
}, info) => {
  const early = await diskFile(info, "early.png", 4);

  await hydrateAfter(
    page,
    info,
    async () => {
      const choosing = page.waitForEvent("filechooser");

      await out(page, "image-choose").click();
      await (await choosing).setFiles(early);
      await out(page, "image-clear").click();
      await out(page, "before-fields").click();
    },
    { url: "/file-field?hold-stability", holdChunks: true },
  );
  await releaseReplay(page);
  await expect(out(page, "before-fields")).toBeFocused();
  await expect(out(page, "image-value")).toHaveText("early.png");
  expect(await nativeFiles(out(page, "image-input"))).toEqual(["early.png"]);
  await expect(out(page, "image-writes")).toHaveText("1");
  // The adoption's touch and the Input's replayed blur.
  await expect(out(page, "image-touches")).toHaveText("2");
});

test("FF9 split layout: the Label's for and the Input's description follow their hydrate boundaries, a pick in the dehydrated Input is adopted once, and the root's disabled reaches the late Input", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const label = page.locator("#split-label");
  const input = out(page, "split-input");
  let serverId: string | null = null;

  await fixture(page, "file-field-split", info, async () => {
    if (!incremental) {
      // Without incremental hydration the server renders the blocks' placeholders.
      await expect(label).toHaveCount(0);
      await expect(input).toHaveCount(0);

      return;
    }

    serverId = await input.getAttribute("id");
    expect(serverId).toMatch(/^og-file-field-input-s\d+$/);
    await expect(label).toHaveAttribute("for", serverId!);
    await expect(input).toHaveAttribute("aria-describedby", "split-description");
    await expect(input).toHaveAttribute("aria-required", "true");
    await expect(out(page, "locked-input")).toHaveAttribute("disabled", "");
  });

  if (incremental) {
    // The blocks are still dehydrated: the server's attributes stay as they were.
    await expect(label).toHaveAttribute("for", serverId!);
    await expect(input).toHaveAttribute("aria-describedby", "split-description");

    // Reverse order: the Description, then the Label, while the Input stays dehydrated.
    await page.getByTestId("split-hydrate-description").click();
    await page.getByTestId("split-hydrate-label").click();
    // A hydrated Label names no control that isn't registered yet.
    await expect(label).not.toHaveAttribute("for", /.*/);
    await expect(input).toHaveAttribute("aria-describedby", "split-description");
    await expect(out(page, "split-value")).toHaveText("null");

    // A pick in the server-rendered Input: its `change`, at an element with a listener, is what
    // hydrates the block, whatever its trigger. The Input's first render adopts the file into the
    // outer root's value; the replayed `change` writes and touches nothing more.
    await input.setInputFiles({
      name: "split.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("s"),
    });
    await expect(out(page, "split-value")).toHaveText("split.pdf");
    await expect(input).toHaveAttribute("id", serverId!);
    await expect(label).toHaveAttribute("for", serverId!);
    await expect(input).toHaveAttribute("aria-describedby", "split-description");
    await expect(out(page, "split-writes")).toHaveText("1");
    await expect(out(page, "split-touches")).toHaveText("1");
    await expect(out(page, "split-touched")).toHaveText("true");
    expect(await nativeFiles(input)).toEqual(["split.pdf"]);
    // The locked root's Input is still dehydrated.
    await expect(out(page, "locked-input")).toHaveAttribute("disabled", "");
    await page.getByTestId("split-hydrate-input").click();
  } else {
    await page.getByTestId("split-hydrate-description").click();
    await page.getByTestId("split-hydrate-label").click();
    await page.getByTestId("split-hydrate-input").click();
    await expect(input).toHaveCount(1);
    await expect(label).toHaveAttribute("for", (await input.getAttribute("id"))!);
    await expect(input).toHaveAttribute("aria-describedby", "split-description");
    await expect(out(page, "split-writes")).toHaveText("0");
    await expect(out(page, "split-touches")).toHaveText("0");
  }

  await expect(page.getByRole("button", { name: "Συνημμένο" })).toHaveAccessibleDescription(
    "PDF έως 10MB",
  );
  // The root's disabled rule reaches the late Input from its first render.
  await expect(out(page, "locked-input")).toBeDisabled();
});

test("FF9 split layout: an Input whose block is destroyed while dehydrated adopts and touches nothing; a remounted Input registers and mirrors the current value", async ({
  page,
}, info) => {
  const incremental = info.project.metadata.hydration === "incremental";
  const input = out(page, "split-input");
  const live = page.locator('[data-testid="split-input"]:not([data-dead])');

  await fixture(page, "file-field-split", info);

  if (incremental) {
    // A file in the dehydrated Input, assigned without an event (an event at its listeners would
    // hydrate the block), then its block is destroyed unhydrated: its adoption never runs.
    await input.evaluate((element: HTMLInputElement) => {
      const transfer = new DataTransfer();

      transfer.items.add(new File(["d"], "dead.pdf"));
      element.files = transfer.files;
      element.setAttribute("data-dead", "");
    });
  } else {
    await expect(input).toHaveCount(1);
  }

  await page.getByTestId("split-unmount").click();
  await expect(live).toHaveCount(0);

  if (incremental) {
    // Angular leaves a still-dehydrated block's server DOM in place when the view around it is
    // destroyed; that Input never hydrated, so it never registered with the root.
    await expect(page.locator('[data-testid="split-input"][data-dead]')).toHaveCount(1);
  }

  await page.getByTestId("split-write").click();
  await expect(out(page, "split-value")).toHaveText("written.pdf");
  await page.getByTestId("split-mount").click();
  await expect(live).toHaveCount(1);
  await expect.poll(() => nativeFiles(live)).toEqual(["written.pdf"]);
  await expect(out(page, "split-writes")).toHaveText("0");
  await expect(out(page, "split-touches")).toHaveText("0");
  await expect(out(page, "split-touched")).toHaveText("false");

  // The new Input is the one registered: a pick writes through it, and no second Input fails.
  await live.setInputFiles({
    name: "new.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("n"),
  });
  await expect(out(page, "split-value")).toHaveText("new.pdf");
  await expect(out(page, "split-writes")).toHaveText("1");
});

test("FF9 same-render part-only teardown: an Input removed before its root's first render neither adopts its file nor touches with its blur; the replacement mirrors the reset field", async ({
  page,
}, info) => {
  await fixture(page, "file-field", info);
  // Input A holds a native stale.pdf, takes and loses focus during the change detection that
  // creates the root, then the fixture replaces it with Input B and resets the field, before the
  // root's first render: A's first-render adoption and its held blur are both pending.
  await page.getByTestId("replaced-show").click();
  await expect(out(page, "replaced-b")).toHaveCount(1);
  await expect(out(page, "replaced-a")).toHaveCount(0);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(out(page, "replaced-value")).toHaveText("null");
  await expect(out(page, "replaced-writes")).toHaveText("0");
  await expect(out(page, "replaced-touches")).toHaveText("0");
  await expect(out(page, "replaced-touched")).toHaveText("false");
  await expect(out(page, "replaced-error")).toHaveCount(0);
  expect(await nativeFiles(out(page, "replaced-b"))).toEqual([]);

  // B's own departure touches once.
  await moveFocus(out(page, "replaced-b"));
  await page.keyboard.press("Tab");
  await expect(out(page, "replaced-touches")).toHaveText("1");
  await expect(out(page, "replaced-error")).toHaveText("required");
});

test("FF10 the native selection mirrors a plain replacement signal written from a timer, with no consumer binding reading it", async ({
  page,
}, info) => {
  await fixture(page, "file-field", info);

  const input = out(page, "plain-input");

  await page.getByTestId("plain-write-file").click();
  await expect
    .poll(() =>
      input.evaluate(
        (element: HTMLInputElement) =>
          window.fileFieldFixture.plainFile !== null &&
          element.files?.length === 1 &&
          element.files[0] === window.fileFieldFixture.plainFile,
      ),
    )
    .toBe(true);
  await page.getByTestId("plain-write-null").click();
  await expect.poll(() => nativeFiles(input)).toEqual([]);
});

test("FF10 a pick the plain replacement signal's owner undoes inside its write empties the native selection, so choosing the same file again writes again", async ({
  page,
}, info) => {
  await fixture(page, "file-field", info);

  const input = out(page, "plain-input");
  const same = await diskFile(info, "same.pdf", 4);

  // The fixture's signal writes null inside the pick's write of the File: the effective value
  // settles at null, where the mirror last saw it, yet the pick filled `files`.
  await page.getByTestId("plain-clear-picks").click();

  let choosing = page.waitForEvent("filechooser");

  await out(page, "plain-choose").click();

  let chooser = await choosing;

  await chooser.setFiles(same);
  await expect(out(page, "plain-cleared")).toHaveText("1");
  await expect.poll(() => nativeFiles(input)).toEqual([]);

  // The emptied Input reports the same file as a change, in every engine.
  choosing = page.waitForEvent("filechooser");
  await out(page, "plain-choose").click();
  chooser = await choosing;
  await chooser.setFiles(same);
  await expect(out(page, "plain-cleared")).toHaveText("2");
  await expect.poll(() => nativeFiles(input)).toEqual([]);
});

test("FF11 the page guard recipe: a native file input next to a zone still takes a dropped file, and a drop outside both opens nothing", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "file-field-guarded", info);

  const native = out(page, "native-input");
  const outside = out(page, "guarded-outside");
  const file = { files: [{ name: "guarded.pdf", size: 3 }] };

  // The guard's handler logic: it leaves a native file input's drag alone and cancels elsewhere.
  expect(await syntheticDrag(native, ["dragover"], file)).toEqual([
    { type: "dragover", prevented: false, dropEffect: "unset" },
  ]);
  expect((await syntheticDrag(outside, ["dragover"], file))[0]?.prevented).toBe(true);
  expect((await syntheticDrag(outside, ["dragover"], { text: "words" }))[0]?.prevented).toBe(false);

  if (browserName !== "chromium") {
    return;
  }

  const cdp = await cdpDrops(page);

  // The native input selects the dropped disk file natively.
  await cdp.drop(native, await diskFile(info, "native.pdf", 8));
  await expect(out(page, "native-changes")).toHaveText("1");
  await expect(out(page, "native-name")).toHaveText("native.pdf");

  // Outside both: the guard keeps the browser from opening the file. The zone's drop after it,
  // delivered in order, shows the outside drop was handled first.
  await cdp.drop(outside, await diskFile(info, "outside.pdf", 8));
  await cdp.drop(out(page, "guarded-zone"), await diskFile(info, "zone.pdf", 8));
  await expect(out(page, "guarded-value")).toHaveText("zone.pdf");
  expect(cdp.probe.requested).toEqual([]);
  expect(cdp.probe.pages).toBe(0);
  expect(new URL(page.url()).pathname).toBe("/file-field-guarded");
});

test("FF12 nested roots: the innermost zone owns a drag; an enclosing zone isn't highlighted over it, keeps its own policy out of it and takes none of its drops", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "file-field", info);

  const outer = out(page, "nested-outer-zone");
  const area = out(page, "nested-outer-area");
  const inner = out(page, "nested-inner-zone");
  const span = out(page, "nested-inner-span");
  const file = { files: [{ name: "drag.pdf", size: 3 }] };
  /** Toggles a nested field's disabled and waits for its Input to render it. */
  const lock = async (which: "outer" | "inner", locked: boolean): Promise<void> => {
    const input = out(page, `nested-${which}-input`);

    await page.getByTestId(`nested-${which}-lock`).click();

    if (locked) {
      await expect(input).toBeDisabled();
    } else {
      await expect(input).toBeEnabled();
    }
  };
  const outerUntouched = async (): Promise<void> => {
    await expect(out(page, "nested-outer-value")).toHaveText("null");
    await expect(out(page, "nested-outer-writes")).toHaveText("0");
    await expect(out(page, "nested-outer-touches")).toHaveText("0");
  };

  // Enter-before-leave, as native traces order them: the outer area, into the inner zone and its
  // span, back out to the outer area, then out of both.
  await syntheticDrag(area, ["dragenter"], file);
  await expect(outer).toHaveAttribute("data-drag-over", "");
  await expect(inner).not.toHaveAttribute("data-drag-over", /.*/);
  await syntheticDrag(inner, ["dragenter"], file);
  await syntheticDrag(area, ["dragleave"], file);
  await expect(inner).toHaveAttribute("data-drag-over", "");
  await expect(outer).not.toHaveAttribute("data-drag-over", /.*/);
  await syntheticDrag(span, ["dragenter"], file);
  await syntheticDrag(inner, ["dragleave"], file);
  await expect(inner).toHaveAttribute("data-drag-over", "");
  await expect(outer).not.toHaveAttribute("data-drag-over", /.*/);
  await syntheticDrag(area, ["dragenter"], file);
  await syntheticDrag(span, ["dragleave"], file);
  await expect(outer).toHaveAttribute("data-drag-over", "");
  await expect(inner).not.toHaveAttribute("data-drag-over", /.*/);
  await syntheticDrag(area, ["dragleave"], file);
  await expect(outer).not.toHaveAttribute("data-drag-over", /.*/);

  // A drop on the inner zone writes and touches the inner field only.
  expect(
    await syntheticDrag(span, ["dragenter", "dragover", "drop"], {
      files: [{ name: "inner.pdf", size: 3 }],
    }),
  ).toEqual([
    { type: "dragenter", prevented: false, dropEffect: "unset" },
    { type: "dragover", prevented: true, dropEffect: "copy" },
    { type: "drop", prevented: true, dropEffect: "unset" },
  ]);
  await expect(out(page, "nested-inner-value")).toHaveText("inner.pdf");
  await expect(out(page, "nested-inner-writes")).toHaveText("1");
  await expect(out(page, "nested-inner-touches")).toHaveText("1");
  await outerUntouched();

  // A disabled outer field doesn't refuse the enabled inner zone's drag.
  await lock("outer", true);
  expect(
    await syntheticDrag(span, ["dragenter", "dragover", "drop"], {
      files: [{ name: "kept.pdf", size: 3 }],
    }),
  ).toEqual([
    { type: "dragenter", prevented: false, dropEffect: "unset" },
    { type: "dragover", prevented: true, dropEffect: "copy" },
    { type: "drop", prevented: true, dropEffect: "unset" },
  ]);
  await expect(out(page, "nested-inner-value")).toHaveText("kept.pdf");
  await expect(out(page, "nested-inner-writes")).toHaveText("2");
  await outerUntouched();
  await lock("outer", false);

  // A disabled inner zone's refusal stands: the enabled outer field neither accepts nor takes it.
  await lock("inner", true);
  expect(
    await syntheticDrag(span, ["dragenter", "dragover", "drop"], {
      files: [{ name: "taken.pdf", size: 3 }],
    }),
  ).toEqual([
    { type: "dragenter", prevented: false, dropEffect: "unset" },
    { type: "dragover", prevented: true, dropEffect: "none" },
    { type: "drop", prevented: true, dropEffect: "unset" },
  ]);
  await expect(outer).not.toHaveAttribute("data-drag-over", /.*/);
  await expect(out(page, "nested-inner-value")).toHaveText("kept.pdf");
  await outerUntouched();
  await lock("inner", false);

  if (browserName !== "chromium") {
    return;
  }

  // Native disk-file drops on the inner zone's span through CDP, each policy pair again: the
  // browser delivers a drop only when the inner zone accepts it.
  await recordZoneDrops(inner);

  const cdp = await cdpDrops(page);

  await cdp.drop(span, await diskFile(info, "nested.pdf", 8));
  await expect(out(page, "nested-inner-value")).toHaveText("nested.pdf");
  await outerUntouched();

  await lock("outer", true);
  await cdp.drop(span, await diskFile(info, "copy.pdf", 8));
  await expect(out(page, "nested-inner-value")).toHaveText("copy.pdf");
  expect(await page.evaluate(() => window.ffZoneDrops)).toEqual([
    "nested-inner-span",
    "nested-inner-span",
  ]);
  await outerUntouched();
  await lock("outer", false);

  await lock("inner", true);
  await cdp.drop(span, await diskFile(info, "refused.pdf", 8));
  // The positive control orders the check: outside every zone the file opens in a new tab.
  await cdp.drop(out(page, "outside"), await diskFile(info, "outside.pdf", 8));
  await expect.poll(() => cdp.probe.requested.length).toBe(1);
  expect(cdp.probe.requested[0]?.url).toMatch(/outside\.pdf$/);
  expect(await page.evaluate(() => window.ffZoneDrops)).toHaveLength(2);
  await expect(out(page, "nested-inner-value")).toHaveText("copy.pdf");
  await outerUntouched();
});

test("FF13 a Clear reached without leaving the Input empties an app-written, untouched field without touching it; leaving the Input then touches", async ({
  page,
}, info) => {
  await fixture(page, "file-field", info);
  await out(page, "billing-write").click();
  await expect(out(page, "billing-value")).toHaveText("written.pdf");
  await expect(out(page, "billing-root-value")).toHaveText("written.pdf");
  await expect.poll(() => nativeFiles(out(page, "billing-input"))).toEqual(["written.pdf"]);
  await expect(out(page, "billing-touches")).toHaveText("0");
  await expect(out(page, "billing-touched")).toHaveText("false");

  await moveFocus(out(page, "billing-clear"));
  await page.keyboard.press("Enter");

  await expect(out(page, "billing-value")).toHaveText("null");
  await expect(out(page, "billing-root-value")).toHaveText("null");
  // The app's write emitted nothing; the Clear's is the one valueChange.
  await expect(out(page, "billing-writes")).toHaveText("1");
  await expect(out(page, "billing-clear")).toHaveCount(0);
  await expect(out(page, "billing-input")).toBeFocused();
  await expect.poll(() => nativeFiles(out(page, "billing-input"))).toEqual([]);
  await expect(out(page, "billing-touches")).toHaveText("0");
  await expect(out(page, "billing-touched")).toHaveText("false");
  await expect(out(page, "billing-error")).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(out(page, "billing-touches")).toHaveText("1");
  await expect(out(page, "billing-touched")).toHaveText("true");
  await expect(out(page, "billing-error")).toHaveText("required");
});

for (const activation of ["pointer", "Enter", "Space"] as const) {
  test(`FF14 pick, then a Clear by ${activation}: the field, the form and the native input are emptied, focus lands on the Input and required shows at once; the same file then writes again`, async ({
    page,
  }, info) => {
    await fixture(page, "file-field", info);

    const input = out(page, "billing-input");
    const picked = await diskFile(info, "clear.pdf", 16);
    const choose = async (): Promise<void> => {
      const choosing = page.waitForEvent("filechooser");

      await out(page, "billing-zone").click({ position: { x: 300, y: 12 } });
      await (await choosing).setFiles(picked);
    };

    await choose();
    await expect(out(page, "billing-value")).toHaveText("clear.pdf");
    await expect(out(page, "billing-writes")).toHaveText("1");
    // A pick touches: the Clear finds the field touched already.
    await expect(out(page, "billing-touched")).toHaveText("true");
    await expect(out(page, "billing-clear")).toHaveCount(1);

    let choosers = 0;

    page.on("filechooser", () => {
      choosers += 1;
    });

    if (activation === "pointer") {
      await out(page, "billing-clear").click();
    } else {
      await moveFocus(input);
      await page.keyboard.press("Tab");
      await expect(out(page, "billing-clear")).toBeFocused();
      await page.keyboard.press(activation);
    }

    await expect(out(page, "billing-clear")).toHaveCount(0);
    await expect(out(page, "billing-value")).toHaveText("null");
    await expect(out(page, "billing-root-value")).toHaveText("null");
    await expect(out(page, "billing-writes")).toHaveText("2");
    await expect(input).toBeFocused();
    await expect.poll(() => nativeFiles(input)).toEqual([]);
    await expect(out(page, "billing-error")).toHaveText("required");
    expect(await input.evaluate((element) => element.matches(":focus-visible"))).toBe(
      activation !== "pointer",
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    expect(choosers).toBe(0);

    await choose();
    await expect(out(page, "billing-value")).toHaveText("clear.pdf");
    await expect(out(page, "billing-writes")).toHaveText("3");
  });
}

test("FF15 an empty field's Clear only focuses the Input; replaced Options' Clear writes the owner's value; a disabled field's Clear is natively disabled and inert", async ({
  page,
}, info) => {
  await fixture(page, "file-field", info);

  // Empty: nothing written, no valueChange, no touch; focus moves to the Input.
  await out(page, "image-clear").click();
  await expect(out(page, "image-input")).toBeFocused();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(out(page, "image-value")).toHaveText("null");
  await expect(out(page, "image-writes")).toHaveText("0");
  await expect(out(page, "image-touches")).toHaveText("0");

  // Existing replacement Options: the owner's model and the form are emptied, not the composed
  // root's own model.
  await out(page, "owned-input").setInputFiles({
    name: "owned.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("o"),
  });
  await expect(out(page, "owned-value")).toHaveText("owned.pdf");
  await out(page, "owned-clear").click();
  await expect(out(page, "owned-value")).toHaveText("null");
  await expect(out(page, "owned-state")).toHaveText("null");
  await expect(out(page, "owned-own-value")).toHaveText("null");
  await expect(out(page, "owned-input")).toBeFocused();
  await expect.poll(() => nativeFiles(out(page, "owned-input"))).toEqual([]);

  // Disabled: natively disabled with the field; a click writes nothing and moves no focus.
  const clear = out(page, "disabled-clear");

  await page.getByTestId("disabled-write").click();
  await expect(out(page, "disabled-value")).toHaveText("model.pdf");
  await expect(clear).toBeDisabled();
  await expect(clear).toHaveAttribute("aria-disabled", "true");
  await expect(clear).toHaveAttribute("data-disabled", "");
  await moveFocus(page.getByTestId("disabled-write"));
  await clear.evaluate((element: HTMLButtonElement) => element.click());
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.getByTestId("disabled-write")).toBeFocused();
  await expect(out(page, "disabled-value")).toHaveText("model.pdf");
  await expect(out(page, "disabled-writes")).toHaveText("0");
  expect(await nativeFiles(out(page, "disabled-input"))).toEqual(["model.pdf"]);
});
