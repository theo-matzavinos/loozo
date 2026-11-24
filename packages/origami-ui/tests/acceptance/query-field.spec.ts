import { test, expect } from "./contract-test.js";
import type { Locator, Page, TestInfo } from "playwright/test";
import { fixture } from "./observation.js";

// QF means section 38. QF1 is the package, type and documentation gates. Cases run against the
// `query-field` fixture; QF2, QF3 and QF25 run from
// hydration.spec.ts. "Shown" is `:popover-open` on Content; `aria-expanded="true"` means Shown
// with current rows. Script actions click fixture buttons from script, so focus stays put.

function parts(page: Page, prefix: string) {
  return {
    input: page.getByTestId(`${prefix}-input`),
    content: page.getByTestId(`${prefix}-content`),
    message: page.getByTestId(`${prefix}-message`),
    row: (index: number) => page.getByTestId(`${prefix}-row-${index}`),
  };
}

function out(page: Page, id: string): Locator {
  return page.getByTestId(id);
}

function presented(content: Locator): () => Promise<boolean> {
  return () => content.evaluate((node) => node.matches(":popover-open"));
}

async function expectRows(input: Locator, content: Locator): Promise<void> {
  await expect.poll(presented(content)).toBe(true);
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(content).not.toHaveAttribute("aria-hidden", /.*/);
}

async function expectMessageOnly(input: Locator, content: Locator): Promise<void> {
  await expect.poll(presented(content)).toBe(true);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(content).toHaveAttribute("aria-hidden", "true");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
}

async function expectClosed(input: Locator, content: Locator): Promise<void> {
  await expect.poll(presented(content)).toBe(false);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
}

async function expectHighlighted(input: Locator, row: Locator): Promise<void> {
  const id = await row.getAttribute("id");

  expect(id).toMatch(/\S/);
  await expect(input).toHaveAttribute("aria-activedescendant", id ?? "");
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row).toHaveAttribute("data-active", "");
}

/** Two animation frames, so a stray write or a scheduled reopen would have rendered. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** Clicks a fixture control from script, so focus stays where it is. */
async function script(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).dispatchEvent("click");
}

/** Focuses the input from script and collapses its caret at `caret` (the end by default). */
async function caretAt(input: Locator, caret?: number): Promise<void> {
  await input.evaluate((node: HTMLInputElement, at: number | undefined) => {
    node.focus();

    const offset = at ?? node.value.length;

    node.setSelectionRange(offset, offset);
  }, caret);
}

async function offsets(input: Locator): Promise<[number | null, number | null]> {
  return input.evaluate((node: HTMLInputElement) => [node.selectionStart, node.selectionEnd]);
}

async function selection(input: Locator): Promise<[number | null, number | null, string | null]> {
  return input.evaluate((node: HTMLInputElement) => [
    node.selectionStart,
    node.selectionEnd,
    node.selectionDirection,
  ]);
}

/** The events of the report mount's log, grouped per task: `|` ends a task's group. */
async function tasks(page: Page): Promise<string[][]> {
  const text = (await out(page, "report-log").textContent()) ?? "";
  const groups: string[][] = [];
  let group: string[] = [];

  for (const entry of text.split(",")) {
    if (entry === "|") {
      groups.push(group);
      group = [];
    } else if (entry !== "") {
      group.push(entry);
    }
  }

  return groups;
}

/** Counts every write of the input's `value` property from now on, in `window.valueWrites`. */
async function spyValueWrites(input: Locator): Promise<void> {
  await input.evaluate((node: HTMLInputElement) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;
    const counter = window as unknown as { valueWrites: number };

    counter.valueWrites = 0;
    Object.defineProperty(node, "value", {
      configurable: true,
      get() {
        return descriptor.get!.call(this);
      },
      set(value: string) {
        counter.valueWrites += 1;
        descriptor.set!.call(this, value);
      },
    });
  });
}

async function valueWrites(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { valueWrites: number }).valueWrites);
}

/** Records the input's `input` events' types from now on, in `window.inputTypes`. */
async function recordInputs(input: Locator): Promise<void> {
  await input.evaluate((node: HTMLInputElement) => {
    const record = window as unknown as { inputTypes: string[] };

    record.inputTypes = [];
    node.addEventListener("input", (event) => {
      const type = event instanceof InputEvent ? event.inputType : "plain";

      record.inputTypes.push(`${type}${event.isTrusted ? "" : "*"}`);
    });
  });
}

/** The report mount's `search` and `submit` counts. */
async function enterCounts(page: Page): Promise<{ searches: number; submits: number }> {
  const searches = (await out(page, "report-searches").textContent()) ?? "";
  const submits = Number((await out(page, "report-submits").textContent()) ?? "0");

  return { searches: searches === "" ? 0 : searches.split(",").length, submits };
}

/** Records each Enter keydown's `defaultPrevented` once dispatch reached the document, in `window.enters`. */
async function recordEnters(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record = window as unknown as { enters: boolean[] };

    record.enters = [];
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        record.enters.push(event.defaultPrevented);
      }
    });
  });
}

async function enters(page: Page): Promise<boolean[]> {
  return page.evaluate(() => (window as unknown as { enters: boolean[] }).enters);
}

async function inputTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { inputTypes: string[] }).inputTypes);
}

test("QF4: each edit emits queryChange then caretChange in its task and shows current rows; a free word without suggestions closes; Tab and script focus never open", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "report");

  // Tab and script focus are baselines. Tab selects the whole text: the caret is null, and no
  // caret is published on the way, WebKit's transient `[0, 0]` during its focus event included.
  await page.getByTestId("report-reset-log").focus();
  await script(page, "report-reset-log");
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await frames(page);
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  await expectClosed(input, content);
  expect(await offsets(input)).toEqual([0, "report staus:open".length]);
  await expect(out(page, "report-caret")).toHaveText("null");
  expect((await tasks(page)).flat()).not.toContain("c:0");
  await input.evaluate((node: HTMLInputElement) => node.blur());
  await input.evaluate((node: HTMLInputElement) => node.focus());
  await frames(page);
  await expectClosed(input, content);

  // A script focus with a move to 0 in the same task is a movement from the selection kept at
  // rest, also where WebKit reports `[0, 0]` during the focus: into the invalid `zz:a`, it opens.
  await caretAt(input);
  await script(page, "report-write-invalid-first");
  await expect(input).toHaveValue("zz:a report");
  await caretAt(input, 8);
  await page.getByTestId("report-after").focus();
  await expect(out(page, "report-caret")).toHaveText("null");
  await input.evaluate((node: HTMLInputElement) => {
    node.focus();
    node.setSelectionRange(0, 0);
  });
  await expect(out(page, "report-caret")).toHaveText("0");
  await expect(out(page, "report-open")).toHaveText("true");
  await expect.poll(presented(content)).toBe(true);
  await expect(page.getByTestId("report-message")).toHaveText("Άγνωστο φίλτρο «zz»");
  await page.keyboard.press("Escape");
  await expectClosed(input, content);

  // The same from a restored caret inside the invalid token: a move within it isn't a move into
  // another one, so it stays closed. At rest 0, every engine reads `[0, 0]` during the focus.
  await page.getByTestId("report-after").focus();
  await input.evaluate((node: HTMLInputElement) => {
    node.focus();
    node.setSelectionRange(2, 2);
  });
  await expect(out(page, "report-caret")).toHaveText("2");
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  await frames(page);
  await expectClosed(input, content);
  await expect(out(page, "report-open")).toHaveText("false");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("report staus:open");
  await expect(out(page, "report-query")).toHaveText("report staus:open");
  await page.keyboard.press("Escape");

  // At rest 10 inside `staus` (WebKit reads `[0, 0]` during the focus): a move to 11 stays closed.
  await caretAt(input, 10);
  await page.getByTestId("report-after").focus();
  await input.evaluate((node: HTMLInputElement) => {
    node.focus();
    node.setSelectionRange(11, 11);
  });
  await expect(out(page, "report-caret")).toHaveText("11");
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  await frames(page);
  await expectClosed(input, content);
  await expect(out(page, "report-open")).toHaveText("false");

  await caretAt(input);
  await script(page, "report-reset-log");
  await page.keyboard.type(" st");
  await expectRows(input, content);
  await expect(row(0)).toHaveText(/status/);
  await expect(out(page, "report-query")).toHaveText("report staus:open st");
  await expect(out(page, "report-caret")).toHaveText("20");

  const groups = await tasks(page);
  const edits: string[][] = [];

  for (const group of groups) {
    if (group.some((entry) => entry.startsWith("q:"))) {
      edits.push(group);
    }
  }

  expect(edits.slice(-3)).toEqual([
    ["q:report staus:open ", "c:18"],
    ["q:report staus:open s", "c:19"],
    ["q:report staus:open st", "c:20"],
  ]);

  await page.keyboard.type("atus:");
  await expectRows(input, content);
  await expect(row(0)).toHaveText(/draft/);
  await expect(row(2)).toHaveText(/approved/);

  // A free word with no suggestions: known empty closes.
  await page.keyboard.type(" zebra");
  await expectClosed(input, content);
  await expect(out(page, "report-open")).toHaveText("false");

  // A queryChange subscriber moves focus away during an edit: its blur is the last word, so the
  // edit publishes no caret after the blur's null and requests nothing.
  await script(page, "report-reset-log");
  await script(page, "report-blur-on-edit");
  await page.keyboard.type("s");
  await expect(page.getByTestId("report-after")).toBeFocused();
  await expect(out(page, "report-query")).toHaveText("report staus:open status: zebras");
  await frames(page);
  await expect(out(page, "report-caret")).toHaveText("null");
  await expect(out(page, "report-open")).toHaveText("false");
  expect((await tasks(page)).flat()).toEqual(["q:report staus:open status: zebras", "c:null"]);
});

test("QF5: caretChange follows arrows, Home, End and clicks; a range selection and blur report null; a move while Shown retires the highlight and re-targets the rows", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "report");
  const caret = out(page, "report-caret");

  await caretAt(input, 3);
  await expect(caret).toHaveText("3");
  await page.keyboard.press("ArrowRight");
  await expect(caret).toHaveText("4");
  await page.keyboard.press("End");
  await expect(caret).toHaveText("17");
  await page.keyboard.press("Home");
  await expect(caret).toHaveText("0");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(caret).toHaveText("null");
  await page.keyboard.press("ArrowLeft");
  await expect(caret).toHaveText("0");

  const box = await input.boundingBox();

  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) - 8,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
  await expect(caret).toHaveText("17");

  // A drag selects a range.
  await page.mouse.move((box?.x ?? 0) + 14, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) + 60, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.mouse.up();
  await expect(caret).toHaveText("null");

  // Shown on the free word's qualifiers, highlighted; a move retires the highlight.
  await caretAt(input);
  await page.keyboard.type(" s");
  await expectRows(input, content);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await page.keyboard.press("ArrowLeft");
  await expect(caret).toHaveText("18");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
  await expect(content.locator("[data-active]")).toHaveCount(0);

  await page.getByTestId("report-after").focus();
  await expect(caret).toHaveText("null");
  await expectClosed(input, content);
});

test("QF6: moving the caret into another invalid token opens the message by arrow or pointer press, not by Tab; Escape keeps it closed within the token; leaving and returning reopens; a stationary refresh doesn't; touching tokens resolve to the invalid one", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, message } = parts(page, "report");

  // `report staus:open`: `staus:open` is [7, 17).
  await caretAt(input, 6);
  await frames(page);
  await expectClosed(input, content);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(out(page, "report-caret")).toHaveText("8");
  await expect.poll(presented(content)).toBe(true);
  await expect(message).toHaveText("Άγνωστο φίλτρο «staus»");
  await expect(message).toHaveAttribute("aria-hidden", "true");

  // Escape, then arrows within the token: still closed.
  await page.keyboard.press("Escape");
  await expect.poll(presented(content)).toBe(false);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await frames(page);
  await expect.poll(presented(content)).toBe(false);

  // Leaving to `report` and returning reopens.
  await page.keyboard.press("Home");
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await caretAt(input, 6);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect.poll(presented(content)).toBe(true);

  // A refreshed analysis at a stationary caret doesn't reopen.
  await page.keyboard.press("Escape");
  await expect.poll(presented(content)).toBe(false);
  await script(page, "report-stale-analysis");
  await script(page, "report-current-analysis");
  await frames(page);
  await expect.poll(presented(content)).toBe(false);

  // Tab in: a baseline, never a movement.
  await page.getByTestId("report-after").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(input).toBeFocused();
  await frames(page);
  await expect.poll(presented(content)).toBe(false);

  // A pointer press from outside into `staus`.
  await page.getByTestId("report-after").focus();

  const box = await input.boundingBox();
  const at = await input.evaluate((node: HTMLInputElement) => {
    const style = getComputedStyle(node);
    const canvas = document.createElement("canvas").getContext("2d")!;

    canvas.font = `${style.fontSize} ${style.fontFamily}`;

    return (
      parseFloat(style.paddingLeft) +
      parseFloat(style.borderLeftWidth) +
      canvas.measureText("report sta").width
    );
  });

  await page.mouse.click((box?.x ?? 0) + at, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await expect.poll(presented(content)).toBe(true);
  await expect(message).toBeVisible();

  // A press whose default is prevented doesn't focus the input, so a later script focus at the
  // same caret stays a baseline.
  const pressed = await offsets(input);

  await page.keyboard.press("Escape");
  await expect.poll(presented(content)).toBe(false);
  await page.getByTestId("report-after").focus();
  await input.evaluate((node: HTMLInputElement) => {
    node.addEventListener("mousedown", (event) => event.preventDefault(), { once: true });
  });
  await page.mouse.click((box?.x ?? 0) + at, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await expect(input).not.toBeFocused();
  await input.evaluate((node: HTMLInputElement) => node.focus());
  await expect(out(page, "report-caret")).toHaveText(String(pressed[0]));
  await frames(page);
  await expect.poll(presented(content)).toBe(false);

  // The same cancelled press, still held when a focus the press didn't cause arrives: a baseline.
  await page.getByTestId("report-after").focus();
  await input.evaluate((node: HTMLInputElement) => {
    node.addEventListener("mousedown", (event) => event.preventDefault(), { once: true });
  });
  await page.mouse.move((box?.x ?? 0) + at, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.mouse.down();
  await expect(input).not.toBeFocused();
  await input.evaluate((node: HTMLInputElement) => node.focus());
  await expect(out(page, "report-caret")).toHaveText(String(pressed[0]));
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await page.mouse.up();
  await frames(page);
  await expect.poll(presented(content)).toBe(false);

  // A press whose `pointerdown` a consumer cancelled has no `mousedown`: a focus while it's held is
  // a baseline too.
  await page.getByTestId("report-after").focus();
  await input.evaluate((node: HTMLInputElement) => {
    node.addEventListener("pointerdown", (event) => event.preventDefault(), { once: true });
  });
  await page.mouse.move((box?.x ?? 0) + at, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.mouse.down();
  await input.evaluate((node: HTMLInputElement) => node.focus());
  await expect(out(page, "report-caret")).toHaveText(String(pressed[0]));
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await page.mouse.up();
  await frames(page);
  await expect.poll(presented(content)).toBe(false);

  // A caretChange subscriber moves focus away when the caret reaches `staus` at 8: its blur is the
  // last word, so nothing stays requested and the next focus at 8 shows no list.
  await caretAt(input, 6);
  await frames(page);
  await expectClosed(input, content);
  await script(page, "report-blur-at-8");
  await caretAt(input, 8);
  await expect(page.getByTestId("report-after")).toBeFocused();
  await expect(out(page, "report-caret")).toHaveText("null");
  await expect(out(page, "report-open")).toHaveText("false");
  await input.evaluate((node: HTMLInputElement) => node.focus());
  await expect(out(page, "report-caret")).toHaveText("8");
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  await frames(page);
  await expectClosed(input, content);

  // The same during Enter's caret resample: the blur's null caret and closed list stand, and Enter,
  // with no highlight at its arrival, still searches (the synthetic key submits nothing).
  await caretAt(input, 6);
  await frames(page);
  await script(page, "report-blur-at-8");

  const counts = await enterCounts(page);
  const searched = await input.evaluate((node: HTMLInputElement) => {
    node.setSelectionRange(8, 8);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

    node.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(searched).toBe(false);
  await expect(page.getByTestId("report-after")).toBeFocused();
  await frames(page);
  expect(await enterCounts(page)).toEqual({ ...counts, searches: counts.searches + 1 });
  await expect(out(page, "report-caret")).toHaveText("null");
  await expect(out(page, "report-open")).toHaveText("false");

  // Touching tokens `ab` [0, 2) and `cd` [2, 4) at caret 2: the invalid one, in both orders.
  const touching = page.getByTestId("touching-input");

  await caretAt(touching, 2);
  await expect(out(page, "touching-token")).toHaveText("0-2");
  await script(page, "touching-swap");
  await expect(out(page, "touching-token")).toHaveText("2-4");
});

test("QF7: closed ArrowDown, ArrowUp and Alt+ArrowDown open on the first, last or no row with current rows, else stay native; the open list moves without wrapping, ten per page; Alt+ArrowUp, Escape and Tab close; a lapsed highlight moves from the start", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "report");

  // Rows: `status:` values for `report staus:open status:`.
  await caretAt(input);
  await page.keyboard.type(" status:");
  await expectRows(input, content);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  await expect(input).toBeFocused();
  // Closed with current rows: Content isn't aria-hidden; inert while closed.
  await expect(content).not.toHaveAttribute("aria-hidden", /.*/);

  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await expectHighlighted(input, row(0));
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(1));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(2));
  await page.keyboard.press("PageUp");
  await expectHighlighted(input, row(0));
  await page.keyboard.press("PageDown");
  await expectHighlighted(input, row(2));
  await page.keyboard.press("Alt+ArrowUp");
  await expectClosed(input, content);

  await page.keyboard.press("ArrowUp");
  await expectHighlighted(input, row(2));
  await page.keyboard.press("Escape");
  await expectClosed(input, content);
  expect(await offsets(input)).toEqual([25, 25]);

  await page.keyboard.press("Alt+ArrowDown");
  await expectRows(input, content);
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);

  // Home, End, Left and Right stay native; the caret move re-targets the rows.
  await page.keyboard.press("Home");
  await expect(out(page, "report-caret")).toHaveText("0");
  await page.keyboard.press("End");
  await expect(out(page, "report-caret")).toHaveText("25");
  await page.keyboard.press("Tab");
  await expect(input).not.toBeFocused();
  await expectClosed(input, content);

  // Ignored: Ctrl and Meta, and composing keys.
  await caretAt(input);
  await page.keyboard.press("Control+ArrowDown");
  await frames(page);
  await expectClosed(input, content);
  await input.evaluate((node) =>
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", isComposing: true, bubbles: true }),
    ),
  );
  await frames(page);
  await expectClosed(input, content);

  // Without current rows the arrows stay native: the free word `zebra` has none.
  await page.keyboard.type(" zebra");
  await expectClosed(input, content);
  await page.keyboard.press("ArrowUp");
  await frames(page);
  await expectClosed(input, content);
  await expect(out(page, "report-caret")).toHaveText("0");
});

test("QF7 QF23: a highlight whose row a same-stamp reply replaced lapses: ArrowDown starts from the first current row, and Enter is consumed once", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "late");

  await caretAt(input);
  await page.keyboard.type("by:");
  await expect(out(page, "late-pending")).toHaveText("1");
  await script(page, "late-deliver");
  await expectRows(input, content);
  await expect(row(0)).toHaveText("Alice");
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));

  // Alex and Bob at the same stamp: row 0 now shows Alex, another object.
  await script(page, "late-replace");
  await expect(row(0)).toHaveText("Alex");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));

  await script(page, "late-replace");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(out(page, "late-searches")).toHaveText("0");
  await expect(out(page, "late-query")).toHaveText("report by:");
  await page.keyboard.press("Enter");
  await expect(out(page, "late-searches")).toHaveText("1");

  // The same lapse while Shown, then the layer's committed outside dismissal: the dismissal resets
  // the guard, so the first Enter after it searches.
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await expectHighlighted(input, row(0));
  await script(page, "late-replace");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
  await expectRows(input, content);
  await page.getByTestId("late-surface").click();
  await expect(input).toBeFocused();
  await expect.poll(presented(content)).toBe(false);
  await page.keyboard.press("Enter");
  await expect(out(page, "late-searches")).toHaveText("2");
});

test("QF7: the highlight moves in the rows' DOM order at the key, also after a consumer reorders retained rows", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content } = parts(page, "order");
  const row = (label: string) => page.getByTestId(`order-row-${label}`);
  const labels = () =>
    content.evaluate((node) => {
      const texts: string[] = [];

      for (const option of node.querySelectorAll("[role=option]")) {
        texts.push(option.textContent?.trim() ?? "");
      }

      return texts;
    });

  await caretAt(input);
  await expect(row("C")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row("B"));

  const before = {
    a: await row("A").elementHandle(),
    b: await row("B").elementHandle(),
    c: await row("C").elementHandle(),
  };

  await script(page, "order-reverse");
  await expect.poll(labels).toEqual(["C", "B", "A"]);

  // The same row instances, moved.
  for (const [label, handle] of Object.entries(before)) {
    expect(
      await handle?.evaluate(
        (node, testId) =>
          node.isConnected && node === document.querySelector(`[data-testid="${testId}"]`),
        `order-row-${label.toUpperCase()}`,
      ),
    ).toBe(true);
  }

  await expectHighlighted(input, row("B"));
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row("A"));
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expectHighlighted(input, row("C"));
});

test("QF8: Enter picks a highlighted suggestion without search; with none it emits search once, closes and the form submits once", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "report");

  await caretAt(input);
  await page.keyboard.type(" st");
  await expectRows(input, content);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await page.keyboard.press("Enter");
  await expect(out(page, "report-query")).toHaveText("report staus:open status:");
  await expect(out(page, "report-searches")).toHaveText("");
  await expect(out(page, "report-submits")).toHaveText("0");

  // Shown on the value rows with nothing highlighted: Enter searches.
  await expectRows(input, content);
  await page.keyboard.press("Enter");
  await expect(out(page, "report-searches")).toHaveText("report staus:open status:");
  await expect(out(page, "report-submits")).toHaveText("1");
  await expectClosed(input, content);
});

test("QF9: a pick replaces exactly its range through the browser's insertion, one undo step each, without a value write; equal text moves the caret without an edit; a refused or failed insertion changes nothing", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "report");

  await spyValueWrites(input);
  await recordInputs(input);

  // Mid-query: the caret in `staus`, a fix replaces [7, 12).
  await caretAt(input, 12);
  await expect.poll(presented(content)).toBe(true);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await expect(row(0)).toHaveText(/status/);
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("report status:open");
  expect(await offsets(input)).toEqual([13, 13]);
  await expect(out(page, "report-caret")).toHaveText("13");
  expect(await inputTypes(page)).toEqual(["insertText"]);

  // A pointer pick of the Greek-labelled `κατάσταση` inserts `status:`.
  await caretAt(input);
  await page.keyboard.type(" κατ");
  await expectRows(input, content);
  await expect(row(0)).toHaveText(/κατάσταση/);
  await row(0).click();
  await expect(input).toHaveValue("report status:open status:");
  await expect(input).toBeFocused();

  // Undo and redo, one step each; how an engine groups the typing before is its own.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(input).toHaveValue("report status:open κατ");
  await expect(out(page, "report-query")).toHaveText("report status:open κατ");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(input).toHaveValue("report status:open status:");
  await expect(out(page, "report-query")).toHaveText("report status:open status:");

  // `""` over `staus:` deletes it.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("report staus:open");
  await caretAt(input, 0);
  await caretAt(input, 10);
  await expect.poll(presented(content)).toBe(true);
  await page.keyboard.press("ArrowUp");
  await expect(content.locator("[data-active]")).toHaveText(/Αφαίρεση/);

  const before = (await inputTypes(page)).length;

  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("report open");
  expect((await inputTypes(page)).slice(before)).toEqual(["deleteContentBackward"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(input).toHaveValue("report staus:open");

  // Equal text: `sort` over `sort` moves the caret to its end without an edit.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("report sort:submitted-asc");
  await caretAt(input, 9);
  await expect(row(0)).toHaveText(/sort/);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));

  const equalBefore = (await inputTypes(page)).length;

  await page.keyboard.press("Enter");
  expect(await offsets(input)).toEqual([11, 11]);
  await expect(input).toHaveValue("report sort:submitted-asc");
  expect((await inputTypes(page)).length).toBe(equalBefore);
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
  await expect(out(page, "report-caret")).toHaveText("11");
  await expectRows(input, content);
  await page.keyboard.press("Enter");
  await expect(out(page, "report-searches")).toHaveText("report sort:submitted-asc");

  // No value writes across typing, picks, undo and redo.
  expect(await valueWrites(page)).toBe(0);

  // `execCommand` refusing, then reporting success without editing: nothing changes.
  for (const stub of ["false", "true"]) {
    await caretAt(input);
    await page.keyboard.type(" st");
    await expectRows(input, content);
    await page.keyboard.press("ArrowDown");
    await expectHighlighted(input, row(0));
    await input.evaluate((node: HTMLInputElement) =>
      node.setSelectionRange(node.value.length, node.value.length, "backward"),
    );
    await page.evaluate((returns: string) => {
      document.execCommand = () => returns === "true";
    }, stub);

    const value = await input.inputValue();
    const range = await selection(input);

    await page.keyboard.press("Enter");
    await expect(input).toHaveValue(value);
    expect(await selection(input)).toEqual(range);
    await expectRows(input, content);
    await expectHighlighted(input, row(0));
    await page.evaluate(() => {
      Reflect.deleteProperty(document, "execCommand");
    });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
  }

  // Readonly: nothing changes, the list and highlight stay.
  const readonly = parts(page, "readonly");

  await caretAt(readonly.input);
  await expect(readonly.row(0)).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expectRows(readonly.input, readonly.content);
  await expectHighlighted(readonly.input, readonly.row(0));
  await page.keyboard.press("Enter");
  await expect(readonly.input).toHaveValue("report st");
  await expectHighlighted(readonly.input, readonly.row(0));
});

test("QF10: picking a qualifier keeps the list Shown on its values; picking a value closes it", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "report");

  await caretAt(input);
  await page.keyboard.type(" st");
  await expectRows(input, content);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("report staus:open status:");
  await expectRows(input, content);
  await expect(row(0)).toHaveText(/draft/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("report staus:open status:draft");
  await expectClosed(input, content);
});

test("QF11: a request that isn't Shown is retired by Escape, a focus-keeping outside press, a blurring press and a caret move, so a late reply shows nothing; a failed lookup settles and closes; Shown survives a delayed reply without an exit; Escape from Shown runs the exit", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "late");
  const pending = out(page, "late-pending");

  async function request(user: string): Promise<void> {
    await caretAt(input);
    await page.keyboard.press("ControlOrMeta+a");
    // One edit, so exactly one lookup starts.
    await page.keyboard.insertText(`report by:${user}`);
    await expect(pending).toHaveText("1");
    await expect.poll(presented(content)).toBe(false);
  }

  async function nothingAfterDelivery(): Promise<void> {
    await script(page, "late-deliver-all");
    await frames(page);
    await expect.poll(presented(content)).toBe(false);
    await expect(input).toHaveAttribute("aria-expanded", "false");
  }

  // (a) Escape while Pending.
  await request("a");
  await page.keyboard.press("Escape");
  await nothingAfterDelivery();
  await expect(row(0)).toHaveText("Alice");

  // (b) A press on a surface that keeps focus.
  await page.keyboard.press("Backspace");
  await page.keyboard.type("a");
  await expect(pending).toHaveText("1");
  await page.getByTestId("late-surface").click();
  await expect(input).toBeFocused();
  await nothingAfterDelivery();

  // (c) An outside press that blurs.
  await request("c");
  await page.getByTestId("late-outside").click();
  await expect(input).not.toBeFocused();
  await nothingAfterDelivery();

  // (d) A caret move.
  await request("b");
  await page.keyboard.press("ArrowLeft");
  await expect(out(page, "late-caret")).toHaveText("10");
  await script(page, "late-deliver-all");
  await frames(page);
  await expect.poll(presented(content)).toBe(false);

  // (e) A failed current lookup settles as none and closes, with no further key.
  await request("a");
  await script(page, "late-reject");
  await expect(pending).toHaveText("0");
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await expect(out(page, "late-open")).toHaveText("false");

  // (f) Shown, then a character whose reply waits: no exit during the gap, rows on arrival.
  await caretAt(input);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("report by:");
  await expect(pending).toHaveText("1");
  await script(page, "late-deliver");
  await expectRows(input, content);
  await expect(row(2)).toHaveText("Chris");
  await script(page, "late-reset-leaving");
  await page.keyboard.type("b");
  await expect(pending).toHaveText("1");
  await frames(page);
  await expect(out(page, "late-open")).toHaveText("false");
  await script(page, "late-deliver");
  await expectRows(input, content);
  await expect(row(0)).toHaveText("Bob");
  await expect(out(page, "late-leaving")).toHaveText("0");

  // (g) Escape from Shown runs the exit.
  await page.keyboard.press("Escape");
  await expect.poll(presented(content)).toBe(false);
  await expect(out(page, "late-leaving")).not.toHaveText("0");

  // (h) Content unmounted while Shown, a reply, then remounted: it presents. Each change of the
  // last letter is one edit, so exactly one lookup starts.
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.insertText("c");
  await expect(out(page, "late-query")).toHaveText("report by:c");
  await expect(pending).toHaveText("1");
  await script(page, "late-deliver");
  await expectRows(input, content);
  await script(page, "late-toggle-content");
  await expect(content).toHaveCount(0);
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.insertText("a");
  await expect(out(page, "late-query")).toHaveText("report by:a");
  await expect(pending).toHaveText("1");
  await script(page, "late-deliver");
  await script(page, "late-toggle-content");
  await expectRows(input, content);
  await expect(row(0)).toHaveText("Alice");

  // (i) Back to a stamp: the reply for the returning request only.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");
  await expect(pending).toHaveText("1");
  await page.keyboard.press("ArrowLeft");
  await expect(pending).toHaveText("0");
  await page.keyboard.press("ArrowRight");
  await expect(pending).toHaveText("1");
  await script(page, "late-deliver-all");
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await expect(content.locator("[role=option]:not([hidden])")).toHaveCount(3);

  // (j) A stale analysis bound after the current one: no rows, no marks, no pick.
  await script(page, "late-stale");
  await expect.poll(presented(content)).toBe(false);
  await expect(input).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(content.locator("[role=option]:not([hidden])")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(out(page, "late-query")).toHaveText("report by:");
  await script(page, "late-unstale");
});

/** Where the caret's offset lies, in client pixels, on a test mark layer's text. */
async function layerCaretX(page: Page, layer: string, caret: number): Promise<number> {
  return page.getByTestId(layer).evaluate((row, offset) => {
    const text = row.firstChild;
    const range = document.createRange();

    if (text === null) {
      return Number.NaN;
    }

    range.setStart(text, offset);
    range.setEnd(text, offset);

    return range.getBoundingClientRect().left;
  }, caret);
}

async function contentBox(input: Locator): Promise<{ left: number; right: number }> {
  return input.evaluate((node: HTMLInputElement) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const left = rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const right = rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);

    return { left, right };
  });
}

/** Both oracles find the caret inside the input's content box. */
async function expectCaretVisible(page: Page, input: Locator, layer: string): Promise<void> {
  const [caret] = await offsets(input);
  const box = await contentBox(input);
  const x = await layerCaretX(page, layer, caret ?? 0);

  expect(x).toBeGreaterThanOrEqual(box.left - 2);
  expect(x).toBeLessThanOrEqual(box.right + 2);

  // Typing a glyph at a visible caret scrolls by at most one glyph's advance.
  const before = await input.evaluate((node: HTMLInputElement) => node.scrollLeft);

  await page.keyboard.type("·");

  const after = await input.evaluate((node: HTMLInputElement) => node.scrollLeft);
  const advance = await input.evaluate((node: HTMLInputElement) => {
    const style = getComputedStyle(node);
    const canvas = document.createElement("canvas").getContext("2d")!;

    canvas.font = `${style.fontSize} ${style.fontFamily}`;

    // A glyph's advance plus the field's letter spacing, `normal` being none.
    return canvas.measureText("·").width + (parseFloat(style.letterSpacing) || 0);
  });

  expect(Math.abs(after - before)).toBeLessThanOrEqual(advance + 1);
  await page.keyboard.press("ControlOrMeta+z");
}

/**
 * The interior ink difference between the input's own glyphs and the test layer's, in the same
 * color, each painted alone: the summed absolute pixel difference over the summed ink of both,
 * 0 for identical ink and 1 for disjoint. The interior leaves out 12 CSS px at each inline edge,
 * where the layer clips at the padding box and the input at its content box, and the border.
 */
async function inkDifference(
  page: Page,
  input: Locator,
  layer: Locator,
  info: TestInfo,
  name: string,
): Promise<number> {
  const rect = await input.evaluate((node: HTMLInputElement) => {
    const box = node.getBoundingClientRect();
    const border = parseFloat(getComputedStyle(node).borderTopWidth);

    return { x: box.x, y: box.y, width: box.width, height: box.height, border };
  });
  const clip = {
    x: rect.x + 12,
    y: rect.y + rect.border,
    width: rect.width - 24,
    height: rect.height - 2 * rect.border,
  };

  await input.evaluate((node: HTMLInputElement) => {
    node.style.color = "#ffffff";
    node.style.caretColor = "transparent";
  });

  const native = await page.screenshot({ clip });

  await input.evaluate((node: HTMLInputElement) => {
    node.style.color = "transparent";
  });
  await layer.evaluate((node: HTMLElement) => {
    node.style.visibility = "visible";
  });

  const mirror = await page.screenshot({ clip });

  await layer.evaluate((node: HTMLElement) => {
    node.style.visibility = "";
  });
  await input.evaluate((node: HTMLInputElement) => {
    node.style.color = "";
    node.style.caretColor = "";
  });
  await info.attach(`${name}-native.png`, { body: native, contentType: "image/png" });
  await info.attach(`${name}-layer.png`, { body: mirror, contentType: "image/png" });

  return page.evaluate(
    async ({ native, mirror }) => {
      async function pixels(data: string): Promise<ImageData> {
        const image = new Image();

        image.src = `data:image/png;base64,${data}`;
        await image.decode();

        const canvas = document.createElement("canvas");

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext("2d")!;

        context.drawImage(image, 0, 0);

        return context.getImageData(0, 0, canvas.width, canvas.height);
      }

      const [a, b] = await Promise.all([pixels(native), pixels(mirror)]);
      // The fixture paints a uniform dark background behind white glyphs, so the darkest red
      // channel in both captures is the background's; a non-uniform one would dilute the score.
      let background = 255;

      for (let index = 0; index < a.data.length; index += 4) {
        background = Math.min(background, a.data[index], b.data[index]);
      }

      let difference = 0;
      let inkA = 0;
      let inkB = 0;

      for (let index = 0; index < a.data.length; index += 4) {
        const first = a.data[index] - background;
        const second = b.data[index] - background;

        difference += Math.abs(first - second);
        inkA += first;
        inkB += second;
      }

      if (a.width !== b.width || a.height !== b.height || inkA === 0 || inkB === 0) {
        throw new Error("The ink comparison needs two equal captures, both with ink");
      }

      return difference / (inkA + inkB);
    },
    { native: native.toString("base64"), mirror: mirror.toString("base64") },
  );
}

test("QF12: the scroll offset follows the input; its ink matches a layer's at Home and End; a pick beyond either edge reveals its caret inside the content box, after a letter-spaced field's pick too, and undo restores its text and selection in one step", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content } = parts(page, "overflow");
  const marks = page.getByTestId("overflow-marks");
  const scroll = out(page, "overflow-scroll");
  const native = async () =>
    String(await input.evaluate((node: HTMLInputElement) => node.scrollLeft));

  await caretAt(input, 0);
  await page.keyboard.press("End");
  await expect.poll(native).not.toBe("0");
  await expect(scroll).toHaveText(await native());
  expect(await inkDifference(page, input, marks, info, "overflow-end")).toBeLessThanOrEqual(0.03);
  await page.keyboard.press("Home");
  await expect(scroll).toHaveText("0");
  expect(await inkDifference(page, input, marks, info, "overflow-home")).toBeLessThanOrEqual(0.03);

  // A drag selection past the right edge scrolls the input; the offset follows.
  const field = await input.boundingBox();
  const middle = (field?.y ?? 0) + (field?.height ?? 0) / 2;

  await page.mouse.move((field?.x ?? 0) + 16, middle);
  await page.mouse.down();
  await page.mouse.move((field?.x ?? 0) + (field?.width ?? 0) + 40, middle, { steps: 8 });
  await expect.poll(native).not.toBe("0");
  await page.mouse.up();
  await expect(scroll).toHaveText(await native());

  const dragged = await offsets(input);

  expect(dragged[0]).not.toBe(dragged[1]);

  // A pick in a letter-spaced field first: the reveal's shared measuring context must not carry
  // its spacing into the next field's measurement.
  const spaced = parts(page, "spaced");
  const spacedValue = await spaced.input.inputValue();

  await spaced.input.evaluate(
    (node: HTMLInputElement, at: number) => {
      node.focus();
      node.setSelectionRange(at, at);
      node.scrollLeft = 0;
    },
    spacedValue.indexOf("staus") + 3,
  );
  await expect.poll(presented(spaced.content)).toBe(true);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(spaced.input).toHaveValue(spacedValue.replace("staus", "status"));
  await expectCaretVisible(page, spaced.input, "spaced-row");
  await caretAt(input, 0);

  const value = await input.inputValue();
  const right = value.indexOf("staus") + 3;

  // Beyond the right edge: the caret in `staus`, placed by script so the view may stay left.
  await input.evaluate((node: HTMLInputElement, at: number) => {
    node.setSelectionRange(at, at);
    node.scrollLeft = 0;
  }, right);
  await expect.poll(presented(content)).toBe(true);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue(value.replace("staus", "status"));
  await expect(scroll).toHaveText(await native());
  await expectCaretVisible(page, input, "overflow-row");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(input).toHaveValue(value);
  expect(await offsets(input)).toEqual([right - 3, right + 2]);

  // Beyond the left edge: the view at the end, the caret in `sta`.
  await page.keyboard.press("End");
  await expect.poll(native).not.toBe("0");
  await input.evaluate((node: HTMLInputElement) => {
    const end = node.scrollLeft;

    node.setSelectionRange(2, 2);
    node.scrollLeft = end;
  });
  await expect.poll(presented(content)).toBe(true);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue(value.replace("sta:", "status:"));
  await expect(scroll).toHaveText(await native());
  await expectCaretVisible(page, input, "overflow-row");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(input).toHaveValue(value);
  expect(await offsets(input)).toEqual([0, 3]);

  await page.getByTestId("report-after").focus();
  await expect(scroll).toHaveText(await native());
});

test("QF13: during a composition nothing is written, read or presented and keys do nothing; its end is one edit that beats a write made meanwhile, a cancelled one lets the write show, and later edits and undo follow in both engines' orders", async ({
  page,
  browserName,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "report");
  const query = out(page, "report-query");
  const composing = out(page, "report-composing");

  type Step =
    | "start"
    | "end"
    | "trailing"
    | { readonly text: string; readonly composing: boolean }
    | { readonly undo: string }
    | { readonly cancel: string; readonly selection: readonly [number, number] }
    | { readonly select: readonly [number, number] };

  async function events(steps: readonly Step[]): Promise<void> {
    await input.evaluate((node: HTMLInputElement, list: readonly Step[]) => {
      for (const step of list) {
        if (step === "start") {
          node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
        } else if (step === "end") {
          node.dispatchEvent(
            new CompositionEvent("compositionend", { bubbles: true, data: node.value }),
          );
        } else if (step === "trailing") {
          node.dispatchEvent(
            new InputEvent("input", { bubbles: true, inputType: "insertCompositionText" }),
          );
        } else if ("cancel" in step) {
          // The preedit removed, the text as it was, the selection elsewhere: no `input`.
          node.value = step.cancel;
          node.setSelectionRange(step.selection[0], step.selection[1]);
        } else if ("select" in step) {
          node.setSelectionRange(step.select[0], step.select[1]);
        } else if ("undo" in step) {
          node.dispatchEvent(
            new InputEvent("beforeinput", { bubbles: true, inputType: "historyUndo" }),
          );
          node.value = step.undo;
          node.setSelectionRange(step.undo.length, step.undo.length);
          node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "historyUndo" }));
        } else {
          node.value = step.text;
          node.setSelectionRange(step.text.length, step.text.length);
          node.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              isComposing: step.composing,
              inputType: "insertCompositionText",
            }),
          );
        }
      }
    }, steps);
  }

  const base = "report staus:open ";

  for (const order of ["chromium", "firefox"] as const) {
    await caretAt(input);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(base);
    await script(page, "report-reset-log");

    // Preedit: nothing written or read; keys, picks and presentation held.
    await events([
      "start",
      { text: `${base}υ`, composing: true },
      { text: `${base}υπ`, composing: true },
    ]);
    await expect(composing).toHaveText("true");
    await expect(query).toHaveText(base);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await frames(page);
    await expect.poll(presented(content)).toBe(false);
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
    expect(await tasks(page)).toEqual([]);
    await expect(out(page, "report-searches")).toHaveText("");

    // A write meanwhile, then the commit: the commit wins, as one edit.
    await script(page, "report-write-long");
    await frames(page);
    await expect(input).toHaveValue(`${base}υπ`);

    if (order === "chromium") {
      await events([{ text: `${base}υπο`, composing: true }, "end"]);
    } else {
      await events([{ text: `${base}υπο`, composing: true }, "end", "trailing"]);
    }

    await expect(composing).toHaveText("false");
    await expect(query).toHaveText(`${base}υπο`);
    await frames(page);
    await expect(input).toHaveValue(`${base}υπο`);

    let edits = 0;

    for (const group of await tasks(page)) {
      for (const entry of group) {
        if (entry.startsWith("q:")) {
          edits += 1;
        }
      }
    }

    expect(edits).toBe(1);

    // Commit → x → undo → undo: the query follows each step; the composition's undo is simulated.
    await page.keyboard.type("x");
    await expect(query).toHaveText(`${base}υποx`);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(query).toHaveText(`${base}υπο`);
    await expect(input).toHaveValue(`${base}υπο`);
    await events([{ undo: base }]);
    await expect(query).toHaveText(base);
    await frames(page);
    await expect(input).toHaveValue(base);

    // A write, then a cancelled composition with a trailing input: the write shows.
    await events(["start", { text: `${base}υ`, composing: true }]);
    await script(page, "report-write-long");
    await events([{ text: base, composing: true }, "end", "trailing"]);
    await expect(query).toHaveText("report status:approved by:@me");
    await expect(input).toHaveValue("report status:approved by:@me");
  }

  // A cancelled composition that leaves the text but not the caret: the caret is read in the
  // end's task, with no edit and no request, for a collapsed caret and for a range. The same task
  // then moves the selection again, so the queued `selectionchange`s report only that later caret.
  await caretAt(input);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(base);
  await page.keyboard.press("Escape");
  await expect(out(page, "report-open")).toHaveText("false");
  await script(page, "report-reset-log");
  await events(["start", { text: `${base}υ`, composing: true }]);
  await events([{ cancel: base, selection: [3, 3] }, "end", { select: [4, 4] }]);
  await expect(composing).toHaveText("false");
  await expect.poll(() => tasks(page)).toEqual([["c:3"], ["c:4"]]);
  await expect(query).toHaveText(base);
  await frames(page);
  await expect(out(page, "report-open")).toHaveText("false");
  await script(page, "report-reset-log");
  await events(["start", { text: `${base}υ`, composing: true }]);
  await events([{ cancel: base, selection: [2, 5] }, "end", { select: [6, 6] }]);
  await expect.poll(() => tasks(page)).toEqual([["c:null"], ["c:6"]]);
  await expect(out(page, "report-open")).toHaveText("false");

  // During a composition no suggestion is current, so no row presents, and a row kept mounted
  // across the preedit records no press: its click after the end picks nothing.
  await caretAt(input);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("report st");
  await expectRows(input, content);
  await script(page, "report-keep-stale");

  const kept = page.getByTestId("report-stale");

  await expect(kept).toBeVisible();
  await events(["start"]);
  await expect(row(0)).toHaveCount(0);
  await expect(kept).toBeHidden();
  await expect.poll(presented(content)).toBe(false);
  await kept.dispatchEvent("pointerdown", { isPrimary: true, button: 0 });
  await events(["end"]);
  await expectRows(input, content);
  await expect(kept).toBeVisible();
  await kept.dispatchEvent("click");
  await frames(page);
  await expect(input).toHaveValue("report st");
  await script(page, "report-clear-stale");

  if (browserName !== "chromium") {
    return;
  }

  // A native composition through CDP, with the browser's own history.
  const cdp = await page.context().newCDPSession(page);

  await caretAt(input);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(base);
  await script(page, "report-reset-log");
  await cdp.send("Input.imeSetComposition", { text: "υ", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.imeSetComposition", { text: "υπ", selectionStart: 2, selectionEnd: 2 });
  await expect(composing).toHaveText("true");
  await expect(query).toHaveText(base);
  expect(await tasks(page)).toEqual([]);
  await cdp.send("Input.insertText", { text: "υπο" });
  await expect(composing).toHaveText("false");
  await expect(query).toHaveText(`${base}υπο`);
  await page.keyboard.type("x");
  await expect(query).toHaveText(`${base}υποx`);

  // Native undo groups steps its own way; the query follows the text after each step.
  const follows = async () => (await query.textContent()) === (await input.inputValue());

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(follows).toBe(true);
  await expect(input).toHaveValue(`${base}υπο`);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(follows).toBe(true);
  await expect(input).not.toHaveValue(/υ/);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(base);

  // A cancelled native composition is no edit.
  await cdp.send("Input.imeSetComposition", { text: "υ", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
  await expect(composing).toHaveText("false");
  await expect(query).toHaveText(base);
  await expect(input).toHaveValue(base);
});

test("QF14: the list is a listbox only with current rows: message-only is aria-hidden and collapsed; held rows present once they register; a late Message presents without a key unless dismissed; stale rows are hidden and unpickable; a row outside Content throws", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, message, row } = parts(page, "report");
  const listbox = page.getByRole("listbox", { name: "Αναζήτηση αναφορών" });

  // Closed.
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).toHaveAttribute("aria-controls", (await content.getAttribute("id")) ?? "");
  await expect(content).toHaveAttribute("aria-hidden", "true");
  await expect(content).toHaveAttribute("role", "listbox");

  // Message-only, settled: `zz:` has no fixes.
  await caretAt(input);
  await page.keyboard.type(" zz:");
  await expectMessageOnly(input, content);
  await expect(message).toHaveText("Άγνωστο φίλτρο «zz»");
  expect(await input.ariaSnapshot()).toMatch(/^- combobox "Αναζήτηση αναφορών"/);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);

  // With fixes, highlighted: rows are options described by the message.
  await caretAt(input, 10);
  await expectRows(input, content);
  await expect(message).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await expect(row(0)).toHaveAttribute("role", "option");
  await expect(row(1)).toHaveAttribute("aria-selected", "false");
  await expect(row(0)).toHaveAccessibleDescription("Άγνωστο φίλτρο «staus»");
  await expect(listbox).toBeVisible();

  const snapshot = await content.ariaSnapshot();

  expect(snapshot).toContain('listbox "Αναζήτηση αναφορών"');
  expect(snapshot).toContain('option "status Κατάσταση" [selected]');
  expect(snapshot).not.toContain("Άγνωστο");
  // The mark layer is hidden: the root exposes the combobox and its listbox, no mark text.
  expect(await page.getByTestId("report-root").ariaSnapshot()).not.toMatch(/- text:/);
  await page.keyboard.press("Escape");
  // Closed, with current rows: collapsed, and Content isn't aria-hidden.
  await expectClosed(input, content);
  await expect(content).not.toHaveAttribute("aria-hidden", /.*/);

  // Rows held, Message off, suggestions present: nothing presented, Escape and ArrowDown native.
  await script(page, "report-message-off");
  await script(page, "report-hold-rows");
  await caretAt(input);
  await page.keyboard.type(" st");
  await expect(out(page, "report-suggestions")).toHaveText("1");
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await expect(input).toHaveAttribute("aria-expanded", "false");

  const escape = await input.evaluate((node) => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

    node.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(escape).toBe(false);
  await page.keyboard.press("Backspace");
  await page.keyboard.type("t");

  // Once the rows register, the list presents without a key.
  await script(page, "report-hold-rows");
  await expectRows(input, content);
  await page.keyboard.press("Escape");
  await script(page, "report-message-off");

  // A Message that registers late presents the message for `zz:` without a key.
  await script(page, "report-hold-message");
  await caretAt(input);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("report zz:");
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await script(page, "report-hold-message");
  await expectMessageOnly(input, content);

  // …but not when Escape dismissed the request while the Message was held.
  await page.keyboard.press("Escape");
  await expect.poll(presented(content)).toBe(false);
  await script(page, "report-hold-message");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(":");
  await expect(out(page, "report-open")).toHaveText("false");
  await page.keyboard.press("Escape");
  await script(page, "report-hold-message");
  await expect(message).toHaveCount(1);
  await frames(page);
  await expect.poll(presented(content)).toBe(false);

  // A kept stale row and a kept Message beside current rows: the row is hidden, out of the
  // listbox and unpickable; the Message is hidden outside an invalid token.
  await script(page, "report-keep-message");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("report st");
  await expectRows(input, content);
  await expect(message).toHaveAttribute("hidden", "");
  await expect(message).toBeHidden();
  await script(page, "report-keep-stale");
  await expect(page.getByTestId("report-stale")).toBeVisible();
  await page.keyboard.type("a");
  await expectRows(input, content);
  await expect(page.getByTestId("report-stale")).toHaveAttribute("hidden", "");
  await expect(page.getByTestId("report-stale")).toBeHidden();
  await expect(message).toBeHidden();

  const options: string[] = [];

  for (const line of (await content.ariaSnapshot()).split("\n")) {
    const option = /^\s*- option "([^"]*)"/.exec(line);

    if (option !== null) {
      options.push(option[1]);
    }
  }

  expect(options).toEqual(["status κατάσταση"]);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await page
    .getByTestId("report-stale")
    .dispatchEvent("pointerdown", { isPrimary: true, button: 0 });
  await page.getByTestId("report-stale").dispatchEvent("click");
  await expect(input).toHaveValue("report sta");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("report status:");
  await script(page, "report-clear-stale");
  await script(page, "report-keep-message");

  // A Suggestion outside Content throws at construction, and so do a Suggestion and a Message in
  // an inner query field without Content, inside another query field's Content.
  await page.getByTestId("stray-mount").click();
  await expect(out(page, "stray-result")).toHaveText(
    "ogQueryFieldSuggestion must be inside ogQueryFieldContent.",
  );
  await script(page, "stray-nested-suggestion");
  await expect(out(page, "stray-result")).toHaveText(
    "nested-suggestion:ogQueryFieldSuggestion must be inside ogQueryFieldContent.",
  );
  await script(page, "stray-nested-message");
  await expect(out(page, "stray-result")).toHaveText(
    "nested-message:ogQueryFieldMessage must be inside ogQueryFieldContent.",
  );
});

test("QF15: the input's description names the Field's Descriptions, its Errors, then the token errors while invalid; aria-invalid follows tokens only; a static description is the fallback outside a Field", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const field = page.getByTestId("field-input");
  const errors = page.getByTestId("field-errors");

  await expect(page.getByTestId("field-label")).toHaveAttribute(
    "for",
    (await field.getAttribute("id")) ?? "",
  );
  await expect(field).toHaveAccessibleName("Αναφορές");
  await expect(field).toHaveAccessibleDescription("Φίλτρα όπως status:submitted");
  await expect(field).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(field).toHaveAttribute("aria-required", "true");

  // A Field Error with valid tokens: described, not invalid.
  await script(page, "field-toggle-error");
  await expect(field).toHaveAccessibleDescription(
    "Φίλτρα όπως status:submitted Η αναζήτηση απέτυχε",
  );
  await expect(field).not.toHaveAttribute("aria-invalid", /.*/);

  // Invalid tokens and the Field Error.
  await caretAt(field);
  await page.keyboard.type(" staus:x");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription(
    "Φίλτρα όπως status:submitted Η αναζήτηση απέτυχε Άγνωστο φίλτρο «staus»",
  );
  await expect(errors).toBeHidden();

  // Invalid tokens without the Field Error.
  await script(page, "field-toggle-error");
  await expect(field).toHaveAccessibleDescription(
    "Φίλτρα όπως status:submitted Άγνωστο φίλτρο «staus»",
  );
  await expect(field).toHaveAttribute("aria-required", "true");

  // Standalone: the static description until a token is invalid, then the errors.
  const standalone = page.getByTestId("static-input");

  await expect(standalone).toHaveAccessibleDescription("Πληκτρολογήστε φίλτρα");
  await expect(standalone).not.toHaveAttribute("aria-invalid", /.*/);
  await expect(standalone).toHaveAttribute("aria-required", "true");
  await caretAt(standalone);
  await page.keyboard.type(" zz:");
  await expect(standalone).toHaveAttribute("aria-invalid", "true");
  await expect(standalone).toHaveAccessibleDescription("Άγνωστο φίλτρο «zz»");
});

test("QF16: in a modal Dialog the first Escape closes only the list, keeping focus and caret, the second the Dialog; Escape while Pending, with Content unmounted, or while participation just lapsed clears the request without stealing the Dialog's Escape wrongly; an inside press closes only the list", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, row } = parts(page, "dialog");
  const content = page.getByTestId("dialog-list");
  const dialog = page.getByTestId("dialog-content");
  const open = out(page, "dialog-open");

  /** Moves the caret into `staus` from `report`: a movement, so it opens even after a refocus. */
  async function intoInvalid(): Promise<void> {
    await caretAt(input, 0);
    await caretAt(input, 10);
  }

  async function openDialog(): Promise<void> {
    await page.getByTestId("dialog-trigger").click();
    await expect(open).toHaveText("true");
    await expect(page.getByTestId("dialog-toggle-content")).toBeFocused();
  }

  // Shown + Escape twice.
  await openDialog();
  await intoInvalid();
  await expectRows(input, content);
  await page.keyboard.press("Escape");
  await expect.poll(presented(content)).toBe(false);
  await expect(open).toHaveText("true");
  await expect(input).toBeFocused();
  expect(await offsets(input)).toEqual([10, 10]);
  await page.keyboard.press("Escape");
  await expect(open).toHaveText("false");

  // Pending (requested without Content) + Escape: the request clears and the Dialog closes.
  await openDialog();
  await script(page, "dialog-toggle-content");
  await intoInvalid();
  await frames(page);
  await expect(content).toHaveCount(0);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await expect(open).toHaveText("false");
  await script(page, "dialog-toggle-content");

  // Shown, then Content unmounted (Pending) + Escape: the Dialog closes.
  await openDialog();
  await intoInvalid();
  await expectRows(input, content);
  await script(page, "dialog-toggle-content");
  await expect(content).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(open).toHaveText("false");
  await script(page, "dialog-toggle-content");

  // Shown with one current row and no Message; in one task the caret moves natively, its
  // selection reaches the field (the live gate is false while participation is still committed)
  // and Escape arrives: the list closes, the Dialog stays; a second Escape closes the Dialog.
  await openDialog();
  await caretAt(input);
  await page.keyboard.type(" st");
  await expectRows(input, content);
  await expect(row(1)).toHaveCount(0);

  const transient = await input.evaluate((node: HTMLInputElement) => {
    node.setSelectionRange(1, 1);
    node.dispatchEvent(new Event("selectionchange"));

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

    node.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(transient).toBe(true);
  await expect.poll(presented(content)).toBe(false);
  await expect(open).toHaveText("true");
  await page.keyboard.press("Escape");
  await expect(open).toHaveText("false");

  // A press inside the Dialog closes only the list.
  await openDialog();
  await intoInvalid();
  await expectRows(input, content);
  await page.getByTestId("dialog-inside").click();
  await expect.poll(presented(content)).toBe(false);
  await expect(open).toHaveText("true");
  await expect(dialog).toBeVisible();

  // A focus-keeping press whose own task first moves the caret out of the rows (live gate false,
  // participation committed): the layer's outside dismissal closes the list only, for good.
  await intoInvalid();
  await expectRows(input, content);
  await page.evaluate(() => {
    const field = document.querySelector<HTMLInputElement>('[data-testid="dialog-input"]')!;

    window.addEventListener(
      "pointerdown",
      () => {
        field.setSelectionRange(1, 1);
        field.dispatchEvent(new Event("selectionchange"));
      },
      { capture: true, once: true },
    );
  });
  await page.getByTestId("dialog-surface").click();
  await expect(input).toBeFocused();
  await expect.poll(presented(content)).toBe(false);
  expect(await offsets(input)).toEqual([1, 1]);
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await expect(open).toHaveText("true");

  // A loading interval suppresses a Shown list at an unchanged caret, so the request stays; a
  // focus-keeping press outside dismisses it, and the rows that return at that caret stay closed.
  await caretAt(input);
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await script(page, "dialog-loading");
  await expect.poll(presented(content)).toBe(false);
  await page.getByTestId("dialog-surface").click();
  await expect(input).toBeFocused();
  await script(page, "dialog-loading");
  await expect(row(0)).toBeAttached();
  await frames(page);
  await frames(page);
  await expectClosed(input, content);
  await expect(open).toHaveText("true");

  // A caret moved into another invalid token just before Escape: the first Escape closes only the
  // list, and the movement's late notification can't reopen it.
  await caretAt(input);
  await page.keyboard.type(" zz:");
  // The analysis binding refreshes before the caret moves: stale tokens open nothing.
  await frames(page);
  await intoInvalid();
  await expectRows(input, content);

  const queued = await input.evaluate((node: HTMLInputElement) => {
    node.setSelectionRange(node.value.length, node.value.length);

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

    node.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(queued).toBe(true);
  await expect.poll(presented(content)).toBe(false);
  await frames(page);
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await expect(open).toHaveText("true");

  const end = (await input.inputValue()).length;

  expect(await offsets(input)).toEqual([end, end]);
  await page.keyboard.press("Escape");
  await expect(open).toHaveText("false");

  // With a Message always mounted: a focus at rest 0, which every engine reads as `[0, 0]`, then
  // in its task a move into `staus` and Escape, before the focus's read settled. The list was
  // Closed, so Escape clears what that read requested and closes the Dialog.
  await openDialog();
  await script(page, "dialog-keep-message");
  await caretAt(input, 0);
  await page.getByTestId("dialog-toggle-content").focus();
  await input.evaluate((node: HTMLInputElement) => {
    node.focus();
    node.setSelectionRange(10, 10);
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  await expect(open).toHaveText("false");
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await script(page, "dialog-keep-message");
});

test("QF17: hover highlights without scrolling; a click picks with focus kept; a press in Content keeps focus; an outside press closes; a click on a row whose Content was unmounted mid-press picks nothing", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "report");

  await caretAt(input, 10);
  await expectRows(input, content);
  await row(1).hover();
  await expectHighlighted(input, row(1));
  await content.click({ position: { x: 2, y: 2 } });
  await expect(input).toBeFocused();
  await expectRows(input, content);
  await row(0).click();
  await expect(input).toHaveValue("report status:open");
  await expect(input).toBeFocused();

  // An outside press closes.
  await caretAt(input);
  await page.keyboard.type(" st");
  await expectRows(input, content);
  await out(page, "report-query").click();
  await expectClosed(input, content);

  // Script refocus at the offset the blur left: the focus read alone gives current rows.
  await expect(input).toHaveValue("report status:open st");
  expect(await offsets(input)).toEqual([21, 21]);
  await caretAt(input);
  await expect(out(page, "report-caret")).toHaveText("21");
  await expect(out(page, "report-suggestions")).not.toHaveText("0");

  // Content unmounted mid-press: remounted rows pick nothing from that press.
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);

  const box = await row(0).boundingBox();

  await page.mouse.move((box?.x ?? 0) + 4, (box?.y ?? 0) + 4);
  await page.mouse.down();
  await script(page, "report-toggle-content");
  await expect(content).toHaveCount(0);
  await script(page, "report-toggle-content");
  await expect(row(0)).toHaveCount(1);
  await page.mouse.up();
  await frames(page);
  await expect(input).toHaveValue("report status:open st");

  // A cancelled press, then a click with no press of its own, picks nothing; so does a press
  // released outside its row, then a synthetic click.
  await expectRows(input, content);
  await page.evaluate(() => {
    const record = window as unknown as { pointerIds: number[] };

    record.pointerIds = [];
    document.addEventListener(
      "pointerdown",
      (event) => {
        record.pointerIds.push(event.pointerId);
      },
      { capture: true },
    );
  });

  const rowBox = await row(0).boundingBox();

  await page.mouse.move((rowBox?.x ?? 0) + 4, (rowBox?.y ?? 0) + 4);
  await page.mouse.down();
  await row(0).evaluate((node) => {
    const ids = (window as unknown as { pointerIds: number[] }).pointerIds;

    node.dispatchEvent(new PointerEvent("pointercancel", { pointerId: ids.at(-1), bubbles: true }));
  });
  await page.mouse.up();
  await row(0).evaluate((node: HTMLElement) => node.click());
  await frames(page);
  await expect(input).toHaveValue("report status:open st");
  await expectRows(input, content);
  await page.mouse.move((rowBox?.x ?? 0) + 4, (rowBox?.y ?? 0) + 4);
  await page.mouse.down();
  await content.hover({ position: { x: 2, y: 2 } });
  await page.mouse.up();
  await row(0).evaluate((node: HTMLElement) => node.click());
  await frames(page);
  await expect(input).toHaveValue("report status:open st");
  await expect(input).toBeFocused();

  // A press on a row that stays mounted across an Input swap belongs to the old Input: after the
  // new one shows the same suggestion object, its release picks nothing.
  const composer = page.getByTestId("composer-input");
  const composerContent = page.getByTestId("composer-content");
  const kept = page.getByTestId("composer-kept");

  await caretAt(composer, 10);
  await expectRows(composer, composerContent);
  await script(page, "composer-keep");
  await expect(kept).toBeVisible();

  const keptBox = await kept.boundingBox();

  await page.mouse.move((keptBox?.x ?? 0) + 4, (keptBox?.y ?? 0) + 4);
  await page.mouse.down();
  await script(page, "composer-swap");

  const swapped = page.getByTestId("composer-swap-input");

  await expect(swapped).toBeVisible();
  await expect(kept).toBeHidden();
  await caretAt(swapped, 10);
  await expectRows(swapped, composerContent);
  await expect(kept).toBeVisible();

  // Release over the same row, wherever the reopened list put it.
  const keptAgain = await kept.boundingBox();

  await page.mouse.move((keptAgain?.x ?? 0) + 4, (keptAgain?.y ?? 0) + 4);
  await page.mouse.up();
  await frames(page);
  await expect(swapped).toHaveValue("report staus:open");
});

test("QF18: the list sits at the input's start edge after its gap, follows the input's move and resize, and keyboard moves scroll the list's own box, never the page", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content, row } = parts(page, "many");
  const root = page.getByTestId("many-root");

  async function placement(): Promise<{ dx: number; dy: number; width: number }> {
    const inputBox = await input.boundingBox();
    const contentBox = await content.boundingBox();

    return {
      dx: Math.round((contentBox?.x ?? 0) - (inputBox?.x ?? 0)),
      dy: Math.round((contentBox?.y ?? 0) - ((inputBox?.y ?? 0) + (inputBox?.height ?? 0))),
      width: Math.round((contentBox?.width ?? 0) - (inputBox?.width ?? 0)),
    };
  }

  // Room below the input, so the list keeps its requested side.
  await root.evaluate((node: HTMLElement) => node.scrollIntoView({ block: "start" }));
  await caretAt(input);
  await expect(page.getByTestId("many-row-0")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await expect.poll(placement).toEqual({ dx: 0, dy: 4, width: 0 });

  await root.evaluate((node: HTMLElement) => {
    node.style.marginInlineStart = "24px";
    node.style.inlineSize = "520px";
  });
  await expect.poll(placement).toEqual({ dx: 0, dy: 4, width: 0 });

  const pageScroll = await page.evaluate(() => window.scrollY);

  for (let step = 0; step < 15; step += 1) {
    await page.keyboard.press("ArrowDown");
  }

  await expectHighlighted(input, row(15));
  await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);

  const rowBox = await row(15).boundingBox();
  const listBox = await content.boundingBox();

  expect(rowBox?.y ?? 0).toBeGreaterThanOrEqual(listBox?.y ?? 0);
  expect((rowBox?.y ?? 0) + (rowBox?.height ?? 0)).toBeLessThanOrEqual(
    (listBox?.y ?? 0) + (listBox?.height ?? 0) + 1,
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
});

test("QF19: a query written from outside shows after render on a pristine or edited input, Closed, Pending or Shown, with one value write and the request cleared; a focused input's caret moves to the end; equal writes do nothing; the value attribute never changes; a write during a composition waits for its end", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content } = parts(page, "report");
  const caret = out(page, "report-caret");

  // Pristine, unfocused, closed.
  await spyValueWrites(input);
  await script(page, "report-write-long");
  await expect(input).toHaveValue("report status:approved by:@me");
  expect(await valueWrites(page)).toBe(1);
  await expect(input).toHaveAttribute("value", "report staus:open");
  await script(page, "report-write-same");
  await frames(page);
  expect(await valueWrites(page)).toBe(1);

  // Focused: the caret moves to the end and is reported.
  await caretAt(input, 2);
  await expect(caret).toHaveText("2");
  await script(page, "report-write-short");
  await expect(input).toHaveValue("r");
  expect(await valueWrites(page)).toBe(2);
  await expect(caret).toHaveText("1");
  expect(await offsets(input)).toEqual([1, 1]);

  // Shown, then written: the request clears.
  await page.keyboard.type("eport st");
  await expectRows(input, content);
  await script(page, "report-write-long");
  await expectClosed(input, content);
  await expect(input).toHaveValue("report status:approved by:@me");
  await expect(caret).toHaveText("29");

  // Pending (rows held), then written: nothing presents once rows return.
  await script(page, "report-message-off");
  await script(page, "report-hold-rows");
  await page.keyboard.type(" st");
  await frames(page);
  await script(page, "report-write-long");
  await script(page, "report-hold-rows");
  await frames(page);
  await expectClosed(input, content);
  await script(page, "report-message-off");

  // Shortened below the held caret: no error, the caret resampled to the new end.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("report by:alice");
  await expect(caret).toHaveText("15");

  const writes = await valueWrites(page);

  await script(page, "report-write-short");
  await expect(input).toHaveValue("r");
  await expect(caret).toHaveText("1");
  expect(await valueWrites(page)).toBe(writes + 1);

  // A write from queryChange shows after render.
  await script(page, "report-rewrite");
  await page.keyboard.type("EPORT");
  await expect(input).toHaveValue("report");
  await expect(out(page, "report-query")).toHaveText("report");
  await script(page, "report-rewrite");

  // During a composition: held until its end, where the composition's edit wins.
  await input.evaluate((node: HTMLInputElement) => {
    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    node.value = "reportυ";
    node.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
  });
  await script(page, "report-write-short");
  await frames(page);
  await expect(input).toHaveValue("reportυ");
  await input.evaluate((node: HTMLInputElement) => {
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "υ" }));
  });
  await expect(out(page, "report-query")).toHaveText("reportυ");
  await frames(page);
  await expect(input).toHaveValue("reportυ");
  await expect(input).toHaveAttribute("value", "report staus:open");

  // The async consumer, shortened below its held caret while a lookup is pending: no lookup ever
  // runs with a caret past its query, the pending one is dropped, one write shows the text and
  // the caret is resampled at its end.
  const late = parts(page, "late");
  const lookups = async () => {
    const text = (await out(page, "late-lookups").textContent()) ?? "";
    const entries: [string, number][] = [];

    for (const entry of text.split(",")) {
      const at = entry.lastIndexOf("@");

      if (at > 0) {
        entries.push([entry.slice(0, at), Number(entry.slice(at + 1))]);
      }
    }

    return entries;
  };
  const fits = async () => {
    for (const [query, caret] of await lookups()) {
      if (caret > query.length) {
        return false;
      }
    }

    return true;
  };

  await spyValueWrites(late.input);
  await caretAt(late.input);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("report by:alice");
  await expect(out(page, "late-pending")).toHaveText("1");
  expect((await lookups()).at(-1)).toEqual(["report by:alice", 15]);
  await script(page, "late-write-short");
  await expect(late.input).toHaveValue("r");
  await expect(out(page, "late-caret")).toHaveText("1");
  await expect(out(page, "late-pending")).toHaveText("0");
  expect(await valueWrites(page)).toBe(1);
  expect(await fits()).toBe(true);

  // The same write during a composition that ends unchanged: held, then one write at its end.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("report by:alice");
  await expect(out(page, "late-pending")).toHaveText("1");
  // The preedit text is set past the spy: only the field's writes are counted.
  await late.input.evaluate((node: HTMLInputElement) => {
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;

    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    native.set!.call(node, "report by:aliceυ");
    node.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
  });
  await script(page, "late-write-short");
  await frames(page);
  await expect(late.input).toHaveValue("report by:aliceυ");
  expect(await valueWrites(page)).toBe(1);
  await late.input.evaluate((node: HTMLInputElement) => {
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;

    native.set!.call(node, "report by:alice");
    node.setSelectionRange(15, 15);
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }));
    node.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertCompositionText" }),
    );
  });
  await expect(late.input).toHaveValue("r");
  await expect(out(page, "late-query")).toHaveText("r");
  await expect(out(page, "late-caret")).toHaveText("1");
  expect(await valueWrites(page)).toBe(2);
  expect(await fits()).toBe(true);
});

test("QF20: disabling closes the list; nothing edits, picks or searches while disabled; enabling doesn't reopen", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input, content } = parts(page, "report");

  await caretAt(input, 10);
  await expectRows(input, content);
  await script(page, "report-disable");
  await expect(input).toBeDisabled();
  await expectClosed(input, content);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(out(page, "report-searches")).toHaveText("");
  await script(page, "report-disable");
  await expect(input).toBeEnabled();
  await frames(page);
  await expectClosed(input, content);
});

test("QF21: composed through hostDirectives, replaced Options drive the field with no fabricated output; replaced IDs reach the Anchor, the Label and aria-controls; State's Observables emit as the outputs; Tooltip rows merge their description; swapping the Input resets what it fed", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const input = page.getByTestId("composer-input");
  const content = page.getByTestId("composer-content");

  await expect(input).toHaveAttribute("id", "composer-input");
  await expect(page.getByTestId("composer-label")).toHaveAttribute("for", "composer-input");
  await expect(input).toHaveAttribute("aria-controls", "composer-content");
  await expect(content).toHaveAttribute("id", "composer-content");
  await expect(input).toHaveAttribute("aria-invalid", "true");

  await caretAt(input, 10);
  await expectRows(input, content);
  await expect(out(page, "composer-first")).toHaveText("status");
  await expect(out(page, "composer-log")).toHaveText(/caret:10$/);
  await page.keyboard.press("Enter");
  await expect(out(page, "composer-log")).toHaveText(/caret:10,search:report staus:open$/);

  // The State's Observables emitted exactly what the outputs did, in order.
  const outputs = (await out(page, "composer-log").textContent()) ?? "";

  await expect(out(page, "composer-state-log")).toHaveText(outputs.replace(/(^|,)/g, "$1state-"));

  // The factory composer: its own signals drive it, with no fabricated queryChange.
  const factory = page.getByTestId("factory-input");

  await caretAt(factory);
  await page.keyboard.type(" st");
  await expect(out(page, "factory-query")).toHaveText("report staus:open st");
  await expect(out(page, "factory-query-changes")).toHaveText("0");
  await expectRows(factory, page.getByTestId("factory-content"));

  // Tooltip rows: the message and the Tooltip while invalid, the Tooltip alone otherwise.
  const tipped = page.getByTestId("tipped-input");

  await caretAt(tipped, 10);
  await expectRows(tipped, page.getByTestId("tipped-content"));
  await expect(page.getByTestId("tipped-row-0")).toHaveAttribute(
    "aria-describedby",
    `${await page.getByTestId("tipped-message").getAttribute("id")} ${await page.getByTestId("tipped-tip-0").getAttribute("id")}`,
  );
  await page.keyboard.press("End");
  await page.keyboard.type(" st");
  await expect(page.getByTestId("tipped-row-0")).toHaveAttribute(
    "aria-describedby",
    (await page.getByTestId("tipped-tip-0").getAttribute("id")) ?? "",
  );

  // Swapping the focused, Shown Input whose highlight a caret move just retired: the caret, the
  // list, the composition and the one-key lapse reset, so the new Input's first Enter searches.
  await caretAt(input);
  await page.keyboard.type(" st");
  await expectRows(input, content);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, page.getByTestId("composer-row-0"));
  await input.evaluate((node: HTMLInputElement) => node.setSelectionRange(1, 1));
  await expect(out(page, "composer-log")).toHaveText(/caret:1$/);
  await script(page, "composer-swap");

  const swapped = page.getByTestId("composer-swap-input");

  await expect(swapped).toBeVisible();
  await expect(out(page, "composer-log")).toHaveText(/caret:null$/);
  await expect.poll(presented(content)).toBe(false);
  await swapped.focus();
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await page.keyboard.press("Enter");
  await expect(out(page, "composer-log")).toHaveText(/,search:report staus:open st$/);
  await page.keyboard.press("End");
  await expect(page.getByTestId("composer-row-0")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expectRows(swapped, content);

  // A caretChange handler that moves focus away, swaps the Input and focuses the new one while
  // Enter reads the caret: that Enter belonged to the replaced Input, so it emits no search.
  await script(page, "composer-swap");
  await expect(input).toBeVisible();
  await caretAt(input, 6);
  await frames(page);
  await script(page, "composer-swap-at-8");

  const searches = await out(page, "composer-log").textContent();
  const replaced = await input.evaluate((node: HTMLInputElement) => {
    node.setSelectionRange(8, 8);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

    node.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(replaced).toBe(false);
  await expect(swapped).toBeFocused();
  await frames(page);
  // WebKit selects the whole text of an input focused by script for the first time: a range, null.
  await expect(out(page, "composer-log")).toHaveText(/,caret:8,caret:null(?:,caret:0)?$/);
  expect((await out(page, "composer-log").textContent())?.match(/search:/g)).toEqual(
    searches?.match(/search:/g),
  );
});

test("QF22: each malformed analysis or query throws a RangeError naming its field; a zero-width suggestion inserts; a stale analysis marks nothing and offers nothing", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const expected: Record<string, RegExp> = {
    fraction: /token offsets must be integers/,
    reversed: /token must not start after it ends/,
    outside: /token must lie within/,
    "empty-token": /token must not be empty/,
    overlap: /tokens must be in order and must not overlap/,
    "qualifier-start": /qualifier must start at its token's start/,
    "qualifier-empty": /qualifier must not be empty/,
    "error-empty": /error must be a non-empty string/,
    caret: /caret must be null or an integer/,
    "insert-break": /insert must not contain a line break/,
    "query-break": /analysis query must not contain a line break/,
    "root-query-break": /Query field query must not contain a line break/,
  };

  for (const [name, message] of Object.entries(expected)) {
    await page.getByTestId(`validation-${name}`).click();
    await expect(out(page, "validation-result")).toHaveText(new RegExp(`^${name}:RangeError:`));
    await expect(out(page, "validation-result")).toHaveText(message);
  }

  await page.getByTestId("validation-valid").click();
  await expect(out(page, "validation-result")).toHaveText("valid:ok");

  // A zero-width suggestion inserts at the caret.
  const { input, content, row } = parts(page, "report");

  await caretAt(input, 6);
  await script(page, "report-zero-width");
  await expect(row(0)).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("reportby:@me  staus:open");
  await script(page, "report-current-analysis");

  // A stale analysis: one text run, nothing invalid, no rows.
  await script(page, "report-stale-analysis");
  await expect(out(page, "report-segments")).toHaveText("text:reportby:@me  staus:open");
  await expect(input).not.toHaveAttribute("aria-invalid", /.*/);
  await page.keyboard.press("ArrowDown");
  await frames(page);
  await expect.poll(presented(content)).toBe(false);
  await expect(row(0)).toHaveCount(0);
});

test("QF23: activation binds to the suggestion a row showed: a replaced pressed row picks nothing, and a caret moved just before Enter consumes that Enter without search or submit", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const late = parts(page, "late");

  await caretAt(late.input);
  await page.keyboard.type("by:");
  await expect(out(page, "late-pending")).toHaveText("1");
  await script(page, "late-deliver");
  await expectRows(late.input, late.content);

  const box = await late.row(0).boundingBox();

  await page.mouse.move((box?.x ?? 0) + 4, (box?.y ?? 0) + 4);
  await page.mouse.down();
  await script(page, "late-replace");
  await expect(late.row(0)).toHaveText("Alex");
  await page.mouse.up();
  await frames(page);
  await expect(out(page, "late-query")).toHaveText("report by:");

  // Highlight, move the caret natively, Enter: consumed; the next Enter searches and submits.
  const { input, content, row } = parts(page, "report");

  await caretAt(input);
  await page.keyboard.type(" st");
  await expectRows(input, content);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await input.evaluate((node: HTMLInputElement) => node.setSelectionRange(1, 1));
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(out(page, "report-searches")).toHaveText("");
  await expect(out(page, "report-submits")).toHaveText("0");
  await expect(input).toHaveValue("report staus:open st");
  await page.keyboard.press("Enter");
  await expect(out(page, "report-searches")).toHaveText("report staus:open st");
  await expect(out(page, "report-submits")).toHaveText("1");

  // The same with the move and Enter in one task: the key reads the highlight before resampling.
  await page.keyboard.press("End");
  await expect(out(page, "report-suggestions")).toHaveText("1");
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));

  const moved = await input.evaluate((node: HTMLInputElement) => {
    node.setSelectionRange(1, 1);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

    node.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(moved).toBe(true);
  await frames(page);
  await expect(out(page, "report-searches")).toHaveText("report staus:open st");

  // The same with a `caretChange` handler that moves focus away at 8: its blur clears the
  // highlight, and Enter still decides as it arrived: consumed, without a pick, search or submit.
  await page.keyboard.press("End");
  await expect(out(page, "report-suggestions")).toHaveText("1");
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await script(page, "report-blur-at-8");

  const blurred = await input.evaluate((node: HTMLInputElement) => {
    node.setSelectionRange(8, 8);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

    node.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(blurred).toBe(true);
  await expect(page.getByTestId("report-after")).toBeFocused();
  await frames(page);
  await expect(input).toHaveValue("report staus:open st");
  await expect(out(page, "report-searches")).toHaveText("report staus:open st");
  await expect(out(page, "report-submits")).toHaveText("1");
  await input.focus();

  // The same with a handler that moves focus away and back and presses ArrowDown at the end
  // before returning: the outer Enter, which arrived with a presented highlight, is consumed and
  // neither picks nor clears what the new focus made.
  await page.keyboard.press("End");
  await expect(out(page, "report-suggestions")).toHaveText("1");
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await script(page, "report-refocus-at-8");

  const refocused = await input.evaluate((node: HTMLInputElement) => {
    node.setSelectionRange(8, 8);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

    node.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(refocused).toBe(true);
  await expect(input).toBeFocused();
  await frames(page);
  await expect(input).toHaveValue("report staus:open st");
  await expect(out(page, "report-searches")).toHaveText("report staus:open st");
  await expect(out(page, "report-submits")).toHaveText("1");
  await expectRows(input, content);
  await page.keyboard.press("Escape");
  await frames(page);

  // A presented highlight suppressed by a stale analysis, with no key: the next Enter is consumed,
  // the one after searches and submits.
  await page.keyboard.press("End");
  await expect(out(page, "report-suggestions")).toHaveText("1");
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await expectHighlighted(input, row(0));
  await script(page, "report-stale-analysis");
  await expect.poll(presented(content)).toBe(false);
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(out(page, "report-searches")).toHaveText("report staus:open st");
  await expect(out(page, "report-submits")).toHaveText("1");
  await script(page, "report-current-analysis");
  await expectRows(input, content);
  await page.keyboard.press("Enter");
  await expect(out(page, "report-searches")).toHaveText(
    "report staus:open st,report staus:open st",
  );
  await expect(out(page, "report-submits")).toHaveText("2");

  // ArrowDown then Enter before the list presents: the prepared highlight was never seen, so
  // Enter searches and keeps its default.
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await page.keyboard.press("Escape");
  await expectClosed(input, content);

  const early = await input.evaluate((node: HTMLInputElement) => {
    const down = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

    node.dispatchEvent(down);
    node.dispatchEvent(enter);

    return [down.defaultPrevented, enter.defaultPrevented];
  });

  expect(early).toEqual([true, false]);
  await expect(out(page, "report-searches")).toHaveText(
    "report staus:open st,report staus:open st,report staus:open st",
  );
  await frames(page);
  await expectClosed(input, content);

  await recordEnters(page);

  /** Two genuine Enters: the first is consumed, the second searches and submits once. */
  async function consumedThenSearched(query: string): Promise<void> {
    const before = await enterCounts(page);

    await page.keyboard.press("Enter");
    await frames(page);
    expect(await enterCounts(page)).toEqual(before);
    await page.keyboard.press("Enter");
    await expect(out(page, "report-submits")).toHaveText(String(before.submits + 1));
    expect(await enterCounts(page)).toEqual({
      searches: before.searches + 1,
      submits: before.submits + 1,
    });
    await expect(out(page, "report-searches")).toHaveText(new RegExp(`${query}$`));
  }

  // A same-stamp reply settles the highlighted rows to `[]` with no key: the list closes as known
  // empty, the rows were replaced, so the next Enter is consumed.
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await expectHighlighted(input, row(0));
  await script(page, "report-empty-analysis");
  await expectClosed(input, content);
  await consumedThenSearched("report staus:open st");
  expect((await enters(page)).slice(-2)).toEqual([true, false]);
  await script(page, "report-current-analysis");

  // Suppressed after a highlight, then an outside press on a focus-keeping surface: that
  // dismissal resets the guard, so the next Enter searches and submits.
  await page.keyboard.press("End");
  await expect(out(page, "report-suggestions")).toHaveText("1");
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await expectHighlighted(input, row(0));
  await script(page, "report-stale-analysis");
  await expect.poll(presented(content)).toBe(false);
  await page.getByTestId("report-keep-focus").click();
  await expect(input).toBeFocused();

  const pressed = await enterCounts(page);

  await page.keyboard.press("Enter");
  await expect(out(page, "report-submits")).toHaveText(String(pressed.submits + 1));
  expect(await enterCounts(page)).toEqual({
    searches: pressed.searches + 1,
    submits: pressed.submits + 1,
  });
  expect((await enters(page)).at(-1)).toBe(false);
  await script(page, "report-current-analysis");

  // A Shown highlight survives an outside gesture the Popover layer rejects: a down on the
  // focus-keeping surface released over the input, then a down a consumer cancelled. The list
  // stays open, and Enter picks without search or submit.
  const surface = await page.getByTestId("report-keep-focus").boundingBox();
  const field = await input.boundingBox();
  const kept = await enterCounts(page);

  await caretAt(input);
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await expectHighlighted(input, row(0));
  await page.mouse.move((surface?.x ?? 0) + 8, (surface?.y ?? 0) + 8);
  await page.mouse.down();
  await page.mouse.move((field?.x ?? 0) + 8, (field?.y ?? 0) + (field?.height ?? 0) / 2);
  await page.mouse.up();
  await frames(page);
  await expect(input).toBeFocused();
  await expectRows(input, content);
  await expectHighlighted(input, row(0));
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("report staus:open status:");
  expect((await enters(page)).at(-1)).toBe(true);
  await expectRows(input, content);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await page.getByTestId("report-keep-focus").evaluate((node) => {
    node.addEventListener("pointerdown", (event) => event.preventDefault(), { once: true });
  });
  await page.mouse.move((surface?.x ?? 0) + 8, (surface?.y ?? 0) + 8);
  await page.mouse.down();
  await page.mouse.up();
  await frames(page);
  await expect(input).toBeFocused();
  await expectRows(input, content);
  await expectHighlighted(input, row(0));
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue(/^report staus:open status:\S/);
  expect((await enters(page)).at(-1)).toBe(true);
  expect(await enterCounts(page)).toEqual(kept);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("report staus:open st");
  await page.keyboard.press("Escape");
  await frames(page);

  // A close and a reopen in one callback while an outside press is held: the release belongs to
  // the earlier request, so the reopened list stays; a fresh outside click closes it.
  await page.keyboard.press("ArrowDown");
  await expectRows(input, content);
  await page.mouse.move((surface?.x ?? 0) + 8, (surface?.y ?? 0) + 8);
  await page.mouse.down();
  await input.evaluate((node: HTMLInputElement) => {
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    node.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.mouse.up();
  await frames(page);
  await expect(input).toBeFocused();
  await expectRows(input, content);
  await page.mouse.click((surface?.x ?? 0) + 8, (surface?.y ?? 0) + 8);
  await frames(page);
  await expect.poll(presented(content)).toBe(false);

  // Suppressed after a highlight in `staus` at 11, then a query of length 11 written from
  // outside: the caret stays at 11, so only the write itself resets the guard.
  await caretAt(input, 11);
  await expectRows(input, content);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(input, row(0));
  await script(page, "report-stale-analysis");
  await expect.poll(presented(content)).toBe(false);
  await script(page, "report-write-invalid-first");
  await expect(input).toHaveValue("zz:a report");
  expect(await offsets(input)).toEqual([11, 11]);

  const written = await enterCounts(page);

  await page.keyboard.press("Enter");
  await expect(out(page, "report-submits")).toHaveText(String(written.submits + 1));
  await expect(out(page, "report-searches")).toHaveText(/,zz:a report$/);
  expect((await enters(page)).at(-1)).toBe(false);
  await script(page, "report-current-analysis");

  // The factory composer's plain signals replace its rows at the same stamp at once; a selection
  // notification in the same task, before the highlight effect runs, moves the caret: the
  // movement lapses the highlight the user saw, though it was no longer effective.
  const factory = parts(page, "factory");

  await caretAt(factory.input, 10);
  await expectRows(factory.input, factory.content);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(factory.input, factory.row(0));
  await factory.input.evaluate((node: HTMLInputElement) => {
    document.querySelector<HTMLButtonElement>('[data-testid="factory-replace-rows"]')!.click();
    node.setSelectionRange(1, 1);
    node.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.press("Enter");
  await frames(page);
  await expect(out(page, "factory-searches")).toHaveText("0");
  expect((await enters(page)).at(-1)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(out(page, "factory-searches")).toHaveText("1");
  expect((await enters(page)).at(-1)).toBe(false);

  // The rows replaced and PageDown in one task, before the highlight effect runs: that key ends
  // the lapse window, so the effect can't arm it afterwards, and the first Enter searches.
  await caretAt(factory.input, 10);
  await expectRows(factory.input, factory.content);
  await page.keyboard.press("ArrowDown");
  await expectHighlighted(factory.input, factory.row(0));
  await factory.input.evaluate((node: HTMLInputElement) => {
    document.querySelector<HTMLButtonElement>('[data-testid="factory-replace-rows"]')!.click();
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "PageDown", bubbles: true, cancelable: true }),
    );
  });
  await frames(page);
  await expect(factory.input).not.toHaveAttribute("aria-activedescendant", /.*/);
  await page.keyboard.press("Enter");
  await expect(out(page, "factory-searches")).toHaveText("2");
  expect((await enters(page)).at(-1)).toBe(false);
});

test("QF24: in a Dialog, a composing Escape closes neither the list nor the Dialog; after the commit Escape closes only the list", async ({
  page,
}, info) => {
  await fixture(page, "query-field", info);

  const { input } = parts(page, "dialog");
  const content = page.getByTestId("dialog-list");
  const open = out(page, "dialog-open");

  await page.getByTestId("dialog-trigger").click();
  await expect(open).toHaveText("true");
  await expect(page.getByTestId("dialog-toggle-content")).toBeFocused();
  await caretAt(input, 10);
  await expectRows(input, content);
  await input.evaluate((node: HTMLInputElement) => {
    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    node.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    );
  });
  await frames(page);
  await expect(open).toHaveText("true");
  await input.evaluate((node: HTMLInputElement) => {
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }));
  });
  await expectRows(input, content);
  await page.keyboard.press("Escape");
  await expect.poll(presented(content)).toBe(false);
  await expect(open).toHaveText("true");
});
