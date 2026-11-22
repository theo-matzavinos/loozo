// Chromium smoke of the consumer check's production build (consumer.mjs): the prerendered HTML,
// hydration without errors, the button geometry, colors and type, the AlertDialog's, Dialog's and
// Sheet's focus, dismissal, placement and motion, a Signal Forms Field's wiring, errors and
// control styling, Checkbox's, Switch's and RadioGroup's states, keys, layout, nesting and forced
// colors, the Number field's and Slider's server state, geometry, typing, stepping, keys,
// pointer and touch, validation, states and forced colors, and Select's and Combobox's server
// state, geometry, pointer and keys, placement, motion, touch, bound values, states, themes and
// forced colors, and Tabs', Tooltip's and Popover's server state, geometry, keys, pointer and
// hover, guarded unavailable actions, placement and flipping, Tab order, nesting, motion and
// forced colors, Menu's server state, placement, focus highlight and ring, destructive rows,
// checkable and disabled rows, submenu, motion, forced colors and class merging, ScrollArea's, Avatar's and Progress's server state, bounds, scrollbars,
// naming, sizes, loading delay, sweep, dialog recipe, themes, reduced motion and forced colors,
// the OTP field's server state, geometry, typing and paste, masking, autofill paint, validation,
// states and forced colors, Toast's server region, collapsed and expanded deck geometry,
// accessibility tree, immediate keyboard focus, pointer on the peeks, action, Close, kind colors,
// limit, timer and narrow width, Calendar's server state, hydration against another clock,
// geometry, colors, names, keys, pointer, the pending range, the focus ring's pixels, Field
// states, right to left and forced colors, and the File field's server state, geometry, picks and
// sizes, long names, drag and drop, keyboard focus, validation, clearing, states, themes and
// forced colors, and the date fields' and DatePicker's server state, cells that keep their width
// while typing, gaps, looks, popup placement, choosing, Escape in a Dialog, readonly and disabled
// policies and forced colors. Scrolling in Select, Combobox, Menu and Popover content and Dialog
// and Sheet bodies (thumbs, Tab out of an open list, menu or Popover, initial focus, revealing the
// active option or the focused control, and height caps) is consumer-scrolling.mjs's, in every
// engine.
//
// Usage: node tests/consumer-smoke.mjs <app directory>
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";
import { startServer } from "./consumer-server.mjs";

const app = process.argv[2];

assert.ok(app, "Usage: node tests/consumer-smoke.mjs <app directory>");

function openingTag(html, id) {
  const match = new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);

  assert.ok(match, `the server HTML has no element with id "${id}"`);

  return match[0];
}

// The server HTML from an element's opening tag through its first closing tag of the same name.
function element(html, id) {
  const tag = openingTag(html, id);
  const start = html.indexOf(tag);
  const name = /^<([a-z]+)/.exec(tag)[1];

  return html.slice(start, html.indexOf(`</${name}>`, start));
}

const { base, server, ready } = await startServer(app);

let browser;

try {
  const html = await ready;

  // Server rendering: Origami's and fold's host attributes are in the prerendered HTML.
  const md = openingTag(html, "md");
  const disabled = openingTag(html, "disabled");
  const anchor = openingTag(html, "anchor");
  const trigger = openingTag(html, "trigger");
  const content = openingTag(html, "content");
  const cancel = openingTag(html, "cancel");

  assert.match(md, /\btype="button"/);
  assert.match(md, /\bdata-slot="button"/);
  assert.match(md, /\bclass="[^"]*\bh-8\b/);
  assert.match(disabled, /\bdisabled=""/);
  assert.match(disabled, /\bdata-disabled=""/);
  assert.match(anchor, /\bdata-slot="button"/);
  assert.doesNotMatch(anchor, /\btype=/);
  assert.match(trigger, /\bdata-slot="alert-dialog-trigger"/);
  assert.match(trigger, /\baria-expanded="false"/);
  assert.match(trigger, /\baria-controls="content"/);
  assert.match(content, /\brole="alertdialog"/);
  assert.match(content, /\baria-labelledby="title"/);
  assert.match(content, /\bdata-slot="alert-dialog-content"/);
  assert.match(cancel, /\bautofocus=""/);
  assert.match(cancel, /\bdata-slot="alert-dialog-cancel"/);
  assert.match(html, /\bngh="/, "the server HTML carries hydration annotations");

  // Dialog: closed on the server, named by its Title, with the corner close button.
  const dialogContent = openingTag(html, "dialog-content");

  assert.match(dialogContent, /\bdata-slot="dialog-content"/);
  assert.match(dialogContent, /\baria-labelledby="dialog-title"/);
  assert.doesNotMatch(dialogContent, /\sopen[\s=>]/);
  assert.ok(
    html
      .match(/<button\b[^>]*>/g)
      .some(
        (tag) => tag.includes('data-slot="dialog-close"') && tag.includes('aria-label="Close"'),
      ),
    "the server HTML has the labelled close button",
  );

  // The root on the <dialog> itself: closed on the server.
  for (const id of ["note-content", "discard-content"]) {
    assert.doesNotMatch(openingTag(html, id), /\sopen[\s=>]/, `${id} open`);
  }
  // Content's slot wins over the root's on a shared host.
  assert.match(openingTag(html, "note-content"), /\bdata-slot="dialog-content"/);
  assert.match(openingTag(html, "discard-content"), /\bdata-slot="alert-dialog-content"/);

  // Sheet: closed on the server, named by its Title, with the corner close button; on a shared
  // host, closed too, with Content's slot.
  const sheetContent = openingTag(html, "sheet-content");
  const panelContent = openingTag(html, "panel-content");

  assert.match(sheetContent, /\bdata-slot="sheet-content"/);
  assert.match(sheetContent, /\baria-labelledby="sheet-title"/);
  assert.doesNotMatch(sheetContent, /\sopen[\s=>]/);
  assert.doesNotMatch(openingTag(html, "nav-content"), /\sopen[\s=>]/);
  assert.doesNotMatch(panelContent, /\sopen[\s=>]/);
  assert.match(panelContent, /\bdata-slot="sheet-content"/);
  assert.ok(
    html
      .match(/<button\b[^>]*>/g)
      .some((tag) => tag.includes('data-slot="sheet-close"') && tag.includes('aria-label="Close"')),
    "the server HTML has the sheet's labelled close button",
  );

  // Field: the label names the input, the description describes it, and no error shows yet.
  const emailField = openingTag(html, "email-field");
  const emailLabel = openingTag(html, "email-label");
  const email = openingTag(html, "email");

  assert.match(emailField, /\bdata-slot="field"/);
  assert.match(emailField, /\bdata-required=""/);
  assert.doesNotMatch(emailField, /\sdata-invalid=/);
  assert.match(emailLabel, /\bfor="email"/);
  assert.match(emailLabel, /\bdata-slot="field-label"/);
  assert.match(email, /\bdata-slot="input"/);
  assert.match(email, /\baria-describedby="email-description"/);
  assert.doesNotMatch(email, /\saria-invalid=/);
  assert.match(openingTag(html, "email-description"), /\bdata-slot="field-description"/);
  assert.match(openingTag(html, "notes"), /\bdata-slot="textarea"/);
  assert.match(openingTag(html, "account-field"), /\bdata-disabled=""/);
  assert.doesNotMatch(html, /\bid="email-error"/);

  // Checkbox, Switch and RadioGroup: Origami's state attributes and fold's inert markup are in the
  // server HTML, and the labels name what they label.
  const vat = openingTag(html, "vat");

  assert.match(vat, /\baria-checked="true"/);
  assert.match(vat, /\bdata-checked=""/);
  assert.match(vat, /\bdata-slot="checkbox"/);
  assert.match(element(html, "vat"), /<svg\b[^>]*\bdata-slot="checkbox-indicator"/);

  // A select-all parent over a partial selection is mixed on the server, without data-checked.
  const allInvoices = openingTag(html, "all-invoices");

  assert.match(allInvoices, /\baria-checked="mixed"/);
  assert.match(allInvoices, /\bdata-mixed=""/);
  assert.doesNotMatch(allInvoices, /\sdata-checked=/);
  assert.match(element(html, "all-invoices"), /<svg\b[^>]*\bdata-slot="checkbox-mixed-indicator"/);
  assert.match(openingTag(html, "terms"), /\bid="terms"/);
  assert.match(openingTag(html, "terms-label"), /\bfor="terms"/);
  assert.match(openingTag(html, "cycle"), /\baria-labelledby="cycle-label"/);
  assert.equal(
    element(html, "cycle")
      .match(/<button\b[^>]*>/g)
      .filter((tag) => tag.includes('role="radio"') && tag.includes('tabindex="0"')).length,
    1,
    "one cycle tab stop on the server",
  );
  assert.match(openingTag(html, "terms-field"), /\bdata-orientation="horizontal"/);
  assert.match(openingTag(html, "locked"), /\bdisabled=""/);
  assert.match(openingTag(html, "locked"), /\bdata-disabled=""/);
  assert.match(openingTag(html, "frozen"), /\baria-readonly="true"/);
  assert.match(openingTag(html, "tier"), /\baria-readonly="true"/);
  assert.doesNotMatch(openingTag(html, "tier-addon"), /\saria-readonly=/);

  browser = await chromium.launch();

  // Before hydration, the prerendered dialogs are hidden, also with the root on the <dialog>.
  const prerendered = await browser.newPage({ javaScriptEnabled: false });

  await prerendered.goto(base);

  const prerenderedDisplay = await prerendered.evaluate(() => {
    const result = {};

    for (const id of [
      "content",
      "dialog-content",
      "note-content",
      "discard-content",
      "sheet-content",
      "nav-content",
      "panel-content",
    ]) {
      result[id] = getComputedStyle(document.getElementById(id)).display;
    }

    return result;
  });

  assert.deepEqual(prerenderedDisplay, {
    content: "none",
    "dialog-content": "none",
    "note-content": "none",
    "discard-content": "none",
    "sheet-content": "none",
    "nav-content": "none",
    "panel-content": "none",
  });

  // Before hydration, CSS alone draws the controls' server state, and a nested editable group
  // keeps its own look inside a readonly one.
  assert.deepEqual(
    await prerendered.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      const thumbOffset = (id) => {
        const track = document.getElementById(id);

        return (
          track.querySelector("[data-slot=switch-thumb]").getBoundingClientRect().left -
          track.getBoundingClientRect().left
        );
      };

      return {
        fill: style("#vat").backgroundColor,
        glyph: style("#vat > svg").opacity,
        thumbTravel: thumbOffset("frozen") - thumbOffset("renew"),
        outer: style("#tier-standard > [data-slot=radio-group-indicator]").borderTopStyle,
        inner: style("#tier-addon-a > [data-slot=radio-group-indicator]").borderTopStyle,
      };
    }),
    { fill: "rgb(237, 237, 235)", glyph: "1", thumbTravel: 16, outer: "dashed", inner: "solid" },
  );
  await prerendered.close();

  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const errors = [];

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const geometry = await page.evaluate(() => {
    const result = {};

    for (const id of ["sm", "md", "lg", "icon", "merged", "link", "link-sm", "link-lg", "anchor"]) {
      const style = getComputedStyle(document.getElementById(id));

      result[id] = {
        height: style.height,
        width: style.width,
        radius: style.borderTopLeftRadius,
        paddingLeft: style.paddingLeft,
      };
    }

    return result;
  });

  assert.equal(geometry.sm.height, "28px");
  assert.equal(geometry.md.height, "32px");
  assert.equal(geometry.lg.height, "36px");
  assert.equal(geometry.icon.height, "32px");
  assert.equal(geometry.icon.width, "32px");
  assert.equal(geometry.anchor.height, "32px");
  assert.equal(geometry.sm.radius, "8px");
  assert.equal(geometry.md.radius, "10px");
  assert.equal(geometry.lg.radius, "10px");
  assert.equal(geometry.sm.paddingLeft, "10px");
  assert.equal(geometry.md.paddingLeft, "12px");
  assert.equal(geometry.lg.paddingLeft, "16px");
  // A consumer class wins over the size's padding.
  assert.equal(geometry.merged.paddingLeft, "24px");

  // A consumer class wins over fold's radius, and a text size of its own keeps the variant's color.
  const merged = await page.evaluate(() => {
    const radius = getComputedStyle(document.getElementById("merged-radius"));
    const text = getComputedStyle(document.getElementById("merged-text"));

    return { radius: radius.borderTopLeftRadius, color: text.color, fontSize: text.fontSize };
  });

  assert.deepEqual(merged, { radius: "5px", color: "rgb(255, 255, 255)", fontSize: "12px" });

  // fold's text sizes merge with its colors: the filled variants keep white text at every size, the
  // title its size and weight, the description its muted color, in both themes.
  const typography = () =>
    page.evaluate(() => {
      const result = {};

      for (const id of ["sm", "md", "lg", "destructive-sm", "destructive-md", "destructive-lg"]) {
        result[id] = getComputedStyle(document.getElementById(id)).color;
      }

      const title = getComputedStyle(document.getElementById("title"));

      result.title = `${title.fontSize}/${title.fontWeight}`;
      result.description = getComputedStyle(document.getElementById("description")).color;

      return result;
    });
  const white = "rgb(255, 255, 255)";
  const filled = {
    sm: white,
    md: white,
    lg: white,
    "destructive-sm": white,
    "destructive-md": white,
    "destructive-lg": white,
    title: "15px/650",
  };

  assert.deepEqual(await typography(), { ...filled, description: "rgb(163, 163, 160)" }, "dark");

  await page.evaluate(() => document.documentElement.classList.add("light"));
  assert.deepEqual(await typography(), { ...filled, description: "rgb(91, 91, 88)" }, "light");
  await page.evaluate(() => document.documentElement.classList.remove("light"));

  // Each text step sets its own weight: body text in a title doesn't inherit 650, and the buttons'
  // font-semibold still wins over their text step's.
  const weights = await page.evaluate(() => {
    const result = {};

    for (const id of ["title-text", "body-in-title", "sm", "md", "lg"]) {
      result[id] = getComputedStyle(document.getElementById(id)).fontWeight;
    }

    return result;
  });

  assert.deepEqual(weights, {
    "title-text": "650",
    "body-in-title": "400",
    sm: "600",
    md: "600",
    lg: "600",
  });

  // The link keeps its own padding and height at every size (its compound variant).
  for (const id of ["link", "link-sm", "link-lg"]) {
    assert.equal(geometry[id].paddingLeft, "2px", `${id} padding`);
    assert.ok(Number.parseFloat(geometry[id].height) < 28, `${id} height ${geometry[id].height}`);
  }

  const settled = (id) =>
    page.waitForFunction((id) => {
      const content = document.getElementById(id);

      return content.hasAttribute("data-present") && getComputedStyle(content).opacity === "1";
    }, id);
  const closed = (id) =>
    page.waitForFunction((id) => !document.getElementById(id)?.hasAttribute("open"), id);
  // Clicks `control` in the page and, once a render has marked Content with `phase`
  // (data-entering or data-leaving), reports whether it's modal and the properties transitioning
  // on Content itself, not its backdrop. Presence waits for those only, so without them the phase
  // can end in the same task.
  const phase = (id, phase, control) =>
    page.evaluate(
      ([id, phase, control]) =>
        new Promise((resolve, reject) => {
          const content = document.getElementById(id);
          const timeout = setTimeout(() => reject(new Error(`${id} never got ${phase}`)), 5_000);
          const observer = new MutationObserver((records) => {
            let marked = false;

            for (const record of records) {
              if (record.oldValue === null) {
                marked = true;
              }
            }

            if (!marked) {
              return;
            }

            observer.disconnect();
            clearTimeout(timeout);
            const transitions = [];

            for (const animation of content.getAnimations()) {
              transitions.push(animation.transitionProperty);
            }

            resolve({
              modal: content.matches(":modal"),
              transitions: transitions.sort((left, right) => left.localeCompare(right)),
            });
          });

          observer.observe(content, { attributeFilter: [phase], attributeOldValue: true });
          document.querySelector(control).click();
        }),
      [id, phase, control],
    );

  // AlertDialog: Cancel takes initial focus; the backdrop doesn't dismiss; Escape does.
  await page.click("#trigger");
  await page.waitForFunction(() => document.querySelector("#content").matches(":modal"));
  assert.equal(await page.evaluate(() => document.activeElement?.id), "cancel");

  await page.mouse.click(4, 4);
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => document.querySelector("#content").matches(":modal")));

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#content").hasAttribute("open"));
  assert.equal(await page.evaluate(() => document.activeElement?.id), "trigger");

  // It fades in, and closing fades it out while it stays modal.
  assert.deepEqual(await phase("content", "data-entering", "#trigger"), {
    modal: true,
    transitions: ["opacity", "scale"],
  });
  await settled("content");
  assert.deepEqual(await phase("content", "data-leaving", "#cancel"), {
    modal: true,
    transitions: ["opacity", "scale"],
  });
  await closed("content");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "trigger");

  // While the action is pending, it doesn't run again and Escape is blocked; closing on success
  // returns focus to the Trigger. Playwright treats aria-disabled as disabled, hence force.
  await page.click("#trigger");
  await page.waitForFunction(() => document.querySelector("#content").matches(":modal"));
  await page.click("#action");
  await page.waitForFunction(
    () => document.querySelector("#action").getAttribute("aria-disabled") === "true",
  );
  assert.equal(await page.evaluate(() => document.activeElement?.id), "action");

  await page.click("#action", { force: true });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => document.querySelector("#content").matches(":modal")));

  await page.waitForFunction(() => !document.querySelector("#content").hasAttribute("open"), null, {
    timeout: 5_000,
  });
  assert.equal(await page.evaluate(() => document.activeElement?.id), "trigger");
  assert.equal(await page.textContent("#terminations"), "1", "action runs once while pending");

  // Dialog: it fades and scales in to full opacity, named by its Title, with the autofocus field
  // focused and a labelled corner close button last.
  const closeButton = () =>
    page.evaluate(() => {
      const close = document.querySelector("#dialog-content > [data-slot=dialog-close]");

      return {
        last: close === document.getElementById("dialog-content").lastElementChild,
        label: close.getAttribute("aria-label"),
        ariaDisabled: close.getAttribute("aria-disabled"),
        disabled: close.disabled,
        tabIndex: close.tabIndex,
      };
    });
  const width = (id) =>
    page.evaluate((id) => getComputedStyle(document.getElementById(id)).width, id);

  // Content is laid out only while open.
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.getElementById("dialog-content")).display),
    "none",
  );

  await page.click("#dialog-trigger");
  await settled("dialog-content");
  assert.equal(await page.getByRole("dialog", { name: "Edit contract" }).count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "dialog-reference");
  assert.deepEqual(await closeButton(), {
    last: true,
    label: "Close",
    ariaDisabled: null,
    disabled: false,
    tabIndex: 0,
  });

  const dialogBox = await page.evaluate(() => {
    const style = getComputedStyle(document.getElementById("dialog-content"));

    return { width: style.width, display: style.display, outline: style.outlineStyle };
  });

  assert.deepEqual(dialogBox, { width: "512px", display: "flex", outline: "none" });

  // While saving: the close button is disabled but focusable, Escape is blocked, Enter on the
  // focusable disabled Save doesn't save again, and focus stays in the dialog until it closes and
  // returns to the Trigger.
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#dialog-content > [data-slot=dialog-close]")
        .getAttribute("aria-disabled") === "true",
  );
  assert.deepEqual(await closeButton(), {
    last: true,
    label: "Close",
    ariaDisabled: "true",
    disabled: false,
    tabIndex: 0,
  });
  await page.focus("#dialog-save");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "dialog-save");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => document.querySelector("#dialog-content").matches(":modal")));

  await closed("dialog-content");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "dialog-trigger");
  assert.equal(await page.textContent("#contract-saves"), "1", "saves once while pending");

  // Dismissible again: the close button closes it, fading it out while it stays modal.
  assert.deepEqual(await phase("dialog-content", "data-entering", "#dialog-trigger"), {
    modal: true,
    transitions: ["opacity", "scale"],
  });
  await settled("dialog-content");
  assert.deepEqual(
    await phase("dialog-content", "data-leaving", "#dialog-content > [data-slot=dialog-close]"),
    { modal: true, transitions: ["opacity", "scale"] },
  );
  await closed("dialog-content");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "dialog-trigger");

  // Opened from code: the component is the root, a class widens the content, and the component
  // closes itself, returning focus to the button that opened it.
  await page.click("#search-open");
  await settled("search-content");
  assert.equal(await page.getByRole("dialog", { name: "Search invoices" }).count(), 1);
  assert.equal(await width("search-content"), "640px");
  // The browser's own max-width, calc(100% - 6px - 2em), is off, so wider overrides aren't capped.
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.getElementById("search-content")).maxWidth),
    "none",
  );
  // On a narrow screen it keeps 16px from each edge.
  await page.setViewportSize({ width: 375, height: 667 });
  assert.equal(await width("search-content"), "343px");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.click("#search-done");
  await page.waitForFunction(() => document.getElementById("search-content") === null);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "search-open");

  // The root on the <dialog> itself: hidden while closed, it opens and closes.
  for (const [id, open] of [
    ["note-content", "#note-open"],
    ["discard-content", "#discard-open"],
  ]) {
    assert.equal(
      await page.evaluate((id) => getComputedStyle(document.getElementById(id)).display, id),
      "none",
      `${id} closed`,
    );
    await page.click(open);
    await settled(id);
    await page.keyboard.press("Escape");
    await closed(id);
    assert.equal(
      await page.evaluate((id) => getComputedStyle(document.getElementById(id)).display, id),
      "none",
      `${id} closed again`,
    );
  }

  // Sheet: hidden while closed, it slides and fades in against the right edge at full height,
  // named by its Title, with the autofocus field focused and a labelled corner close button last.
  const sheetClose = () =>
    page.evaluate(() => {
      const close = document.querySelector("#sheet-content > [data-slot=sheet-close]");

      return {
        last: close === document.getElementById("sheet-content").lastElementChild,
        label: close.getAttribute("aria-label"),
        ariaDisabled: close.getAttribute("aria-disabled"),
        disabled: close.disabled,
        tabIndex: close.tabIndex,
      };
    });
  const sheetBox = (id) =>
    page.evaluate((id) => {
      const content = document.getElementById(id);
      const rect = content.getBoundingClientRect();
      const style = getComputedStyle(content);

      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        maxWidth: style.maxWidth,
        maxHeight: style.maxHeight,
        viewport: `${innerWidth}x${innerHeight}`,
      };
    }, id);

  assert.equal(
    await page.evaluate(() => getComputedStyle(document.getElementById("sheet-content")).display),
    "none",
  );
  // phase() clicks from script, which doesn't move focus as a real click does.
  await page.focus("#sheet-trigger");
  assert.deepEqual(await phase("sheet-content", "data-entering", "#sheet-trigger"), {
    modal: true,
    transitions: ["opacity", "translate"],
  });
  await settled("sheet-content");
  assert.equal(await page.getByRole("dialog", { name: "Filters" }).count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "sheet-search");
  assert.deepEqual(await sheetClose(), {
    last: true,
    label: "Close",
    ariaDisabled: null,
    disabled: false,
    tabIndex: 0,
  });
  // The browser's max-width and max-height are off: 320px wide, the viewport's full height.
  assert.deepEqual(await sheetBox("sheet-content"), {
    x: 960,
    y: 0,
    width: 320,
    height: 720,
    maxWidth: "none",
    maxHeight: "none",
    viewport: "1280x720",
  });

  // While applying: the close button is disabled but focusable and Escape is blocked, until it
  // closes and returns focus to the Trigger.
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#sheet-content > [data-slot=sheet-close]")
        .getAttribute("aria-disabled") === "true",
  );
  assert.deepEqual(await sheetClose(), {
    last: true,
    label: "Close",
    ariaDisabled: "true",
    disabled: false,
    tabIndex: 0,
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => document.querySelector("#sheet-content").matches(":modal")));
  await closed("sheet-content");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "sheet-trigger");
  assert.equal(await page.textContent("#filter-applies"), "1", "applies once");

  // Dismissible again: the close button closes it, sliding it out while it stays modal.
  await page.click("#sheet-trigger");
  await settled("sheet-content");
  assert.deepEqual(
    await phase("sheet-content", "data-leaving", "#sheet-content > [data-slot=sheet-close]"),
    { modal: true, transitions: ["opacity", "translate"] },
  );
  await closed("sheet-content");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "sheet-trigger");

  // The left sheet: against the left edge, its class replacing the width, without a close button,
  // named by its visually hidden Title. A link closes it, returning focus to the Trigger.
  await page.focus("#nav-trigger");
  assert.deepEqual(await phase("nav-content", "data-entering", "#nav-trigger"), {
    modal: true,
    transitions: ["opacity", "translate"],
  });
  await settled("nav-content");
  assert.equal(await page.getByRole("dialog", { name: "Navigation" }).count(), 1);
  assert.equal(
    await page.evaluate(() => document.querySelector("#nav-content [data-slot=sheet-close]")),
    null,
  );
  assert.deepEqual(await sheetBox("nav-content"), {
    x: 0,
    y: 0,
    width: 288,
    height: 720,
    maxWidth: "none",
    maxHeight: "none",
    viewport: "1280x720",
  });
  assert.deepEqual(await phase("nav-content", "data-leaving", "#nav-link"), {
    modal: true,
    transitions: ["opacity", "translate"],
  });
  await closed("nav-content");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "nav-trigger");

  // The Sheet root on the <dialog> itself: hidden while closed, it opens and closes.
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.getElementById("panel-content")).display),
    "none",
    "panel-content closed",
  );
  await page.click("#panel-open");
  await settled("panel-content");
  await page.keyboard.press("Escape");
  await closed("panel-content");
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.getElementById("panel-content")).display),
    "none",
    "panel-content closed again",
  );

  // With reduced motion, the dialogs and sheets open and close without transitions, so closing
  // doesn't wait.
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const [id, open, close] of [
    ["content", "#trigger", "#cancel"],
    ["dialog-content", "#dialog-trigger", "#dialog-content > [data-slot=dialog-close]"],
    ["sheet-content", "#sheet-trigger", "#sheet-content > [data-slot=sheet-close]"],
    ["nav-content", "#nav-trigger", "#nav-link"],
  ]) {
    const opening = await phase(id, "data-entering", open);

    assert.deepEqual(opening.transitions, [], `${id} opens`);
    await settled(id);

    const closing = await phase(id, "data-leaving", close);

    assert.deepEqual(closing.transitions, [], `${id} closes`);
    await closed(id);
  }

  // Field, Input and Textarea: control sizes, readonly, the disabled Field's label, and a class
  // that refines the padding and replaces the width. Without transitions, colors read settled.

  const controls = await page.evaluate(() => {
    const search = document.getElementById("search");
    const searchStyle = getComputedStyle(search);

    return {
      input: getComputedStyle(document.getElementById("email")).height,
      textarea: getComputedStyle(document.getElementById("notes")).minHeight,
      readonly: getComputedStyle(document.getElementById("contract")).borderTopStyle,
      disabledLabel: getComputedStyle(document.getElementById("account-label")).opacity,
      searchClasses: [...search.classList],
      searchWidth: searchStyle.width,
      searchPadding: `${searchStyle.paddingInlineStart} ${searchStyle.paddingInlineEnd}`,
    };
  });

  assert.equal(controls.input, "32px");
  assert.equal(controls.textarea, "64px");
  assert.equal(controls.readonly, "dashed");
  assert.equal(controls.disabledLabel, "0.5");
  assert.ok(controls.searchClasses.includes("w-60"), "search keeps its width class");
  assert.equal(controls.searchClasses.includes("w-full"), false, "search drops w-full");
  assert.equal(controls.searchWidth, "240px");
  assert.equal(controls.searchPadding, "32px 10px");

  const border = (id) =>
    page.evaluate((id) => getComputedStyle(document.getElementById(id)).borderTopColor, id);

  // Hover mixes the control's own theme colors: inside a light subtree of the dark document, it
  // matches the same control under a light document.
  await page.mouse.move(0, 0);

  const lightRest = await border("light-input");

  await page.hover("#light-input");

  const lightHover = await border("light-input");

  await page.evaluate(() => document.documentElement.classList.add("light"));

  const lightDocumentHover = await border("light-input");

  await page.evaluate(() => document.documentElement.classList.remove("light"));
  assert.equal(lightRest, "rgb(133, 133, 129)", "the light subtree's input border");
  assert.notEqual(lightHover, lightRest, "hover changes the border");
  assert.equal(lightHover, lightDocumentHover, "the light subtree's hover border");

  // Focused and valid: the border is the ring, hovered or not.
  await page.click("#notes");

  const focusedHover = await border("notes");

  await page.mouse.move(0, 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "notes");
  assert.deepEqual(
    { hovered: focusedHover, rest: await border("notes") },
    { hovered: "rgb(76, 196, 111)", rest: "rgb(76, 196, 111)" },
  );

  // A disabled control is natively disabled, dimmed and keeps its border under the pointer.
  const disabledControl = () =>
    page.evaluate(() => {
      const account = document.getElementById("account");
      const style = getComputedStyle(account);

      return {
        disabled: account.disabled,
        opacity: style.opacity,
        cursor: style.cursor,
        border: style.borderTopColor,
      };
    });
  const disabledStyle = {
    disabled: true,
    opacity: "0.5",
    cursor: "not-allowed",
    border: "rgb(107, 107, 104)",
  };

  assert.deepEqual(await disabledControl(), disabledStyle, "disabled at rest");
  await page.hover("#account");
  assert.deepEqual(await disabledControl(), disabledStyle, "disabled while hovered");
  await page.mouse.move(0, 0);

  // Leaving the field with an invalid value shows the error, with its icon, after the description.
  await page.click("#email");
  await page.keyboard.type("bad");
  await page.keyboard.press("Tab");
  await page.waitForSelector("#email-error");

  const invalid = await page.evaluate(() => {
    const field = document.getElementById("email-field");
    const email = document.getElementById("email");
    const error = document.getElementById("email-error");

    return {
      fieldInvalid: field.hasAttribute("data-invalid"),
      ariaInvalid: email.getAttribute("aria-invalid"),
      describedBy: email.getAttribute("aria-describedby"),
      error: error.textContent.trim(),
      errorSlot: error.dataset.slot,
      icon: error.querySelector(":scope > svg[aria-hidden='true']") !== null,
      border: getComputedStyle(email).borderTopColor,
    };
  });

  assert.deepEqual(invalid, {
    fieldInvalid: true,
    ariaInvalid: "true",
    describedBy: "email-description email-error",
    error: "Enter a valid email.",
    errorSlot: "field-error",
    icon: true,
    border: "rgb(224, 144, 111)",
  });

  // Focused while invalid: the border keeps the error color and the focus outline is the ring.
  await page.keyboard.press("Shift+Tab");

  const focused = await page.evaluate(() => {
    const email = document.getElementById("email");
    const style = getComputedStyle(email);

    return {
      focused: document.activeElement === email,
      border: style.borderTopColor,
      outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      offset: style.outlineOffset,
    };
  });

  assert.deepEqual(focused, {
    focused: true,
    border: "rgb(224, 144, 111)",
    outline: "solid 2px rgb(76, 196, 111)",
    offset: "2px",
  });

  // Saving untouched fields shows their errors and doesn't run the action.
  await page.goto(base, { waitUntil: "networkidle" });
  await page.click("#save");
  await page.waitForSelector("#email-error");
  assert.equal((await page.textContent("#email-error")).trim(), "Enter your email.");
  assert.equal(await page.getAttribute("#email", "aria-invalid"), "true");
  assert.equal(await page.textContent("#saves"), "0");

  // Checkbox, Switch and RadioGroup, from a fresh page once Angular has hydrated it: a click
  // before then would reach the server's native form.
  const fresh = async () => {
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.querySelector("app-root") && !document.querySelector("[ngh]"),
    );
  };
  // Angular renders by the next animation frame after a change.
  const rendered = () =>
    page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
  const attribute = (id, name) => page.getAttribute(`#${id}`, name);
  const until = (id, name, value) =>
    page.waitForFunction(
      ([id, name, value]) => document.getElementById(id).getAttribute(name) === value,
      [id, name, value],
    );
  const indicator = (id) => `#${id} > [data-slot=radio-group-indicator]`;
  const styleOf = (selector, properties) =>
    page.evaluate(
      ([selector, properties]) => {
        const style = getComputedStyle(document.querySelector(selector));

        return Object.fromEntries(properties.map((property) => [property, style[property]]));
      },
      [selector, properties],
    );
  const activeId = () => page.evaluate(() => document.activeElement?.id);
  // Each radio's dot (opacity and color) and its indicator's outline.
  const radioLooks = (ids) =>
    page.evaluate(
      (ids) =>
        Object.fromEntries(
          ids.map((id) => {
            const indicator = document.querySelector(`#${id} > [data-slot=radio-group-indicator]`);
            const dot = getComputedStyle(indicator.firstElementChild);
            const ring = getComputedStyle(indicator);

            return [
              id,
              {
                dot: `${dot.opacity} ${dot.backgroundColor}`,
                outline: `${ring.outlineStyle} ${ring.outlineWidth} ${ring.outlineColor}`,
              },
            ];
          }),
        ),
      ids,
    );
  const foreground = "rgb(237, 237, 235)";
  const ring = "solid 2px rgb(76, 196, 111)";

  await fresh();

  // Geometry: the 16px box, the 36×20 track, the 16px radio, a 24px option row whose hint lines up
  // with its label, and regular-weight option labels beside semibold group labels.
  const { firstRow, ...controlGeometry } = await page.evaluate(() => {
    const size = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));

      return `${style.width} ${style.height}`;
    };
    const left = (id) => document.getElementById(id).getBoundingClientRect().left;

    return {
      checkbox: size("#vat"),
      checkboxRadius: getComputedStyle(document.getElementById("vat")).borderTopLeftRadius,
      glyph: size("#vat > svg"),
      switch: size("#renew"),
      thumb: size("#renew > [data-slot=switch-thumb]"),
      radio: size("#cycle-monthly > [data-slot=radio-group-indicator]"),
      dot: size("#cycle-monthly > [data-slot=radio-group-indicator] > span"),
      firstRow: parseFloat(
        getComputedStyle(document.getElementById("terms-field")).gridTemplateRows,
      ),
      descriptionOffset: left("renew-description") - left("renew-label"),
      optionLabel: getComputedStyle(document.getElementById("renew-label")).fontWeight,
      groupLabel: getComputedStyle(document.getElementById("cycle-label")).fontWeight,
    };
  });

  assert.ok(firstRow >= 24, `first option row ${firstRow}px`);
  assert.deepEqual(controlGeometry, {
    checkbox: "16px 16px",
    checkboxRadius: "5px",
    glyph: "12px 12px",
    switch: "36px 20px",
    thumb: "14px 14px",
    radio: "16px 16px",
    dot: "8px 8px",
    descriptionOffset: 0,
    optionLabel: "400",
    groupLabel: "600",
  });

  // A click on the box or its label toggles it; Space toggles, Enter doesn't.
  await page.click("#terms");
  await until("terms", "aria-checked", "true");
  await page.click("#terms-label");
  await until("terms", "aria-checked", "false");
  await page.focus("#terms");
  await page.keyboard.press("Space");
  await until("terms", "aria-checked", "true");
  await page.keyboard.press("Enter");
  await rendered();
  assert.equal(
    await attribute("terms", "aria-checked"),
    "true",
    "Enter doesn't toggle the checkbox",
  );

  // A switch toggles on Enter, and its thumb travels 16px.
  const thumbOffset = () =>
    page.evaluate(() => {
      const track = document.getElementById("renew");

      return (
        track.querySelector("[data-slot=switch-thumb]").getBoundingClientRect().left -
        track.getBoundingClientRect().left
      );
    });
  const offOffset = await thumbOffset();

  await page.focus("#renew");
  await page.keyboard.press("Enter");
  await until("renew", "aria-checked", "true");
  assert.equal((await thumbOffset()) - offOffset, 16, "the thumb travels 16px");

  // A standalone checkbox writes its two-way binding.
  await page.click("#select-row");
  await page.waitForFunction(() => document.getElementById("selected").textContent === "true");

  // Select-all: mixed shows the checked fill with the minus. From mixed, a click checks every
  // invoice and shows the check, the next unchecks them all, one invoice makes the parent mixed
  // again, and Space from mixed checks them all.
  const invoiceStates = () =>
    page.evaluate(() =>
      ["invoice-0412", "invoice-0413", "invoice-0414"].map((id) =>
        document.getElementById(id).getAttribute("aria-checked"),
      ),
    );
  const checkboxLooks = (id) =>
    page.evaluate((id) => {
      const box = document.getElementById(id);
      const style = getComputedStyle(box);
      const glyph = (slot) => {
        const glyphStyle = getComputedStyle(box.querySelector(`[data-slot=${slot}]`));

        return `${glyphStyle.opacity} ${glyphStyle.color}`;
      };

      return {
        box: `${style.backgroundColor} ${style.borderTopColor}`,
        check: glyph("checkbox-indicator"),
        minus: glyph("checkbox-mixed-indicator"),
      };
    }, id);
  const glyphColor = "rgb(20, 20, 20)";

  assert.equal(await attribute("all-invoices", "aria-checked"), "mixed");
  assert.deepEqual(await checkboxLooks("all-invoices"), {
    box: `${foreground} ${foreground}`,
    check: `0 ${glyphColor}`,
    minus: `1 ${glyphColor}`,
  });
  await page.click("#all-invoices");
  await until("all-invoices", "aria-checked", "true");
  assert.deepEqual(await invoiceStates(), ["true", "true", "true"]);
  assert.equal(await attribute("all-invoices", "data-mixed"), null);
  assert.deepEqual(await checkboxLooks("all-invoices"), {
    box: `${foreground} ${foreground}`,
    check: `1 ${glyphColor}`,
    minus: `0 ${glyphColor}`,
  });
  await page.click("#all-invoices");
  await until("all-invoices", "aria-checked", "false");
  assert.deepEqual(await invoiceStates(), ["false", "false", "false"]);
  await page.click("#invoice-0413");
  await until("all-invoices", "aria-checked", "mixed");
  await page.focus("#all-invoices");
  await page.keyboard.press("Space");
  await until("all-invoices", "aria-checked", "true");
  assert.deepEqual(await invoiceStates(), ["true", "true", "true"]);

  // Arrows move and check, skipping the disabled item; Tab enters on the checked item. Only the
  // checked item shows its dot, and only a keyboard-focused one rings its indicator.
  await page.click("#cycle-monthly");
  await until("cycle-monthly", "aria-checked", "true");

  const clickedLooks = await radioLooks(["cycle-monthly", "cycle-quarterly"]);

  assert.equal(clickedLooks["cycle-monthly"].dot, `1 ${foreground}`);
  assert.match(clickedLooks["cycle-quarterly"].dot, /^0 /);
  await page.keyboard.press("ArrowDown");
  await until("cycle-quarterly", "aria-checked", "true");
  assert.equal(await activeId(), "cycle-quarterly");

  const arrowedLooks = await radioLooks(["cycle-monthly", "cycle-quarterly"]);

  assert.match(arrowedLooks["cycle-monthly"].dot, /^0 /);
  assert.match(arrowedLooks["cycle-monthly"].outline, /^none /);
  assert.deepEqual(arrowedLooks["cycle-quarterly"], { dot: `1 ${foreground}`, outline: ring });
  assert.equal(await attribute("cycle-weekly", "aria-checked"), "false");
  await page.focus("#frozen");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "cycle-quarterly", "Tab enters on the checked item");

  // Disabled controls and readonly ones keep their values; an editable group nested in a readonly
  // one still changes.
  await page.click("#cycle-weekly", { force: true });
  await page.click("#locked", { force: true });
  await page.click("#frozen");
  await page.click("#tier-priority");
  await page.click("#tier-addon-b");
  await until("tier-addon-b", "aria-checked", "true");
  await page.waitForFunction(() => document.getElementById("tier-addon-value").textContent === "b");
  await rendered();
  assert.deepEqual(
    {
      weekly: await attribute("cycle-weekly", "aria-checked"),
      quarterly: await attribute("cycle-quarterly", "aria-checked"),
      locked: await attribute("locked", "aria-checked"),
      frozen: await attribute("frozen", "aria-checked"),
      standard: await attribute("tier-standard", "aria-checked"),
      priority: await attribute("tier-priority", "aria-checked"),
    },
    {
      weekly: "false",
      quarterly: "true",
      locked: "false",
      frozen: "true",
      standard: "true",
      priority: "false",
    },
  );

  // Validation, from a fresh page: saving marks every control touched, and invalid groups turn
  // their own items orange, including a checked one, but not a valid group nested inside one.
  await fresh();
  assert.deepEqual(
    await page.evaluate(() => {
      const checked = (id) => document.getElementById(id).getAttribute("aria-checked");

      return {
        terms: checked("terms"),
        cycle: [...document.querySelectorAll("#cycle [role=radio]")].some(
          (item) => item.getAttribute("aria-checked") === "true",
        ),
        band: checked("band-b"),
        plan: [checked("plan-basic"), checked("plan-pro")],
        addon: checked("addon-none"),
        waive: checked("waive"),
        pause: checked("pause"),
        invalid: ["cycle", "band", "plan", "addon", "terms", "waive", "pause"].filter((id) =>
          document.getElementById(id).hasAttribute("aria-invalid"),
        ),
      };
    }),
    {
      terms: "false",
      cycle: false,
      band: "true",
      plan: ["false", "false"],
      addon: "true",
      waive: "true",
      pause: "true",
      invalid: [],
    },
  );
  await page.click("#ctl-save");
  await page.waitForSelector("#cycle-field [data-slot=field-error]");

  const orange = "rgb(224, 144, 111)";
  const validated = await page.evaluate(() => {
    const border = (selector) => getComputedStyle(document.querySelector(selector)).borderTopColor;
    const indicator = (id) => `#${id} > [data-slot=radio-group-indicator]`;
    const solid = (id) => getComputedStyle(document.querySelector(indicator(id))).borderTopStyle;

    return {
      terms: border("#terms"),
      cycle: [...document.querySelectorAll("#cycle [data-slot=radio-group-indicator]")].map(
        (part) => getComputedStyle(part).borderTopColor,
      ),
      band: border(indicator("band-b")),
      planInvalid: document.getElementById("plan").getAttribute("aria-invalid"),
      plan: [border(indicator("plan-basic")), border(indicator("plan-pro"))],
      addonInvalid: document.getElementById("addon").hasAttribute("aria-invalid"),
      addon: [
        border(indicator("addon-none")),
        border(indicator("addon-support")),
        solid("addon-none"),
        solid("addon-support"),
      ],
      // A checked box and an on switch that fail validation keep their fill and turn orange.
      boolean: ["waive", "pause"].map((id) => {
        const control = document.getElementById(id);
        const style = getComputedStyle(control);

        return `${control.getAttribute("aria-checked")} ${style.backgroundColor} ${style.borderTopColor}`;
      }),
      saves: document.getElementById("control-saves").textContent,
    };
  });

  assert.deepEqual(validated, {
    terms: orange,
    cycle: [orange, orange, orange, orange],
    band: orange,
    planInvalid: "true",
    plan: [orange, orange],
    addonInvalid: false,
    addon: [foreground, "rgb(107, 107, 104)", "solid", "solid"],
    boolean: [`true ${foreground} ${orange}`, `true ${foreground} ${orange}`],
    saves: "0",
  });

  // Keyboard focus on an invalid checkbox: the ring outside, the orange border kept.
  await page.focus("#vat");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await activeId(), "terms");
  assert.deepEqual(
    await page.evaluate(() => {
      const style = getComputedStyle(document.getElementById("terms"));

      return {
        border: style.borderTopColor,
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      };
    }),
    { border: orange, outline: ring },
  );

  // Signal Forms' focusBoundControl() reaches the group's tab stop through fold's RadioGroup.
  await page.click("#focus-cycle");
  await page.waitForFunction(
    () =>
      document.activeElement?.closest("#cycle") &&
      document.activeElement.getAttribute("role") === "radio",
  );

  // Disabled, readonly (a readonly switch keeps its on fill), nested editable, themed and merged.
  const surface = "rgb(28, 28, 28)";

  assert.equal((await styleOf("#locked", ["opacity"])).opacity, "0.5");
  assert.deepEqual(await styleOf("#frozen", ["borderTopStyle", "cursor", "backgroundColor"]), {
    borderTopStyle: "dashed",
    cursor: "default",
    backgroundColor: foreground,
  });

  for (const id of ["tier-standard", "tier-priority"]) {
    assert.deepEqual(
      {
        ...(await styleOf(indicator(id), ["borderTopStyle", "backgroundColor"])),
        ...(await styleOf(`#${id}`, ["cursor"])),
      },
      { borderTopStyle: "dashed", backgroundColor: "rgba(0, 0, 0, 0)", cursor: "default" },
      id,
    );
  }

  assert.equal(await attribute("tier-addon", "aria-labelledby"), "tier-addon-label");

  for (const id of ["tier-addon-a", "tier-addon-b"]) {
    assert.deepEqual(
      {
        ...(await styleOf(indicator(id), ["borderTopStyle", "backgroundColor"])),
        ...(await styleOf(`#${id}`, ["cursor"])),
      },
      { borderTopStyle: "solid", backgroundColor: surface, cursor: "pointer" },
      id,
    );
  }

  assert.deepEqual(
    await page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));

      return {
        checked: `${style("#vat").backgroundColor} ${style("#vat").borderTopColor}`,
        glyph: style("#vat > svg").color,
        unchecked: style("#merged-checkbox").borderTopColor,
        lightFill: style("#light-checkbox").backgroundColor,
        lightMixed: `${style("#light-mixed-checkbox").backgroundColor} ${style("#light-mixed-checkbox > [data-slot=checkbox-mixed-indicator]").opacity}`,
        lightThumb: style("#light-switch > [data-slot=switch-thumb]").backgroundColor,
        mergedRadius: parseFloat(style("#merged-checkbox").borderTopLeftRadius) >= 8,
        mergedWidth: style("#merged-switch").width,
      };
    }),
    {
      checked: `${foreground} ${foreground}`,
      glyph: "rgb(20, 20, 20)",
      unchecked: "rgb(107, 107, 104)",
      lightFill: "rgb(27, 27, 27)",
      lightMixed: "rgb(27, 27, 27) 1",
      lightThumb: "rgb(233, 233, 231)",
      mergedRadius: true,
      mergedWidth: "40px",
    },
  );

  // Reduced motion removes every control transition.
  assert.deepEqual(
    await page.evaluate(() =>
      [
        "#vat",
        "#vat > svg",
        "#vat > [data-slot=checkbox-mixed-indicator]",
        "#renew",
        "#renew > [data-slot=switch-thumb]",
        "#cycle-monthly > [data-slot=radio-group-indicator]",
        "#cycle-monthly > [data-slot=radio-group-indicator] > span",
      ].map((selector) => getComputedStyle(document.querySelector(selector)).transitionDuration),
    ),
    ["0s", "0s", "0s", "0s", "0s", "0s", "0s"],
  );

  // Forced colors, from a fresh page: the radio's dot and the switch's thumb keep the system button
  // text color, so a selected radio and an on switch look different from unselected and off ones.
  await page.emulateMedia({ forcedColors: "active" });
  await fresh();

  // The opaque color painted on the dot or thumb, and on what it sits on.
  const painted = (part, ground) =>
    page.evaluate(
      ([part, ground]) => ({
        part: getComputedStyle(document.querySelector(part)).backgroundColor,
        ground: getComputedStyle(document.querySelector(ground)).backgroundColor,
      }),
      [part, ground],
    );
  const assertStandsOut = ({ part, ground }, name) => {
    assert.match(part, /^rgb\(/, `${name} is opaque`);
    assert.notEqual(part, ground, `${name} differs from its ground`);
  };
  const shot = (selector) => page.locator(selector).screenshot({ animations: "disabled" });

  const unselected = await shot(indicator("cycle-monthly"));

  await page.click("#cycle-monthly");
  await until("cycle-monthly", "aria-checked", "true");
  await rendered();
  assert.equal(
    (await styleOf(`${indicator("cycle-monthly")} > span`, ["opacity"])).opacity,
    "1",
    "the selected dot shows",
  );
  assertStandsOut(
    await painted(`${indicator("cycle-monthly")} > span`, indicator("cycle-monthly")),
    "the selected dot",
  );
  assert.equal(
    unselected.equals(await shot(indicator("cycle-monthly"))),
    false,
    "a selected radio looks different from an unselected one",
  );

  const thumb = "#renew > [data-slot=switch-thumb]";
  const off = await shot("#renew");

  assertStandsOut(await painted(thumb, "#renew"), "the off thumb");
  await page.click("#renew");
  await until("renew", "aria-checked", "true");
  await rendered();
  assertStandsOut(await painted(thumb, "#renew"), "the on thumb");
  assert.equal(
    off.equals(await shot("#renew")),
    false,
    "an on switch looks different from an off one",
  );

  // The mixed parent's minus keeps the system text color, and its glyph area, inside the border
  // that Chromium tints on a focused or just-clicked box, differs from unchecked and checked.
  const minus = "#all-invoices > [data-slot=checkbox-mixed-indicator]";
  const glyphArea = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(0, 0);
    await rendered();

    const clip = await page.locator(minus).boundingBox();

    return page.screenshot({ clip, animations: "disabled" });
  };

  await fresh();
  await page.locator("#all-invoices").scrollIntoViewIfNeeded();
  assert.equal(await attribute("all-invoices", "aria-checked"), "mixed");
  assertStandsOut(
    await page.evaluate(
      ([minus, box]) => ({
        part: getComputedStyle(document.querySelector(minus)).color,
        ground: getComputedStyle(document.querySelector(box)).backgroundColor,
      }),
      [minus, "#all-invoices"],
    ),
    "the forced minus",
  );

  const mixedGlyph = await glyphArea();

  await page.click("#all-invoices");
  await until("all-invoices", "aria-checked", "true");

  const checkedGlyph = await glyphArea();

  await page.click("#all-invoices");
  await until("all-invoices", "aria-checked", "false");

  const uncheckedGlyph = await glyphArea();

  assert.equal(mixedGlyph.equals(uncheckedGlyph), false, "a forced mixed box shows its minus");
  assert.equal(mixedGlyph.equals(checkedGlyph), false, "forced mixed and checked look different");
  await page.emulateMedia({ forcedColors: "none" });

  // Number field and Slider. Exact outline and border widths are DPR-1 values: at a fractional
  // device-pixel ratio the browser reports them snapped to device pixels.
  //
  // Server rendering: Origami's state attributes, fold's slots and its decorative markup.
  const amountInput = openingTag(html, "amount-input");
  const ticketsIncrement = openingTag(html, "tickets-inc");

  assert.match(amountInput, /\btype="text"/);
  assert.match(amountInput, /\binputmode="decimal"/);
  assert.match(amountInput, /\bdata-slot="number-field-input"/);
  assert.match(openingTag(html, "amount-label"), /\bfor="amount-input"/);
  assert.match(openingTag(html, "amount"), /\bdata-slot="number-field"/);
  assert.match(openingTag(html, "amount-sign"), /\baria-hidden="true"/);
  assert.match(openingTag(html, "amount-sign"), /\bdata-slot="number-field-adornment"/);
  assert.match(openingTag(html, "tickets-input"), /\binputmode="numeric"/);
  assert.match(openingTag(html, "tickets-input"), /\bvalue="10"/);
  assert.match(ticketsIncrement, /\bdata-disabled=""/);
  assert.match(ticketsIncrement, /\baria-disabled="true"/);
  assert.match(ticketsIncrement, /\btabindex="-1"/);
  assert.match(ticketsIncrement, /\baria-controls="tickets-input"/);
  assert.match(ticketsIncrement, /\bdata-slot="number-field-increment"/);
  assert.doesNotMatch(ticketsIncrement, /\sdisabled[\s=>]/);
  assert.match(openingTag(html, "locked-amount-input"), /\sdisabled[\s=>]/);
  assert.match(openingTag(html, "locked-amount-dec"), /\sdisabled[\s=>]/);
  assert.match(openingTag(html, "locked-amount-inc"), /\sdisabled[\s=>]/);
  assert.match(openingTag(html, "frozen-amount-input"), /\sreadonly[\s=>]/);
  assert.match(openingTag(html, "frozen-amount-input"), /\bvalue="1\.234,50"/);

  const stepButtons = element(html, "numbers")
    .match(/<button\b[^>]*>/g)
    .filter((tag) => /\bdata-slot="number-field-(?:de|in)crement"/.test(tag));

  assert.ok(stepButtons.length >= 10, `${stepButtons.length} step buttons`);

  for (const tag of stepButtons) {
    assert.match(tag, /\baria-label="[^"]+"/, `a step button without a name: ${tag}`);
  }

  const zoomThumb = openingTag(html, "zoom-thumb");
  const zoomMarkup = element(html, "zoom");

  assert.match(openingTag(html, "zoom"), /\bstyle="[^"]*--og-slider-percent:\s*50%/);
  assert.match(openingTag(html, "zoom"), /\bdata-slot="slider"/);
  assert.match(zoomMarkup, /<div\b[^>]*\bdata-slot="slider-track"/);
  assert.match(zoomMarkup, /<span\b[^>]*\bdata-slot="slider-rail"[^>]*\baria-hidden="true"/);
  assert.match(zoomMarkup, /<span\b[^>]*\bdata-slot="slider-fill"[^>]*\baria-hidden="true"/);
  assert.match(zoomThumb, /\bdata-slot="slider-thumb"/);
  assert.match(zoomThumb, /\brole="slider"/);
  assert.match(zoomThumb, /\baria-valuenow="100"/);
  assert.match(zoomThumb, /\baria-valuemin="20"/);
  assert.match(zoomThumb, /\baria-valuemax="180"/);
  assert.match(zoomThumb, /\btabindex="0"/);
  assert.match(zoomThumb, /\baria-labelledby="zoom-label"/);
  assert.match(openingTag(html, "zoom-locked"), /\bdata-disabled=""/);
  assert.doesNotMatch(openingTag(html, "zoom-locked-thumb"), /\stabindex=/);
  assert.match(openingTag(html, "zoom-frozen-thumb"), /\baria-readonly="true"/);

  // Before hydration, CSS alone draws the server state: the readonly box, the step limit and each
  // thumb's place, flush with the slider's box at both ends and mirrored in RTL.
  const numbersPrerendered = await browser.newPage({
    javaScriptEnabled: false,
    deviceScaleFactor: 1,
  });

  await numbersPrerendered.goto(base);

  const serverLook = await numbersPrerendered.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const track = (id) => rect(`#${id} > [data-slot=slider-track]`);
    const thumb = (id) => rect(`#${id} [data-slot=slider-thumb]`);
    const center = (box) => box.left + box.width / 2;

    return {
      dpr: window.devicePixelRatio,
      frozenBorder: getComputedStyle(document.getElementById("frozen-amount")).borderTopStyle,
      limitOpacity: getComputedStyle(document.getElementById("tickets-inc")).opacity,
      zoomOffset: center(thumb("zoom")) - (track("zoom").left + track("zoom").width / 2),
      minOffset: thumb("zoom-at-min").left - rect("#zoom-at-min").left,
      maxOffset: rect("#zoom-at-max").right - thumb("zoom-at-max").right,
      rtlOffset: track("zoom-rtl").right - track("zoom-rtl").width / 4 - center(thumb("zoom-rtl")),
    };
  });

  await numbersPrerendered.close();
  assert.equal(serverLook.dpr, 1);
  assert.equal(serverLook.frozenBorder, "dashed");
  assert.equal(serverLook.limitOpacity, "0.5");

  for (const key of ["zoomOffset", "minOffset", "maxOffset", "rtlOffset"]) {
    assert.ok(Math.abs(serverLook[key]) <= 0.5, `server ${key} ${serverLook[key]}`);
  }

  // An element's focus outline, read whole: color alone passes while nothing is drawn.
  const outline = (selector) =>
    page.evaluate((selector) => {
      const style = getComputedStyle(document.querySelector(selector));

      return {
        style: style.outlineStyle,
        width: style.outlineWidth,
        offset: style.outlineOffset,
        color: style.outlineColor,
      };
    }, selector);
  const ringOutline = (color) => ({ style: "solid", width: "2px", offset: "2px", color });
  const textOf = (id) => page.evaluate((id) => document.getElementById(id).textContent.trim(), id);
  const valueOf = (id) => page.evaluate((id) => document.getElementById(id).value, id);
  const untilText = (id, text) =>
    page.waitForFunction(
      ([id, text]) => document.getElementById(id).textContent.trim() === text,
      [id, text],
    );
  const untilValue = (id, value) =>
    page.waitForFunction(([id, value]) => document.getElementById(id).value === value, [id, value]);
  const untilAbsent = (id, name) =>
    page.waitForFunction(
      ([id, name]) => !document.getElementById(id).hasAttribute(name),
      [id, name],
    );
  const selectAll = () => page.keyboard.press("ControlOrMeta+A");
  const darkRing = "rgb(76, 196, 111)";
  const lightRing = "rgb(38, 128, 63)";
  const darkOrange = "rgb(224, 144, 111)";

  await fresh();
  assert.equal(await page.evaluate(() => window.devicePixelRatio), 1);

  // Geometry: the box matches a plain Input, a bare box's text lines up with the Input's, the step
  // buttons are the box's inner height, square, and the € sits 8px before the number.
  const numberGeometry = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const box = (selector) => {
      const look = style(selector);

      return {
        height: look.height,
        radius: look.borderTopLeftRadius,
        borderWidth: look.borderTopWidth,
        borderColor: look.borderTopColor,
        ground: look.backgroundColor,
      };
    };
    const textStart = (selector) => rect(selector).left + parseFloat(style(selector).paddingLeft);
    const steps = {};

    for (const id of ["amount", "amount-sm", "amount-lg"]) {
      const root = style(`#${id}`);
      const inner =
        rect(`#${id}`).height -
        parseFloat(root.borderTopWidth) -
        parseFloat(root.borderBottomWidth) -
        parseFloat(root.paddingTop) -
        parseFloat(root.paddingBottom);
      const buttons = [];

      for (const button of [`#${id}-dec`, `#${id}-inc`]) {
        buttons.push({ width: rect(button).width, height: rect(button).height });
      }

      steps[id] = { root: rect(`#${id}`).height, inner, buttons };
    }

    const plain = style("#plain-input");
    const thumb = rect("#zoom-thumb");

    return {
      box: box("#amount"),
      plainBox: box("#plain-input"),
      bareTextStart: textStart("#amount-bare-input"),
      plainTextStart:
        rect("#plain-input").left +
        parseFloat(plain.borderLeftWidth) +
        parseFloat(plain.paddingLeft),
      euroGap: textStart("#amount-input") - rect("#amount-sign").right,
      steps,
      track: rect("#zoom > [data-slot=slider-track]").height,
      touchAction: style("#zoom > [data-slot=slider-track]").touchAction,
      rail: {
        height: rect("#zoom [data-slot=slider-rail]").height,
        width: rect("#zoom [data-slot=slider-rail]").width,
      },
      slider: rect("#zoom").width,
      thumb: `${thumb.width}x${thumb.height}`,
    };
  });

  assert.deepEqual(numberGeometry.box, numberGeometry.plainBox, "the box matches a plain Input");
  assert.equal(numberGeometry.box.height, "32px");
  assert.equal(numberGeometry.box.radius, "10px");
  assert.ok(
    Math.abs(numberGeometry.bareTextStart - numberGeometry.plainTextStart) <= 1,
    `text inset ${numberGeometry.bareTextStart} vs ${numberGeometry.plainTextStart}`,
  );
  assert.ok(Math.abs(numberGeometry.euroGap - 8) <= 1, `€ gap ${numberGeometry.euroGap}`);

  for (const [id, height] of [
    ["amount", 32],
    ["amount-sm", 28],
    ["amount-lg", 36],
  ]) {
    const { root, inner, buttons } = numberGeometry.steps[id];

    assert.equal(root, height, `${id} height`);

    for (const button of buttons) {
      assert.ok(Math.abs(button.height - inner) <= 0.5, `${id} button height ${button.height}`);
      assert.ok(Math.abs(button.width - button.height) <= 0.5, `${id} button ${button.width}`);
    }
  }

  assert.equal(numberGeometry.track, 24);
  assert.equal(numberGeometry.touchAction, "pan-y");
  assert.equal(numberGeometry.rail.height, 4);
  assert.ok(Math.abs(numberGeometry.rail.width - numberGeometry.slider) <= 0.5, "rail width");
  assert.equal(numberGeometry.thumb, "16x16");

  // Number field: typing commits, blurring formats; above max, stepping up is blocked and focus
  // stays in the input; in range, ArrowUp and Increment step on the grid.
  await page.click("#amount-input");
  await page.keyboard.type("1234,5");
  await untilText("amount-value", "1234.5");
  await page.keyboard.press("Tab");
  await untilValue("amount-input", "1.234,50");
  assert.deepEqual(
    await page.evaluate(() => {
      const increment = document.getElementById("amount-inc");

      return {
        marked: increment.hasAttribute("data-disabled"),
        aria: increment.getAttribute("aria-disabled"),
        native: increment.disabled,
        opacity: getComputedStyle(increment).opacity,
      };
    }),
    { marked: true, aria: "true", native: false, opacity: "0.5" },
  );
  await page.click("#amount-input");
  await page.keyboard.press("ArrowUp");
  // Playwright won't click an aria-disabled button without force.
  await page.click("#amount-inc", { force: true });
  await rendered();
  assert.equal(await valueOf("amount-input"), "1.234,50");
  assert.equal(await textOf("amount-value"), "1234.5");
  assert.equal(await activeId(), "amount-input");

  await selectAll();
  await page.keyboard.type("12,5");
  await untilText("amount-value", "12.5");
  await untilAbsent("amount-inc", "data-disabled");
  await page.keyboard.press("Tab");
  await untilValue("amount-input", "12,50");
  await page.click("#amount-input");
  await page.keyboard.press("ArrowUp");
  await untilText("amount-value", "13");
  await untilValue("amount-input", "13,00");
  await page.click("#amount-inc");
  await untilText("amount-value", "14");
  await untilValue("amount-input", "14,00");
  assert.equal(await activeId(), "amount-input", "Increment keeps focus in the input");

  // At its limit a step button does nothing; a disabled field ignores its buttons, a readonly one
  // typing; a standalone field writes its two-way binding.
  await page.click("#tickets-inc", { force: true });
  await rendered();
  assert.equal(await valueOf("tickets-input"), "10");
  await page.click("#tickets-dec");
  await untilValue("tickets-input", "9");
  await untilAbsent("tickets-inc", "data-disabled");
  await page.click("#quantity-inc");
  await untilText("quantity-value", "4");
  await page.click("#locked-amount-inc", { force: true });
  await page.click("#locked-amount-dec", { force: true });
  await page.click("#frozen-amount-input");
  await page.keyboard.type("5");
  await page.keyboard.press("ArrowUp");
  await rendered();
  assert.equal(await valueOf("locked-amount-input"), "1.234,50");
  assert.equal(await valueOf("frozen-amount-input"), "1.234,50");

  // Slider: keys, presses (including the 8px past each end of the Track), drags, RTL, and the
  // disabled and readonly ones ignoring both.
  const now = (id) => attribute(id, "aria-valuenow");
  const track = async (id) => {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();

    return page.evaluate((id) => {
      const box = document
        .querySelector(`#${id} > [data-slot=slider-track]`)
        .getBoundingClientRect();

      return { left: box.left, right: box.right, width: box.width, y: box.top + box.height / 2 };
    }, id);
  };

  await page.focus("#zoom-thumb");
  await page.keyboard.press("ArrowRight");
  await until("zoom-thumb", "aria-valuenow", "110");
  await untilText("zoom-value", "110%");
  await page.keyboard.press("Home");
  await until("zoom-thumb", "aria-valuenow", "20");
  await page.keyboard.press("End");
  await until("zoom-thumb", "aria-valuenow", "180");

  const zoomTrack = await track("zoom");

  await page.mouse.click(zoomTrack.left + zoomTrack.width * 0.75, zoomTrack.y);
  await until("zoom-thumb", "aria-valuenow", "140");
  await rendered();

  const pressedCenter = await page.evaluate(() => {
    const thumb = document.getElementById("zoom-thumb").getBoundingClientRect();

    return thumb.left + thumb.width / 2;
  });

  assert.ok(
    Math.abs(pressedCenter - (zoomTrack.left + zoomTrack.width * 0.75)) <= 0.5,
    `thumb center ${pressedCenter}`,
  );
  await page.mouse.click(zoomTrack.left - 4, zoomTrack.y);
  await until("zoom-thumb", "aria-valuenow", "20");
  await page.mouse.click(zoomTrack.right + 4, zoomTrack.y);
  await until("zoom-thumb", "aria-valuenow", "180");

  await page.mouse.move(zoomTrack.right, zoomTrack.y);
  await page.mouse.down();
  await page.mouse.move(zoomTrack.left + zoomTrack.width / 2, zoomTrack.y, { steps: 4 });
  await page.waitForFunction(() => document.getElementById("zoom").hasAttribute("data-dragging"));
  await page.mouse.up();
  await untilAbsent("zoom", "data-dragging");
  await until("zoom-thumb", "aria-valuenow", "100");

  await page.focus("#zoom-rtl-thumb");
  await page.keyboard.press("ArrowRight");
  await until("zoom-rtl-thumb", "aria-valuenow", "24");

  const rtlTrack = await track("zoom-rtl");

  await page.mouse.click(rtlTrack.right - 1, rtlTrack.y);
  await page.waitForFunction(
    () => Number(document.getElementById("zoom-rtl-thumb").getAttribute("aria-valuenow")) <= 2,
  );

  for (const id of ["zoom-locked", "zoom-frozen"]) {
    const box = await track(id);

    await page.mouse.click(box.left + box.width * 0.75, box.y);
  }

  // A disabled thumb can't take focus, so the key goes straight to it.
  await page.locator("#zoom-locked-thumb").dispatchEvent("keydown", {
    key: "ArrowRight",
    code: "ArrowRight",
    bubbles: true,
    cancelable: true,
  });
  await page.focus("#zoom-frozen-thumb");
  await page.keyboard.press("ArrowRight");
  await rendered();
  assert.equal(await now("zoom-locked-thumb"), "50");
  assert.equal(await now("zoom-frozen-thumb"), "50");

  // Touch: a horizontal drag moves the thumb; a vertical gesture that starts on the thumb scrolls
  // the page and keeps the value.
  const touchContext = await browser.newContext({
    hasTouch: true,
    deviceScaleFactor: 1,
    viewport: { width: 1200, height: 800 },
  });
  const touchPage = await touchContext.newPage();

  touchPage.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      errors.push(message.text());
    }
  });
  touchPage.on("pageerror", (error) => errors.push(String(error)));
  await touchPage.goto(base, { waitUntil: "networkidle" });
  await touchPage.waitForFunction(
    () => document.querySelector("app-root") && !document.querySelector("[ngh]"),
  );
  assert.equal(await touchPage.evaluate(() => window.devicePixelRatio), 1);

  const cdp = await touchContext.newCDPSession(touchPage);
  const touchThumb = () =>
    touchPage.evaluate(() => {
      const thumb = document.getElementById("zoom-thumb");
      const box = thumb.getBoundingClientRect();

      return {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
        value: thumb.getAttribute("aria-valuenow"),
        scrollY: window.scrollY,
      };
    });
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

  // The thumb in the lower part of the viewport, with page left to scroll below it.
  await touchPage.evaluate(() => {
    const box = document.getElementById("zoom").getBoundingClientRect();

    window.scrollTo(0, window.scrollY + box.top - 600);
  });

  const dragStart = await touchThumb();

  assert.equal(dragStart.value, "100");
  await touch("touchStart", [{ x: dragStart.x, y: dragStart.y }]);

  for (let step = 1; step <= 8; step += 1) {
    await touch("touchMove", [{ x: dragStart.x + step * 10, y: dragStart.y }]);
  }

  await touch("touchEnd", []);
  await touchPage.waitForFunction(
    () => Number(document.getElementById("zoom-thumb").getAttribute("aria-valuenow")) > 100,
  );

  const scrollStart = await touchThumb();

  await touch("touchStart", [{ x: scrollStart.x, y: scrollStart.y }]);

  for (let step = 1; step <= 15; step += 1) {
    await touch("touchMove", [{ x: scrollStart.x, y: scrollStart.y - step * 10 }]);
  }

  await touch("touchEnd", []);
  await touchPage.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

  const scrollEnd = await touchThumb();

  assert.ok(scrollEnd.scrollY > scrollStart.scrollY, `touch scroll ${JSON.stringify(scrollEnd)}`);
  assert.equal(scrollEnd.value, scrollStart.value, "a scroll from the thumb keeps the value");
  await cdp.detach();
  await touchContext.close();

  // Validation, from a fresh page: saving shows every error; an invalid box stays orange under its
  // ring, an invalid thumb turns orange and its fill stays neutral; every rule has its message,
  // and the parse errors theirs.
  await fresh();
  assert.deepEqual(
    await page.evaluate(() => ({
      amount: document.getElementById("amount-input").value,
      invalid: document.querySelectorAll("#numbers [aria-invalid]").length,
    })),
    { amount: "", invalid: 0 },
  );
  await page.click("#numbers-save");
  await page.waitForSelector("#amount-field [data-slot=field-error]");

  assert.equal(
    await page.evaluate(() =>
      document.querySelector("#amount-field [data-slot=field-error]").textContent.trim(),
    ),
    "Enter an amount",
  );
  assert.equal((await styleOf("#amount", ["borderTopColor"])).borderTopColor, darkOrange);
  await page.focus("#amount-bare-input");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "amount-input");
  assert.equal((await styleOf("#amount", ["borderTopColor"])).borderTopColor, darkOrange);
  assert.deepEqual(await outline("#amount"), ringOutline(darkRing));
  assert.equal(await attribute("zoom-invalid-thumb", "aria-invalid"), "true");
  assert.deepEqual(
    {
      border: (await styleOf("#zoom-invalid-thumb", ["borderTopColor"])).borderTopColor,
      fill: (await styleOf("#zoom-invalid [data-slot=slider-fill]", ["backgroundColor"]))
        .backgroundColor,
    },
    { border: darkOrange, fill: foreground },
  );

  const errorText = (text) =>
    page.waitForFunction(
      (text) =>
        document.querySelector("#amount-field [data-slot=field-error]")?.textContent.trim() ===
        text,
      text,
    );

  await page.click("#amount-input");
  await selectAll();
  await page.keyboard.type("1500");
  await page.keyboard.press("Tab");
  await errorText("Up to 1.000 €");
  await page.click("#amount-input");
  await selectAll();
  await page.keyboard.type("12.50");
  await page.keyboard.press("Tab");
  await errorText("That isn't an amount");
  await page.click("#focus-amount");
  await page.waitForFunction(() => document.activeElement?.id === "amount-input");
  await page.click("#focus-zoom");
  await page.waitForFunction(() => document.activeElement?.id === "zoom-thumb");

  // States, from a fresh page: the box's and the thumb's keyboard rings, disabled and readonly,
  // hover, and the colors in both themes.
  await fresh();
  await page.focus("#amount-input");
  assert.deepEqual(await outline("#amount"), ringOutline(darkRing));
  await page.focus("#zoom-thumb");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await until("zoom-thumb", "aria-valuenow", "100");
  assert.deepEqual(await outline("#zoom-thumb"), ringOutline(darkRing));
  await page.focus("#light-zoom-thumb");
  await page.keyboard.press("ArrowRight");
  await until("light-zoom-thumb", "aria-valuenow", "51");
  assert.deepEqual(await outline("#light-zoom-thumb"), ringOutline(lightRing));
  await page.hover("#amount-bare");
  assert.notEqual(
    (await styleOf("#amount-bare", ["borderTopColor"])).borderTopColor,
    "rgb(107, 107, 104)",
    "hover changes the border",
  );
  await page.mouse.move(0, 0);

  assert.deepEqual(
    await page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));

      return {
        locked: style("#locked-amount").opacity,
        lockedButtons: [style("#locked-amount-dec").opacity, style("#locked-amount-inc").opacity],
        frozenButtons: [style("#frozen-amount-dec").opacity, style("#frozen-amount-inc").opacity],
        zoomLocked: style("#zoom-locked").opacity,
        zoomFrozen: style("#zoom-frozen-thumb").borderTopStyle,
        dark: {
          rail: style("#zoom [data-slot=slider-rail]").backgroundColor,
          fill: style("#zoom [data-slot=slider-fill]").backgroundColor,
          thumb: `${style("#zoom-thumb").backgroundColor} ${style("#zoom-thumb").borderTopColor}`,
        },
        light: {
          box: `${style("#light-amount").borderTopColor} ${style("#light-amount").backgroundColor}`,
          rail: style("#light-zoom [data-slot=slider-rail]").backgroundColor,
          fill: style("#light-zoom [data-slot=slider-fill]").backgroundColor,
          thumb: `${style("#light-zoom-thumb").backgroundColor} ${style("#light-zoom-thumb").borderTopColor}`,
        },
      };
    }),
    {
      locked: "0.5",
      lockedButtons: ["1", "1"],
      frozenButtons: ["0.5", "0.5"],
      zoomLocked: "0.5",
      zoomFrozen: "dashed",
      dark: {
        rail: "rgb(107, 107, 104)",
        fill: foreground,
        thumb: `rgb(28, 28, 28) ${foreground}`,
      },
      light: {
        box: "rgb(133, 133, 129) rgb(247, 247, 246)",
        rail: "rgb(133, 133, 129)",
        fill: "rgb(27, 27, 27)",
        thumb: "rgb(247, 247, 246) rgb(27, 27, 27)",
      },
    },
  );

  // Reduced motion removes the box's, the buttons' and the thumb's transitions.
  assert.deepEqual(
    await page.evaluate(() =>
      ["#amount", "#amount-inc", "#zoom-thumb"].map(
        (selector) => getComputedStyle(document.querySelector(selector)).transitionDuration,
      ),
    ),
    ["0s", "0s", "0s"],
  );

  // Forced colors, from a fresh page: the rail and fill keep system colors, the thumb is a Canvas
  // disc with a CanvasText border in every state, invalid included, and both controls' focus rings
  // are CanvasText.
  await page.emulateMedia({ forcedColors: "active" });
  await fresh();

  const palette = await page.evaluate(() => {
    const probe = document.createElement("span");

    probe.style.cssText =
      "position: fixed; forced-color-adjust: none; background: Canvas; color: CanvasText";
    document.body.append(probe);

    const style = getComputedStyle(probe);
    const result = { canvas: style.backgroundColor, canvasText: style.color };

    probe.remove();

    return result;
  });
  const forcedSlider = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));

    return {
      ground: style("html").backgroundColor,
      rail: style("#zoom [data-slot=slider-rail]").backgroundColor,
      fill: style("#zoom [data-slot=slider-fill]").backgroundColor,
      thumb: style("#zoom-thumb").backgroundColor,
      borderWidth: parseFloat(style("#zoom-thumb").borderTopWidth),
      border: style("#zoom-thumb").borderTopColor,
    };
  });

  for (const part of ["rail", "fill"]) {
    assert.match(forcedSlider[part], /^rgb\(/, `forced ${part} is opaque`);
    assert.notEqual(forcedSlider[part], forcedSlider.ground, `forced ${part} vs the ground`);
  }

  assert.notEqual(forcedSlider.rail, forcedSlider.fill, "forced rail vs fill");
  assert.equal(forcedSlider.thumb, palette.canvas, "forced thumb center");
  assert.ok(forcedSlider.borderWidth >= 1, `forced thumb border ${forcedSlider.borderWidth}`);
  assert.equal(forcedSlider.border, palette.canvasText, "forced thumb border");

  await page.focus("#zoom-thumb");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await until("zoom-thumb", "aria-valuenow", "100");
  assert.deepEqual(await outline("#zoom-thumb"), ringOutline(palette.canvasText));
  assert.equal(
    (await styleOf("#zoom-thumb", ["borderTopColor"])).borderTopColor,
    palette.canvasText,
  );

  const fillOffset = () =>
    page.evaluate(() => {
      const fill = document.querySelector("#zoom [data-slot=slider-fill]").getBoundingClientRect();
      const thumb = document.getElementById("zoom-thumb").getBoundingClientRect();

      return { right: fill.right, offset: fill.right - (thumb.left + thumb.width / 2) };
    });
  const fillBefore = await fillOffset();

  assert.ok(
    Math.abs(fillBefore.offset) <= 0.5,
    `at 100 the fill ends ${fillBefore.offset}px from the thumb's center`,
  );

  const beforeEnd = await page.locator("#zoom").screenshot({ animations: "disabled" });

  await page.keyboard.press("End");
  await until("zoom-thumb", "aria-valuenow", "180");
  await rendered();
  assert.equal(
    beforeEnd.equals(await page.locator("#zoom").screenshot({ animations: "disabled" })),
    false,
    "the forced slider looks different at its end",
  );

  const fillAfter = await fillOffset();

  assert.ok(
    Math.abs(fillAfter.offset) <= 0.5,
    `at 180 the fill ends ${fillAfter.offset}px from the thumb's center`,
  );
  assert.ok(fillAfter.right > fillBefore.right + 1, "the fill grows with the value");
  await page.focus("#amount-input");
  assert.deepEqual(await outline("#amount"), ringOutline(palette.canvasText));
  assert.notEqual(
    (await styleOf("#tickets-inc", ["color"])).color,
    (await styleOf("#tickets-dec", ["color"])).color,
    "a forced limit button looks different",
  );

  await page.click("#numbers-save");
  await page.waitForSelector("#zoom-invalid-thumb[aria-invalid=true]");
  await page.waitForSelector("#zoom-invalid-field [data-slot=field-error]");
  await page.focus("#numbers-save");
  assert.equal(
    (await styleOf("#zoom-invalid-thumb", ["borderTopColor"])).borderTopColor,
    palette.canvasText,
    "a forced invalid thumb's border",
  );
  await page.focus("#zoom-invalid-thumb");
  await page.keyboard.press("ArrowRight");
  await until("zoom-invalid-thumb", "aria-valuenow", "31");
  assert.equal(await attribute("zoom-invalid-thumb", "aria-invalid"), "true");
  assert.deepEqual(await outline("#zoom-invalid-thumb"), ringOutline(palette.canvasText));
  assert.equal(
    (await styleOf("#zoom-invalid-thumb", ["borderTopColor"])).borderTopColor,
    palette.canvasText,
  );
  await page.emulateMedia({ forcedColors: "none" });

  // OTP field. Exact geometry and outline widths are DPR-1 values.
  //
  // Server rendering: fold's slots and its decorative cells, Origami's input attributes and the
  // Field's wiring; a readonly code shows its digits, a masked PIN no digit, and a disabled input
  // is disabled.
  const otpInput = openingTag(html, "otp-input");
  const otpCellsIn = (markup) => {
    const cells = [];

    for (const match of markup.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/g)) {
      if (match[1].includes('data-slot="otp-field-cell"')) {
        cells.push({
          tag: match[1],
          text: match[2].replace(/<!--[\s\S]*?-->|<[^>]+>/g, "").trim(),
        });
      }
    }

    return cells;
  };

  assert.match(openingTag(html, "otp"), /\bdata-slot="otp-field"/);
  assert.match(openingTag(html, "otp"), /\bdir="ltr"/);
  assert.match(otpInput, /\bdata-slot="otp-field-input"/);
  assert.match(otpInput, /\binputmode="numeric"/);
  assert.match(otpInput, /\bautocomplete="one-time-code"/);
  assert.match(otpInput, /\btype="text"/);
  assert.match(otpInput, /\baria-describedby="otp-description"/);
  assert.match(openingTag(html, "otp-label"), /\bfor="otp-input"/);

  const serverCells = otpCellsIn(element(html, "otp"));

  assert.equal(serverCells.length, 6);

  for (const cell of serverCells) {
    assert.match(cell.tag, /\baria-hidden="true"/);
    assert.equal(cell.text, "");
  }

  const frozenCells = otpCellsIn(element(html, "otp-frozen"));

  assert.deepEqual(
    frozenCells.map((cell) => cell.text),
    ["4", "8", "2", "9", "1", "3"],
  );

  for (const cell of frozenCells) {
    assert.match(cell.tag, /\sdata-filled=/);
  }

  assert.match(openingTag(html, "otp-frozen-input"), /\sreadonly[\s=>]/);
  assert.match(openingTag(html, "otp-pin-input"), /\btype="password"/);
  assert.match(openingTag(html, "otp-pin-input"), /\bautocomplete="current-password"/);

  const pinCells = otpCellsIn(element(html, "otp-pin"));

  assert.deepEqual(
    pinCells.map((cell) => cell.text),
    ["", "", "", ""],
  );
  assert.doesNotMatch(element(html, "otp-pin"), /\bdata-slot="otp-field-dot"/);
  assert.match(openingTag(html, "otp-locked-input"), /\sdisabled[\s=>]/);

  // Each cell's state and look, in order.
  const otpCells = (id) =>
    page.evaluate((id) => {
      const result = [];

      for (const cell of document.querySelectorAll(`#${id} > [data-slot=otp-field-cell]`)) {
        const style = getComputedStyle(cell);

        result.push({
          text: cell.textContent.trim(),
          filled: cell.hasAttribute("data-filled"),
          caret: cell.hasAttribute("data-caret"),
          selected: cell.hasAttribute("data-selected"),
          border: style.borderTopColor,
          borderStyle: style.borderTopStyle,
          background: style.backgroundColor,
          color: style.color,
          bar: cell.querySelector("[data-slot=otp-field-caret]") !== null,
          dot: cell.querySelector("[data-slot=otp-field-dot]")
            ? getComputedStyle(cell.querySelector("[data-slot=otp-field-dot]")).backgroundColor
            : null,
        });
      }

      return result;
    }, id);
  const otpCell = (id, index) => page.locator(`#${id} > [data-slot=otp-field-cell]`).nth(index);
  // A click at a cell's center lands on the input over it, which maps it to that cell.
  const clickOtpCell = async (id, index) => {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();

    const box = await otpCell(id, index).boundingBox();

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  const hoverOtpCell = async (id, index) => {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();

    const box = await otpCell(id, index).boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  };
  // Copies `text` through a scratch textarea, which then goes, leaving focus on the body.
  const copyText = async (text) => {
    await page.evaluate((text) => {
      const scratch = document.createElement("textarea");

      scratch.id = "otp-clipboard";
      scratch.value = text;
      document.body.append(scratch);
      scratch.focus();
      scratch.select();
    }, text);
    await page.keyboard.press("ControlOrMeta+c");
    await page.evaluate(() => document.getElementById("otp-clipboard").remove());
  };
  const blurOtp = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(0, 0);
    await rendered();
  };
  const otpInputColor = "rgb(107, 107, 104)";
  const otpSurface = "rgb(28, 28, 28)";

  await fresh();

  // Geometry: 40px cells 8px apart, the row as wide as its cells inside a wider Field column and
  // the input exactly over it; the 18px semibold tabular digit; 48px cells through the variable;
  // left to right under an RTL parent.
  const otpGeometry = await page.evaluate(() => {
    const rect = (element) => element.getBoundingClientRect();
    const cells = (id) => [...document.querySelectorAll(`#${id} > [data-slot=otp-field-cell]`)];
    const row = (id) => {
      const list = cells(id);
      const sizes = [];
      const gaps = [];

      for (const [index, cell] of list.entries()) {
        sizes.push(`${rect(cell).width}x${rect(cell).height}`);

        if (index > 0) {
          gaps.push(rect(cell).left - rect(list[index - 1]).right);
        }
      }

      const root = rect(document.getElementById(id));
      const input = rect(document.querySelector(`#${id} > input`));

      return {
        sizes,
        gaps,
        width: root.width,
        overlay:
          input.left === root.left &&
          input.top === root.top &&
          input.width === root.width &&
          input.height === root.height,
      };
    };
    const digit = getComputedStyle(cells("otp-frozen")[0]);
    const rtl = cells("otp-rtl");

    return {
      dpr: window.devicePixelRatio,
      column: rect(document.getElementById("otp-field-wrap")).width,
      otp: row("otp"),
      large: row("otp-large"),
      narrow: row("otp-narrow"),
      narrowWrap: rect(document.getElementById("otp-narrow-wrap")).width,
      inputFont: getComputedStyle(document.getElementById("otp-input")).fontSize,
      digit: {
        size: digit.fontSize,
        weight: digit.fontWeight,
        numeric: digit.fontVariantNumeric,
        radius: digit.borderTopLeftRadius,
      },
      rtl: {
        first: rtl[0].textContent.trim(),
        leftmost: rect(rtl[0]).left < rect(rtl[5]).left,
        dir: document.getElementById("otp-rtl").getAttribute("dir"),
      },
    };
  });

  assert.equal(otpGeometry.dpr, 1);
  assert.ok(otpGeometry.column > 300, `the Field column is ${otpGeometry.column}px`);
  assert.deepEqual(otpGeometry.otp, {
    sizes: Array(6).fill("40x40"),
    gaps: Array(5).fill(8),
    width: 280,
    overlay: true,
  });
  assert.deepEqual(otpGeometry.large, {
    sizes: Array(6).fill("48x48"),
    gaps: Array(5).fill(8),
    width: 328,
    overlay: true,
  });
  assert.deepEqual(otpGeometry.digit, {
    size: "18px",
    weight: "600",
    numeric: "tabular-nums",
    radius: "10px",
  });
  assert.deepEqual(otpGeometry.rtl, { first: "4", leftmost: true, dir: "ltr" });
  // iOS Safari zooms on focus into an input whose text is under 16px.
  assert.equal(otpGeometry.inputFont, "16px");

  // In a container narrower than six 40px cells (248px, a Dialog's body on a 320px phone) the
  // row takes the container's width and the cells shrink equally, square, with 8px gaps.
  const narrowCell = (248 - 5 * 8) / 6;

  assert.equal(otpGeometry.narrowWrap, 248);
  assert.equal(otpGeometry.narrow.width, 248);
  assert.equal(otpGeometry.narrow.overlay, true);
  assert.deepEqual(otpGeometry.narrow.gaps.map(Math.round), Array(5).fill(8));

  for (const size of otpGeometry.narrow.sizes) {
    const [width, height] = size.split("x").map(Number);

    assert.ok(Math.abs(width - narrowCell) <= 0.5, `a narrow cell is ${size}`);
    assert.ok(Math.abs(height - width) <= 0.5, `a narrow cell is ${size}`);
  }

  // A click 1px inside either edge of a shrunk cell still selects that cell's digit.
  for (const [index, edge] of [
    [0, "left"],
    [2, "right"],
    [3, "left"],
    [5, "right"],
  ]) {
    await page.locator("#otp-narrow").scrollIntoViewIfNeeded();

    const box = await otpCell("otp-narrow", index).boundingBox();
    const x = edge === "left" ? box.x + 1 : box.x + box.width - 1;

    await page.mouse.click(x, box.y + box.height / 2);
    await rendered();
    assert.deepEqual(
      await page.evaluate(() => {
        const input = document.getElementById("otp-narrow-input");

        return [input.selectionStart, input.selectionEnd];
      }),
      [index, index + 1],
      `a click inside cell ${index}'s ${edge} edge`,
    );
  }

  await blurOtp();

  // Typing: the label focuses the input and the row shows the ring; the caret cell has the ring
  // border and, while empty, the 1×18 bar; a full code has no caret cell but keeps the ring, and
  // its valueChange sees it complete.
  await page.click("#otp-label");
  assert.equal(await activeId(), "otp-input");
  await rendered();
  assert.deepEqual(await outline("#otp"), ringOutline(darkRing));

  let cells = await otpCells("otp");

  assert.deepEqual(
    [cells[0].caret, cells[0].border, cells[0].bar],
    [true, darkRing, true],
    "the first cell has the caret",
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const bar = document.querySelector("#otp [data-slot=otp-field-caret]");
      const box = bar.getBoundingClientRect();

      return { size: `${box.width}x${box.height}`, color: getComputedStyle(bar).backgroundColor };
    }),
    { size: "1x18", color: foreground },
  );

  await page.keyboard.type("482");
  await rendered();
  cells = await otpCells("otp");
  assert.deepEqual(
    cells.map((cell) => cell.text),
    ["4", "8", "2", "", "", ""],
  );
  assert.deepEqual(
    cells.map((cell) => cell.caret),
    [false, false, false, true, false, false],
  );
  assert.equal(cells[3].border, darkRing);
  assert.equal(cells[3].bar, true);
  assert.equal(cells[0].border, otpInputColor);

  await page.keyboard.type("913");
  await untilText("otp-verified", "482913");
  await rendered();
  cells = await otpCells("otp");
  assert.equal(cells.filter((cell) => cell.caret || cell.bar).length, 0, "no caret cell");
  assert.deepEqual(await outline("#otp"), ringOutline(darkRing));

  // Paste: a whole code, with its space, replaces the code.
  await copyText("987 654");
  await page.focus("#otp-input");
  await page.keyboard.press("ControlOrMeta+v");
  await untilValue("otp-input", "987654");
  await untilText("otp-verified", "987654");

  // A click on a filled cell selects its digit with the neutral 8% tint; typing replaces it.
  const otpTint = await page.evaluate(() => {
    const probe = document.createElement("span");

    probe.style.backgroundColor = "color-mix(in oklab, var(--foreground) 8%, transparent)";
    document.getElementById("otps").append(probe);

    const color = getComputedStyle(probe).backgroundColor;

    probe.remove();

    return color;
  });

  await clickOtpCell("otp", 2);
  await rendered();
  cells = await otpCells("otp");
  assert.deepEqual(
    cells.map((cell) => cell.selected),
    [false, false, true, false, false, false],
  );
  assert.equal(cells[2].background, otpTint);
  assert.notEqual(otpTint, otpSurface);
  assert.equal(cells[2].color, foreground);
  // The tint is faint, so the selected cell's foreground border tells which digit typing replaces.
  assert.equal(cells[2].border, foreground);
  await page.keyboard.type("0");
  await untilValue("otp-input", "980654");
  await untilText("otp-verified", "980654");

  // Masked: four typed digits are four 8px foreground dots, with no digit anywhere in the row.
  await page.click("#otp-pin-input");
  await page.keyboard.type("1234");
  await untilText("otp-pin-value", "4");
  await rendered();
  assert.deepEqual(
    await page.evaluate(() => {
      const sizes = [];

      for (const dot of document.querySelectorAll("#otp-pin [data-slot=otp-field-dot]")) {
        const box = dot.getBoundingClientRect();

        sizes.push(`${box.width}x${box.height}`);
      }

      return { sizes, text: document.getElementById("otp-pin").textContent.trim() };
    }),
    { sizes: Array(4).fill("8x8"), text: "" },
  );

  for (const cell of await otpCells("otp-pin")) {
    assert.equal(cell.dot, foreground);
    assert.equal(cell.text, "");
  }

  // Autofill, in both themes: with Chromium's :autofill forced on the masked PIN, the browser's
  // !important autofill background and text color paint nothing over the cells and dots.
  const otpCdp = await page.context().newCDPSession(page);

  await otpCdp.send("DOM.enable");
  await otpCdp.send("CSS.enable");

  const { root: documentNode } = await otpCdp.send("DOM.getDocument");
  const { nodeId: pinNode } = await otpCdp.send("DOM.querySelector", {
    nodeId: documentNode.nodeId,
    selector: "#otp-pin-input",
  });
  const autofillLook = () =>
    page.evaluate(() => {
      const input = document.getElementById("otp-pin-input");
      const style = getComputedStyle(input);

      return {
        autofill: input.matches(":autofill"),
        opacity: style.opacity,
        fill: style.webkitTextFillColor,
      };
    });
  // The largest difference of any channel of any pixel between two same-sized PNGs, out of 255.
  // Switching the input's opacity can re-rasterize the cells' anti-aliased edges by a level or
  // two, while the browser's autofill paint shifts the whole row by tens.
  const pixelDifference = (first, second) =>
    page.evaluate(
      async ([first, second]) => {
        const pixels = async (base64) => {
          const image = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${base64}`)).blob(),
          );
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext("2d");

          context.drawImage(image, 0, 0);

          return context.getImageData(0, 0, image.width, image.height).data;
        };
        const [a, b] = await Promise.all([pixels(first), pixels(second)]);

        if (a.length !== b.length) {
          return Infinity;
        }

        let largest = 0;

        for (let index = 0; index < a.length; index++) {
          largest = Math.max(largest, Math.abs(a[index] - b[index]));
        }

        return largest;
      },
      [first.toString("base64"), second.toString("base64")],
    );

  for (const theme of ["dark", "light"]) {
    if (theme === "light") {
      await page.evaluate(() =>
        document.getElementById("otp-pin").parentElement.classList.add("light", "bg-background"),
      );
    }

    await blurOtp();

    const before = await shot("#otp-pin");

    await otpCdp.send("CSS.forcePseudoState", {
      nodeId: pinNode,
      forcedPseudoClasses: ["autofill"],
    });
    assert.deepEqual(
      await autofillLook(),
      { autofill: true, opacity: "0", fill: "rgba(0, 0, 0, 0)" },
      `${theme} autofilled`,
    );
    const autofilled = await pixelDifference(before, await shot("#otp-pin"));

    assert.ok(
      autofilled <= 2,
      `${theme}: autofill paints nothing, but a pixel moved ${autofilled}`,
    );
    await otpCdp.send("CSS.forcePseudoState", { nodeId: pinNode, forcedPseudoClasses: [] });
    assert.deepEqual(
      await autofillLook(),
      { autofill: false, opacity: "1", fill: "rgba(0, 0, 0, 0)" },
      `${theme} not autofilled`,
    );
    const after = await pixelDifference(before, await shot("#otp-pin"));

    assert.ok(after <= 2, `${theme}: unchanged after autofill, but a pixel moved ${after}`);
  }

  await otpCdp.detach();

  // Validation, from a fresh page: Save on an empty code shows the error, marks the input invalid
  // and focuses it; the caret cell keeps its ring border and the others turn orange, all six once
  // focus leaves; five digits keep the pattern error and the sixth clears it.
  await fresh();
  await page.click("#otp-save");
  await page.waitForSelector("#otp-error");
  assert.equal(await textOf("otp-error"), "Enter the code");
  assert.equal(await attribute("otp-input", "aria-invalid"), "true");
  await until("otp-input", "aria-describedby", "otp-description otp-error");
  await page.waitForFunction(() => document.activeElement?.id === "otp-input");
  await page.mouse.move(0, 0);
  await rendered();
  cells = await otpCells("otp");
  assert.deepEqual(
    cells.map((cell) => cell.border),
    [darkRing, ...Array(5).fill(darkOrange)],
  );
  assert.equal(await textOf("otp-saves"), "0");
  await blurOtp();
  assert.deepEqual(
    (await otpCells("otp")).map((cell) => cell.border),
    Array(6).fill(darkOrange),
  );

  await page.click("#otp-label");
  await page.keyboard.type("12345");
  await untilText("otp-error", "Enter all 6 digits");
  await page.keyboard.type("6");
  await page.waitForSelector("#otp-error", { state: "detached" });
  await untilAbsent("otp-input", "aria-invalid");
  await page.click("#otp-save");
  await untilText("otp-saves", "1");

  // States, from a fresh page: hover darkens every border but the caret cell's ring; disabled is
  // dimmed, unhovered and unchanged by keys and paste; readonly is dashed and unfilled, selects a
  // cell but keeps its code; both themes use their tokens.
  await fresh();
  await page.mouse.move(0, 0);
  cells = await otpCells("otp");

  for (const cell of cells) {
    assert.deepEqual(
      [cell.border, cell.background, cell.color],
      [otpInputColor, otpSurface, foreground],
      "a resting cell",
    );
  }

  await page.click("#otp-label");
  await hoverOtpCell("otp", 2);
  await rendered();
  cells = await otpCells("otp");
  assert.equal(cells[0].border, darkRing, "a hovered caret cell keeps its ring border");

  for (const cell of cells.slice(1)) {
    assert.notEqual(cell.border, otpInputColor, "hover changes the border");
    assert.equal(cell.border, cells[1].border);
  }

  await blurOtp();

  assert.deepEqual(await styleOf("#otp-locked", ["opacity", "cursor"]), {
    opacity: "0.5",
    cursor: "not-allowed",
  });
  await hoverOtpCell("otp-locked", 1);
  await rendered();

  for (const cell of await otpCells("otp-locked")) {
    assert.equal(cell.border, otpInputColor, "a disabled row doesn't hover");
  }

  await copyText("123456");
  await page.click("#otp-locked-input", { force: true });
  await page.keyboard.type("9");
  await page.keyboard.press("ControlOrMeta+v");
  await rendered();
  assert.notEqual(await activeId(), "otp-locked-input");
  assert.equal(await valueOf("otp-locked-input"), "482");
  assert.deepEqual(
    (await otpCells("otp-locked")).map((cell) => cell.text),
    ["4", "8", "2", "", "", ""],
  );

  for (const cell of await otpCells("otp-frozen")) {
    assert.deepEqual([cell.borderStyle, cell.background], ["dashed", "rgba(0, 0, 0, 0)"]);
  }

  await clickOtpCell("otp-frozen", 1);
  await rendered();
  assert.equal(await activeId(), "otp-frozen-input");
  assert.deepEqual(await outline("#otp-frozen"), ringOutline(darkRing));
  assert.deepEqual(
    await page.evaluate(() => {
      const input = document.getElementById("otp-frozen-input");

      return [input.selectionStart, input.selectionEnd];
    }),
    [1, 2],
  );
  cells = await otpCells("otp-frozen");
  assert.deepEqual(
    cells.map((cell) => cell.selected),
    [false, true, false, false, false, false],
  );
  assert.equal(cells[1].background, otpTint);
  assert.equal(cells[1].border, foreground);
  await page.keyboard.type("0");
  await page.keyboard.press("ControlOrMeta+v");
  await rendered();
  assert.equal(await valueOf("otp-frozen-input"), "482913");

  for (const cell of await otpCells("otp-light")) {
    assert.deepEqual(
      [cell.border, cell.background, cell.color],
      ["rgb(133, 133, 129)", "rgb(247, 247, 246)", "rgb(27, 27, 27)"],
      "a light cell",
    );
  }

  await page.focus("#otp-light-input");
  assert.deepEqual(await outline("#otp-light"), ringOutline(lightRing));
  assert.equal((await otpCells("otp-light")).find((cell) => cell.caret)?.border, lightRing);

  // Reduced motion removes the cells' transitions.
  const cellTransition = async () =>
    (await styleOf("#otp > [data-slot=otp-field-cell]", ["transitionDuration"])).transitionDuration;

  assert.equal(await cellTransition(), "0s");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(await cellTransition(), "0.12s");
  await page.emulateMedia({ reducedMotion: "reduce" });

  // Forced colors, from a fresh page: cells are Canvas with CanvasText borders and text at rest,
  // hovered and invalid; the caret border and the selection are Highlight; readonly stays dashed;
  // disabled is GrayText; the row's ring is drawn, and the overlay paints nothing.
  await page.emulateMedia({ forcedColors: "active" });
  await fresh();
  await page.mouse.move(0, 0);

  const otpSystem = await page.evaluate(() => {
    const probe = document.createElement("span");
    const read = (property, value) => {
      probe.style.cssText = `position: fixed; forced-color-adjust: none; ${property}: ${value}`;

      return getComputedStyle(probe)[property === "color" ? "color" : "backgroundColor"];
    };

    document.body.append(probe);

    const result = {
      canvas: read("background", "Canvas"),
      canvasText: read("color", "CanvasText"),
      highlight: read("background", "Highlight"),
      highlightText: read("color", "HighlightText"),
      grayText: read("color", "GrayText"),
    };

    probe.remove();

    return result;
  });
  const assertForcedRest = (cells, name) => {
    for (const [index, cell] of cells.entries()) {
      assert.deepEqual(
        [cell.border, cell.background, cell.color],
        [otpSystem.canvasText, otpSystem.canvas, otpSystem.canvasText],
        `${name} cell ${index}`,
      );
    }
  };

  assertForcedRest(await otpCells("otp"), "forced rest");
  await hoverOtpCell("otp", 2);
  await rendered();
  assertForcedRest(await otpCells("otp"), "forced hover");
  await page.mouse.move(0, 0);

  await page.click("#otp-save");
  await page.waitForSelector("#otp-error");
  await page.waitForFunction(() => document.activeElement?.id === "otp-input");
  await rendered();
  cells = await otpCells("otp");
  assert.equal(cells[0].border, otpSystem.highlight, "the forced caret border");
  assertForcedRest(cells.slice(1), "forced invalid");
  await blurOtp();
  assertForcedRest(await otpCells("otp"), "forced invalid, blurred");

  await page.click("#otp-label");
  await page.keyboard.type("482913");
  await untilText("otp-verified", "482913");
  await clickOtpCell("otp", 2);
  await rendered();
  cells = await otpCells("otp");
  assert.deepEqual(
    [cells[2].selected, cells[2].background, cells[2].color],
    [true, otpSystem.highlight, otpSystem.highlightText],
  );
  assertForcedRest([...cells.slice(0, 2), ...cells.slice(3)], "forced unselected");

  await page.click("#otp-pin-input");
  await page.keyboard.type("1234");
  await untilText("otp-pin-value", "4");
  await clickOtpCell("otp-pin", 1);
  await rendered();
  assert.deepEqual(
    (await otpCells("otp-pin")).map((cell) => cell.dot),
    [otpSystem.canvasText, otpSystem.highlightText, otpSystem.canvasText, otpSystem.canvasText],
  );

  await blurOtp();

  for (const cell of await otpCells("otp-frozen")) {
    assert.deepEqual(
      [cell.border, cell.borderStyle, cell.background],
      [otpSystem.canvasText, "dashed", otpSystem.canvas],
    );
  }

  for (const cell of await otpCells("otp-locked")) {
    assert.deepEqual([cell.border, cell.color], [otpSystem.grayText, otpSystem.grayText]);
  }

  await page.focus("#otp-input");

  const forcedOtpRing = await outline("#otp");

  assert.deepEqual([forcedOtpRing.style, forcedOtpRing.width], ["solid", "2px"]);
  assert.match(forcedOtpRing.color, /^rgb\(/, "the forced ring is opaque");
  assert.deepEqual(
    await styleOf("#otp-input", ["color", "webkitTextFillColor", "forcedColorAdjust"]),
    {
      color: "rgba(0, 0, 0, 0)",
      webkitTextFillColor: "rgba(0, 0, 0, 0)",
      forcedColorAdjust: "none",
    },
  );
  await page.emulateMedia({ forcedColors: "none" });

  // Select and Combobox. Exact geometry and outline widths are DPR-1 values.
  //
  // Server rendering: the Trigger and the Input carry their roles, names, Field wiring and state,
  // with decorative markup hidden; every list is closed, inert and out of the Tab order.
  const tagsIn = (markup, name) => markup.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];
  const textIn = (markup) =>
    markup
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  // Tailwind's shadow-none computes to transparent layers rather than none.
  const shadowless = (value) =>
    value === "none" ||
    value.split(/,\s*(?![^()]*\))/).every((layer) => layer.startsWith("rgba(0, 0, 0, 0)"));
  // A computed background that paints nothing: transparent, or any colour at zero alpha.
  const transparent = (value) =>
    value === "transparent" || /^rgba\(.*,\s*0\)$/.test(value) || /\/\s*0\)$/.test(value);
  const statusTrigger = openingTag(html, "status-trigger");
  const statusContent = openingTag(html, "status-content");

  assert.match(statusTrigger, /\brole="combobox"/);
  assert.match(statusTrigger, /\btype="button"/);
  assert.match(statusTrigger, /\baria-expanded="false"/);
  assert.match(statusTrigger, /\baria-controls="status-content"/);
  assert.match(statusTrigger, /\bdata-placeholder=""/);
  assert.match(statusTrigger, /\baria-labelledby="status-label"/);
  assert.match(statusTrigger, /\bdata-slot="select-trigger"/);
  assert.equal(textIn(element(html, "status-trigger")), "Choose a status");
  assert.ok(
    tagsIn(element(html, "status-trigger"), "svg").some(
      (tag) => tag.includes('aria-hidden="true"') && tag.includes('data-slot="select-icon"'),
    ),
    "the trigger's chevron is hidden",
  );
  assert.match(statusContent, /\brole="listbox"/);
  assert.match(statusContent, /\bpopover="manual"/);
  assert.match(statusContent, /\sinert[\s=>]/);
  assert.match(statusContent, /\baria-labelledby="[^"]+"/);
  assert.match(statusContent, /\btabindex="-1"/);
  assert.match(statusContent, /\bdata-slot="select-content"/);
  assert.match(openingTag(html, "planet-content"), /\btabindex="-1"/);
  assert.match(openingTag(html, "planet-content"), /\bdata-slot="combobox-content"/);
  assert.match(openingTag(html, "scrolling-planet-content"), /\btabindex="-1"/);

  // Each scrolling surface renders a ScrollArea whose viewport has its final tabindex on the
  // server: -1 in the lists and menus, the authored 0 in the text Popover, and none in an
  // interactive Popover or a Dialog or Sheet body.
  const viewportTag = (id) => {
    const start = html.indexOf(openingTag(html, id));
    const match = /<div\b[^>]*\bdata-slot="scroll-area-viewport"[^>]*>/.exec(html.slice(start));

    assert.ok(match, `the server HTML has no viewport after #${id}`);

    return match[0];
  };

  for (const id of [
    "status-content",
    "country-content",
    "planet-content",
    "scrolling-planet-content",
    "country-search-content",
    "menu-row-content",
    "menu-long-content",
    "menu-long-sub-content",
  ]) {
    assert.match(viewportTag(id), /\btabindex="-1"/, `${id}'s viewport`);
  }

  assert.match(openingTag(html, "country-search-content"), /\btabindex="-1"/);
  assert.match(viewportTag("notes-content"), /\btabindex="0"/);

  for (const id of [
    "scrollform-content",
    "filters-content",
    "dialog-content",
    "long-dialog",
    "sheet-content",
    "long-sheet",
  ]) {
    assert.doesNotMatch(viewportTag(id), /\stabindex=/, `${id}'s viewport`);
  }
  assert.equal(textIn(element(html, "country-trigger")), "Greece");
  assert.doesNotMatch(openingTag(html, "country-trigger"), /\sdata-placeholder[\s=>]/);
  assert.match(openingTag(html, "country-gr"), /\baria-selected="true"/);
  assert.match(openingTag(html, "status-paused"), /\baria-disabled="true"/);
  assert.match(openingTag(html, "status-paused"), /\bdata-disabled=""/);
  assert.match(openingTag(html, "status-draft"), /\bdata-slot="select-option"/);
  assert.ok(
    tagsIn(element(html, "status-draft"), "svg").some(
      (tag) =>
        tag.includes('aria-hidden="true"') && tag.includes('data-slot="select-option-indicator"'),
    ),
    "the option's check is hidden",
  );
  assert.match(openingTag(html, "locked-status-trigger"), /\sdisabled[\s=>]/);
  assert.match(openingTag(html, "locked-status-trigger"), /\bdata-disabled=""/);
  assert.match(openingTag(html, "frozen-status-trigger"), /\baria-readonly="true"/);

  const planetInput = openingTag(html, "planet-input");
  const planetTrigger = openingTag(html, "planet-trigger");

  assert.match(planetInput, /\brole="combobox"/);
  assert.match(planetInput, /\baria-autocomplete="list"/);
  assert.match(planetInput, /\bautocomplete="off"/);
  assert.match(planetInput, /\bdata-slot="combobox-input"/);
  assert.match(openingTag(html, "planet-label"), /\bfor="planet-input"/);
  assert.match(planetTrigger, /\btabindex="-1"/);
  assert.match(planetTrigger, /\baria-label="All planets"/);
  assert.match(planetTrigger, /\bdata-slot="combobox-trigger"/);
  assert.match(openingTag(html, "frozen-planet-input"), /\sreadonly[\s=>]/);
  assert.match(openingTag(html, "frozen-planet-input"), /\bvalue="Mercury"/);
  assert.equal(textIn(element(html, "status-touched")), "false");
  assert.equal(textIn(element(html, "planet-touched")), "false");
  assert.doesNotMatch(element(html, "lists"), /\bdata-slot="field-error"/);

  // Before hydration, CSS alone draws the server state: the lists are hidden, the placeholder is
  // muted, and the readonly and disabled triggers look it.
  const listsPrerendered = await browser.newPage({
    javaScriptEnabled: false,
    deviceScaleFactor: 1,
  });

  await listsPrerendered.goto(base);
  const { frozenShadow, ...listsServerLook } = await listsPrerendered.evaluate(() => {
    const style = (id) => getComputedStyle(document.getElementById(id));
    const frozen = style("frozen-status-trigger");

    return {
      statusList: document.getElementById("status-content").checkVisibility(),
      planetList: document.getElementById("planet-content").checkVisibility(),
      placeholder: style("status-trigger").color,
      filled: style("country-trigger").color,
      frozen: `${frozen.borderTopStyle} ${frozen.backgroundColor}`,
      frozenShadow: frozen.boxShadow,
      locked: style("locked-status-trigger").opacity,
    };
  });

  await listsPrerendered.close();
  assert.deepEqual(listsServerLook, {
    statusList: false,
    planetList: false,
    placeholder: "rgb(163, 163, 160)",
    filled: foreground,
    frozen: "dashed rgba(0, 0, 0, 0)",
    locked: "0.5",
  });
  assert.ok(shadowless(frozenShadow), `the readonly trigger's shadow: ${frozenShadow}`);

  // A list is shown once it's in the top layer, placed and fully opaque (Origami holds it
  // transparent while it measures); it's hidden once it leaves the top layer.
  const shown = (id) =>
    page.waitForFunction((id) => {
      const list = document.getElementById(id);

      return (
        list.matches(":popover-open") &&
        list.hasAttribute("data-present") &&
        getComputedStyle(list).opacity === "1"
      );
    }, id);
  const hidden = (id) =>
    page.waitForFunction((id) => !document.getElementById(id).matches(":popover-open"), id);
  const rectOf = (selector) =>
    page.evaluate((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();

      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    }, selector);
  const near = (actual, expected, tolerance, label) =>
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `${label}: ${actual} isn't within ${tolerance} of ${expected}`,
    );
  const hasAttribute = (id, name) =>
    page.evaluate(([id, name]) => document.getElementById(id).hasAttribute(name), [id, name]);
  const optionIds = (id) =>
    page.evaluate((id) => {
      const ids = [];

      for (const option of document.querySelectorAll(`#${id} [role=option]`)) {
        ids.push(option.id);
      }

      return ids;
    }, id);
  const activeOptions = (id) =>
    page.evaluate((id) => {
      const ids = [];

      for (const option of document.querySelectorAll(`#${id} [data-active]`)) {
        ids.push(option.id);
      }

      return ids;
    }, id);
  const darkInput = "rgb(107, 107, 104)";
  const darkSurface = "rgb(28, 28, 28)";
  const darkBorder = "rgb(46, 46, 46)";

  await fresh();
  assert.equal(await page.evaluate(() => window.devicePixelRatio), 1);

  // Geometry: the Select Trigger is Input's box plus the soft edge, its text starts where the
  // Input's does, and the chevron sits 11px inside its end; the Combobox input is 32px tall with
  // room for its Trigger, which covers its end.
  const listGeometry = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const box = (selector) => {
      const look = style(selector);

      return {
        height: look.height,
        radius: look.borderTopLeftRadius,
        borderWidth: look.borderTopWidth,
        borderColor: look.borderTopColor,
        ground: look.backgroundColor,
      };
    };
    const input = style("#list-plain-input");

    return {
      trigger: box("#status-trigger"),
      input: box("#list-plain-input"),
      triggerShadow: style("#status-trigger").boxShadow,
      inputShadow: input.boxShadow,
      triggerTextInset: rect("#status-trigger > span").left - rect("#status-trigger").left,
      inputTextInset: parseFloat(input.borderLeftWidth) + parseFloat(input.paddingLeft),
      chevron: {
        width: rect("#status-trigger > svg").width,
        height: rect("#status-trigger > svg").height,
        endInset: rect("#status-trigger").right - rect("#status-trigger > svg").right,
      },
      planetHeight: style("#planet-input").height,
      planetEndPadding: style("#planet-input").paddingInlineEnd,
      customerEndPadding: style("#customer-input").paddingInlineEnd,
      planetTrigger: {
        width: rect("#planet-trigger").width,
        height: rect("#planet-trigger").height,
        endOffset: rect("#planet-input").right - rect("#planet-trigger").right,
      },
    };
  });

  assert.deepEqual(listGeometry.trigger, listGeometry.input, "the trigger's box is Input's");
  assert.equal(listGeometry.trigger.height, "32px");
  assert.equal(listGeometry.trigger.radius, "10px");
  assert.equal(shadowless(listGeometry.triggerShadow), false, "the trigger's soft edge");
  assert.ok(shadowless(listGeometry.inputShadow), "the Input has no edge");
  near(listGeometry.triggerTextInset, listGeometry.inputTextInset, 1, "trigger text start");
  assert.equal(listGeometry.chevron.width, 16);
  assert.equal(listGeometry.chevron.height, 16);
  near(listGeometry.chevron.endInset, 11, 1, "chevron end inset");
  assert.equal(listGeometry.planetHeight, "32px");
  assert.equal(listGeometry.planetEndPadding, "32px");
  assert.equal(listGeometry.customerEndPadding, "10px");
  assert.deepEqual(listGeometry.planetTrigger, { width: 32, height: 32, endOffset: 0 });

  // Select by mouse: the list opens 4px below the Trigger, at least as wide, as Appliance's menu
  // surface; hover highlights enabled options; a click chooses, closes, keeps focus on the Trigger
  // and writes the bound value; the chosen option shows its check.
  await page.click("#status-trigger");
  await until("status-trigger", "aria-expanded", "true");
  await shown("status-content");

  const statusTriggerRect = await rectOf("#status-trigger");
  const statusListRect = await rectOf("#status-content");

  near(statusListRect.top, statusTriggerRect.bottom + 4, 0.5, "list top");
  near(statusListRect.left, statusTriggerRect.left, 0.5, "list start");
  assert.ok(statusListRect.width >= statusTriggerRect.width, "the list is at least as wide");
  assert.deepEqual(
    await styleOf("#status-content", [
      "borderTopLeftRadius",
      "paddingTop",
      "borderTopWidth",
      "borderTopColor",
      "backgroundColor",
    ]),
    {
      borderTopLeftRadius: "12px",
      paddingTop: "4px",
      borderTopWidth: "1px",
      borderTopColor: darkBorder,
      backgroundColor: darkSurface,
    },
  );
  assert.equal(shadowless((await styleOf("#status-content", ["boxShadow"])).boxShadow), false);
  assert.deepEqual(await styleOf("#status-draft", ["height", "borderTopLeftRadius"]), {
    height: "32px",
    borderTopLeftRadius: "6px",
  });

  const restingGround = (await styleOf("#status-active", ["backgroundColor"])).backgroundColor;
  await page.hover("#status-active");
  await page.waitForSelector("#status-active[data-active]");
  const activeGround = (await styleOf("#status-active", ["backgroundColor"])).backgroundColor;
  assert.notEqual(activeGround, restingGround, "a highlighted option's ground changes");
  assert.ok(
    !transparent(activeGround),
    `a highlighted option's ground is painted: ${activeGround}`,
  );
  assert.notEqual(activeGround, darkSurface, "a highlighted option's ground");
  await page.hover("#status-paused");
  await rendered();
  assert.equal(await hasAttribute("status-paused", "data-active"), false);
  assert.equal((await styleOf("#status-paused", ["opacity"])).opacity, "0.5");

  await page.click("#status-active");
  await until("status-trigger", "aria-expanded", "false");
  await hidden("status-content");
  await untilText("status-trigger", "Active");
  assert.equal(await hasAttribute("status-trigger", "data-placeholder"), false);
  assert.equal((await styleOf("#status-trigger", ["color"])).color, foreground);
  assert.equal(await activeId(), "status-trigger");
  await untilText("status-value", "active");

  await page.click("#status-trigger");
  await shown("status-content");
  assert.equal(await hasAttribute("status-active", "data-selected"), true);
  assert.deepEqual(
    await page.evaluate(() => [
      getComputedStyle(document.querySelector("#status-active > svg")).opacity,
      getComputedStyle(document.querySelector("#status-draft > svg")).opacity,
    ]),
    ["1", "0"],
  );
  await page.keyboard.press("Escape");
  await hidden("status-content");

  // Select by keyboard: Tab rings the Trigger; ArrowDown opens on the first enabled option, named
  // by aria-activedescendant; Enter chooses. Arrows skip a disabled option, Escape closes without
  // writing, and typing opens on the match.
  await page.focus("#frozen-status-trigger");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "sort-trigger");
  assert.deepEqual(await outline("#sort-trigger"), ringOutline(darkRing));
  await page.keyboard.press("ArrowDown");
  await shown("sort-content");
  await page.waitForSelector("#sort-newest[data-active]");
  assert.equal(await attribute("sort-trigger", "aria-activedescendant"), "sort-newest");
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector("#sort-oldest[data-active]");
  await page.keyboard.press("Enter");
  await hidden("sort-content");
  await untilText("sort-value", "oldest");

  await page.focus("#status-trigger");
  await page.keyboard.press("ArrowDown");
  await shown("status-content");
  await page.waitForSelector("#status-active[data-active]");
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector("#status-ended[data-active]");
  await page.keyboard.press("Escape");
  await hidden("status-content");
  assert.equal(await textOf("status-value"), "active");
  await page.keyboard.press("d");
  await shown("status-content");
  await page.waitForSelector("#status-draft[data-active]");
  await page.keyboard.press("Escape");
  await hidden("status-content");
  assert.equal(await textOf("status-value"), "active");

  // Readonly and disabled: a readonly Select opens and browses but doesn't choose; a readonly
  // Combobox opens but neither types nor chooses; disabled ones don't open and are dimmed.
  await page.click("#frozen-status-trigger");
  await shown("frozen-status-content");
  await page.hover("#frozen-status-draft");
  await page.waitForSelector("#frozen-status-draft[data-active]");
  await page.click("#frozen-status-draft");
  await rendered();
  assert.equal(await attribute("frozen-status-trigger", "aria-expanded"), "true");
  assert.equal(await textOf("frozen-status-trigger"), "Active");
  await page.keyboard.press("Escape");
  await hidden("frozen-status-content");

  await page.click("#frozen-planet-input");
  await page.keyboard.type("x");
  await rendered();
  assert.equal(await valueOf("frozen-planet-input"), "Mercury", "typing into a readonly Combobox");
  await page.keyboard.press("ArrowDown");
  await shown("frozen-planet-content");
  await page.waitForSelector("#frozen-planet-mercury[data-active]");
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector("#frozen-planet-mars[data-active]");
  await page.keyboard.press("Enter");
  await rendered();
  assert.equal(
    await attribute("frozen-planet-input", "aria-expanded"),
    "true",
    "Enter keeps it open",
  );
  assert.equal(await hasAttribute("frozen-planet-mars", "data-active"), true);
  assert.equal(await valueOf("frozen-planet-input"), "Mercury");
  assert.equal(await textOf("frozen-planet-value"), "1", "a readonly Combobox writes no value");
  await page.keyboard.press("Escape");
  await hidden("frozen-planet-content");
  assert.equal(await valueOf("frozen-planet-input"), "Mercury");
  assert.equal(await textOf("frozen-planet-value"), "1");

  await page.click("#locked-status-trigger", { force: true });
  await rendered();
  assert.equal(await attribute("locked-status-trigger", "aria-expanded"), "false");
  const locked = await styleOf("#locked-status-trigger", ["opacity", "boxShadow", "cursor"]);

  assert.equal(locked.opacity, "0.5");
  assert.equal(locked.cursor, "not-allowed");
  assert.ok(shadowless(locked.boxShadow), `the disabled trigger's shadow: ${locked.boxShadow}`);
  assert.equal((await styleOf("#locked-planet-input", ["opacity"])).opacity, "0.5");
  assert.equal((await styleOf("#locked-planet-trigger", ["opacity"])).opacity, "0.5");

  // A two-line option grows; choosing it puts its label, not the email, in the input and writes
  // the bound value.
  await page.click("#customer-input");
  await page.keyboard.type("a");
  await shown("customer-content");
  assert.ok((await rectOf("#customer-1")).height > 32, "a two-line row grows");
  assert.equal(await hasAttribute("customer-3", "data-disabled"), true);
  await page.click("#customer-1");
  await hidden("customer-content");
  await untilValue("customer-input", "Ada Lovelace");
  await untilText("customer-value", "1");

  // Inside a Dialog: the list paints over it, the first Escape closes only the list, the second
  // the Dialog.
  await page.click("#dialog-trigger");
  await settled("dialog-content");
  await page.click("#dialog-status-trigger");
  await shown("dialog-status-content");
  assert.ok(
    await page.evaluate(() => {
      const list = document.getElementById("dialog-status-content");
      const rect = list.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

      return list.contains(hit);
    }),
    "the list paints over the Dialog",
  );
  await page.keyboard.press("Escape");
  await hidden("dialog-status-content");
  assert.ok(await page.evaluate(() => document.querySelector("#dialog-content").matches(":modal")));
  await page.keyboard.press("Escape");
  await closed("dialog-content");

  // Light theme: inside a light subtree, the trigger and the list use the light tokens.
  assert.deepEqual(
    await styleOf("#light-status-trigger", ["borderTopColor", "backgroundColor", "color"]),
    {
      borderTopColor: "rgb(133, 133, 129)",
      backgroundColor: "rgb(247, 247, 246)",
      color: "rgb(27, 27, 27)",
    },
  );
  await page.click("#light-status-trigger");
  await shown("light-status-content");
  assert.deepEqual(
    await styleOf("#light-status-content", ["borderTopColor", "backgroundColor", "color"]),
    {
      borderTopColor: "rgb(211, 211, 208)",
      backgroundColor: "rgb(247, 247, 246)",
      color: "rgb(27, 27, 27)",
    },
  );
  const lightResting = (await styleOf("#light-status-draft", ["backgroundColor"])).backgroundColor;
  await page.hover("#light-status-draft");
  await page.waitForSelector("#light-status-draft[data-active]");
  const lightActive = (await styleOf("#light-status-draft", ["backgroundColor"])).backgroundColor;
  assert.notEqual(lightActive, lightResting, "a highlighted light option's ground changes");
  assert.ok(!transparent(lightActive), `a highlighted light option's ground: ${lightActive}`);
  assert.notEqual(lightActive, "rgb(247, 247, 246)");
  await page.keyboard.press("Escape");
  await hidden("light-status-content");

  // RTL: the list aligns to the trigger's right edge, and the chevron and the check sit at the
  // left ends.
  await page.click("#rtl-select-trigger");
  await shown("rtl-select-content");

  const rtl = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();

    return {
      listRight: rect("#rtl-select-content").right,
      triggerRight: rect("#rtl-select-trigger").right,
      chevronInset: rect("#rtl-select-trigger > svg").left - rect("#rtl-select-trigger").left,
      chevronBeforeText:
        rect("#rtl-select-trigger > svg").right <= rect("#rtl-select-trigger > span").left,
      checkBeforeText:
        rect("#rtl-select-active > svg").right <= rect("#rtl-select-active > span").left,
    };
  });

  near(rtl.listRight, rtl.triggerRight, 0.5, "RTL list end");
  near(rtl.chevronInset, 11, 1, "RTL chevron inset");
  assert.equal(rtl.chevronBeforeText, true, "the RTL chevron is at the left end");
  assert.equal(rtl.checkBeforeText, true, "the RTL check is at the left end");
  await page.keyboard.press("Escape");
  await hidden("rtl-select-content");

  // Placement, in a 600px viewport: near the viewport's bottom a list opens 4px above; a wide list
  // beside the viewport's end stays inside it.
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.evaluate(() =>
    document.getElementById("country-trigger").scrollIntoView({ block: "center" }),
  );
  await page.focus("#country-trigger");

  await page.evaluate(() => {
    const trigger = document.getElementById("country-trigger").getBoundingClientRect();

    window.scrollBy(0, trigger.bottom - (window.innerHeight - 60));
  });
  await page.keyboard.press("ArrowDown");
  await shown("country-content");
  near(
    (await rectOf("#country-content")).bottom,
    (await rectOf("#country-trigger")).top - 4,
    0.5,
    "flipped list bottom",
  );
  await page.keyboard.press("Escape");
  await hidden("country-content");

  await page.evaluate(() =>
    document.getElementById("edge-select-trigger").scrollIntoView({ block: "center" }),
  );
  await page.click("#edge-select-trigger");
  await shown("edge-select-content");

  const edge = await page.evaluate(() => {
    const list = document.getElementById("edge-select-content").getBoundingClientRect();
    const trigger = document.getElementById("edge-select-trigger").getBoundingClientRect();

    return {
      viewport: document.documentElement.clientWidth,
      triggerRight: trigger.right,
      listRight: list.right,
      startDelta: Math.abs(list.left - trigger.left),
      endDelta: Math.abs(list.right - trigger.right),
    };
  });

  near(edge.triggerRight, edge.viewport, 0.5, "the edge trigger reaches the viewport's end");
  assert.ok(edge.listRight <= edge.viewport + 0.5, `edge list end ${edge.listRight}`);
  assert.ok(Math.min(edge.startDelta, edge.endDelta) <= 0.5, "the edge list aligns to its trigger");
  await page.keyboard.press("Escape");
  await hidden("edge-select-content");
  await page.setViewportSize({ width: 1280, height: 720 });

  // Motion: the list fades and scales in on data-entering and reverses on data-leaving, which
  // Origami waits for. Under reduced motion it doesn't animate, and the first render of the close
  // hides it.
  const watchAnimations = (id, phase) =>
    page.evaluate(
      ([id, phase]) => {
        const list = document.getElementById(id);

        window.listAnimations = undefined;

        const observer = new MutationObserver((records) => {
          let marked = false;

          for (const record of records) {
            if (record.oldValue === null) {
              marked = true;
            }
          }

          if (!marked) {
            return;
          }

          observer.disconnect();

          const animations = [];

          for (const animation of list.getAnimations()) {
            const timing = animation.effect.getTiming();

            animations.push({
              name: animation.animationName,
              duration: timing.duration,
              direction: timing.direction,
            });
          }

          window.listAnimations = animations;
        });

        observer.observe(list, { attributeFilter: [phase], attributeOldValue: true });
      },
      [id, phase],
    );
  const watchedAnimations = async () => {
    const handle = await page.waitForFunction(() => window.listAnimations);

    return handle.jsonValue();
  };

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.focus("#status-trigger");
  await watchAnimations("status-content", "data-entering");
  await page.keyboard.press("ArrowDown");
  assert.deepEqual(await watchedAnimations(), [
    { name: "popup-in", duration: 120, direction: "normal" },
  ]);
  await shown("status-content");
  await watchAnimations("status-content", "data-leaving");
  await page.keyboard.press("Escape");
  assert.deepEqual(await watchedAnimations(), [
    { name: "popup-in", duration: 120, direction: "reverse" },
  ]);
  await hidden("status-content");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await watchAnimations("status-content", "data-entering");
  await page.keyboard.press("ArrowDown");
  assert.deepEqual(await watchedAnimations(), []);
  await shown("status-content");
  await page.evaluate(() => {
    const trigger = document.getElementById("status-trigger");
    const list = document.getElementById("status-content");

    window.hiddenAtClose = undefined;

    const observer = new MutationObserver(() => {
      if (trigger.getAttribute("aria-expanded") !== "false") {
        return;
      }

      observer.disconnect();
      window.hiddenAtClose = !list.matches(":popover-open");
    });

    observer.observe(trigger, { attributeFilter: ["aria-expanded"] });
  });
  await watchAnimations("status-content", "data-leaving");
  await page.keyboard.press("Escape");
  assert.equal(
    await (await page.waitForFunction(() => window.hiddenAtClose !== undefined)).jsonValue(),
    true,
  );
  assert.equal(await page.evaluate(() => window.hiddenAtClose), true, "hidden at the close render");
  assert.equal((await styleOf("#status-trigger", ["transitionDuration"])).transitionDuration, "0s");

  // Touch, per Field, from a fresh page: opening, browsing and Escape leave a field untouched;
  // leaving it marks it touched and shows its error, with the Trigger or input invalid and
  // described by it. A field with a value shows none.
  await fresh();
  await page.focus("#list-plain-input");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "status-trigger");
  assert.equal(await textOf("status-touched"), "false");
  assert.equal(await page.$("#status-error"), null);
  assert.equal(await attribute("status-trigger", "aria-invalid"), null);
  await page.keyboard.press("ArrowDown");
  await shown("status-content");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await hidden("status-content");
  assert.equal(await activeId(), "status-trigger");
  assert.equal(await textOf("status-touched"), "false");
  assert.equal(await page.$("#status-error"), null);

  await page.keyboard.press("Tab");
  await untilText("status-touched", "true");
  await page.waitForSelector("#status-error");
  await untilText("status-error", "Choose a status");
  assert.equal(await attribute("status-trigger", "aria-invalid"), "true");
  assert.equal(
    await attribute("status-trigger", "aria-describedby"),
    "status-description status-error",
  );
  assert.equal((await styleOf("#status-trigger", ["borderTopColor"])).borderTopColor, darkOrange);

  assert.equal(await activeId(), "planet-input");
  await page.keyboard.press("ArrowDown");
  await shown("planet-content");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await hidden("planet-content");
  assert.equal(await textOf("planet-touched"), "false");
  assert.equal(await page.$("#planet-error"), null);
  await page.keyboard.press("Tab");
  await untilText("planet-touched", "true");
  await page.waitForSelector("#planet-error");
  await untilText("planet-error", "Choose a planet");
  assert.equal(await attribute("planet-input", "aria-invalid"), "true");
  assert.equal(
    await attribute("planet-input", "aria-describedby"),
    "planet-description planet-error",
  );
  assert.equal((await styleOf("#planet-input", ["borderTopColor"])).borderTopColor, darkOrange);

  assert.equal(await activeId(), "country-trigger");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "picks-save");
  await untilText("country-touched", "true");
  assert.equal(await attribute("country-trigger", "aria-invalid"), null);

  // Keyboard focus back on the invalid Trigger: the orange border holds under the ring.
  await page.focus("#list-plain-input");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "status-trigger");
  assert.equal((await styleOf("#status-trigger", ["borderTopColor"])).borderTopColor, darkOrange);
  assert.deepEqual(await outline("#status-trigger"), ringOutline(darkRing));

  await page.click("#focus-status");
  assert.equal(await activeId(), "status-trigger");
  await page.click("#focus-planet");
  assert.equal(await activeId(), "planet-input");

  // One Save click after a blur error, from a fresh page: the press on Save blurs the empty
  // Planet, the errors show without moving Save, and the click lands and submits, marking every
  // field touched. Once both have values, one click saves.
  await fresh();
  await page.focus("#planet-input");

  const saveBefore = await rectOf("#picks-save");

  await page.click("#picks-save");
  await page.waitForSelector("#planet-error");
  await untilText("planet-error", "Choose a planet");
  await page.waitForSelector("#status-error");
  await untilText("status-error", "Choose a status");
  assert.equal(await attribute("status-trigger", "aria-invalid"), "true");
  assert.equal(await textOf("pick-saves"), "0");

  const saveAfter = await rectOf("#picks-save");

  near(saveAfter.top, saveBefore.top, 0.5, "Save didn't move");
  near(saveAfter.left, saveBefore.left, 0.5, "Save didn't move sideways");

  await page.click("#status-trigger");
  await shown("status-content");
  await page.click("#status-active");
  await untilText("status-value", "active");
  await page.click("#planet-input");
  await page.keyboard.type("ma");
  await page.waitForSelector("#planet-mars");
  await page.click("#planet-mars");
  await untilText("planet-value", "4");
  await page.click("#picks-save");
  await untilText("pick-saves", "1");

  // Combobox typing, from a fresh page: typing opens on the matches with none highlighted; the
  // arrows highlight and Enter chooses, putting the label in the input and writing the value. No
  // match leaves the list open with the empty row; Escape puts the chosen label back. The Trigger
  // opens every option and leaves focus in the input; hovering it tints the input's border.
  await fresh();
  await page.click("#planet-input");
  await selectAll();
  await page.keyboard.type("ma");
  await until("planet-input", "aria-expanded", "true");
  await shown("planet-content");
  assert.deepEqual(await optionIds("planet-content"), ["planet-mars"]);
  assert.deepEqual(await activeOptions("planet-content"), []);
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector("#planet-mars[data-active]");
  await page.keyboard.press("Enter");
  await hidden("planet-content");
  await untilValue("planet-input", "Mars");
  await untilText("planet-value", "4");

  await selectAll();
  await page.keyboard.type("zzz");
  await shown("planet-content");
  await page.waitForSelector("#planet-empty");
  await untilText("planet-empty", "No planet matches “zzz”.");
  assert.equal(await hasAttribute("planet-content", "data-present"), true);
  await page.keyboard.press("Enter");
  await rendered();
  assert.equal(await textOf("planet-value"), "4");
  await page.keyboard.press("Escape");
  await hidden("planet-content");
  await untilValue("planet-input", "Mars");
  assert.equal(await textOf("planet-value"), "4");

  await page.click("#planet-trigger");
  await shown("planet-content");
  assert.equal((await optionIds("planet-content")).length, 9, "the Trigger shows every planet");
  assert.equal(await activeId(), "planet-input");
  assert.deepEqual(await activeOptions("planet-content"), []);
  await page.keyboard.press("Escape");
  await hidden("planet-content");

  await page.focus("#picks-save");
  await page.mouse.move(0, 0);
  assert.equal((await styleOf("#planet-input", ["borderTopColor"])).borderTopColor, darkInput);
  await page.hover("#planet-trigger");
  assert.notEqual(
    (await styleOf("#planet-input", ["borderTopColor"])).borderTopColor,
    darkInput,
    "hovering the chevron tints the input's border",
  );
  await page.mouse.move(0, 0);

  // Forced colors, from a fresh page: the highlighted option paints Highlight with HighlightText,
  // others Canvas with CanvasText, a disabled one GrayText, and the chosen check CanvasText; text
  // projected into an option follows its row; both controls' focus rings are Highlight.
  await page.emulateMedia({ forcedColors: "active" });
  await fresh();

  const systemColors = await page.evaluate(() => {
    const probe = document.createElement("span");
    const read = (property, value) => {
      probe.style.cssText = `position: fixed; forced-color-adjust: none; ${property}: ${value}`;

      return getComputedStyle(probe)[property === "color" ? "color" : "backgroundColor"];
    };

    document.body.append(probe);

    const result = {
      canvas: read("background", "Canvas"),
      canvasText: read("color", "CanvasText"),
      highlight: read("background", "Highlight"),
      highlightText: read("color", "HighlightText"),
      grayText: read("color", "GrayText"),
    };

    probe.remove();

    return result;
  });
  const colors = (selector) => styleOf(selector, ["backgroundColor", "color"]);

  await page.focus("#list-plain-input");
  await page.keyboard.press("Tab");
  assert.deepEqual(await outline("#status-trigger"), ringOutline(systemColors.highlight));
  await page.keyboard.press("ArrowDown");
  await shown("status-content");
  await page.waitForSelector("#status-draft[data-active]");
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector("#status-active[data-active]");
  assert.deepEqual(await colors("#status-active"), {
    backgroundColor: systemColors.highlight,
    color: systemColors.highlightText,
  });
  assert.deepEqual(await colors("#status-draft"), {
    backgroundColor: systemColors.canvas,
    color: systemColors.canvasText,
  });
  assert.equal((await colors("#status-paused")).color, systemColors.grayText);

  const forcedList = await styleOf("#status-content", ["borderTopWidth", "borderTopColor"]);

  assert.ok(parseFloat(forcedList.borderTopWidth) >= 1, "the forced list has a border");
  assert.match(forcedList.borderTopColor, /^rgb\(/, "the forced list's border is opaque");

  await page.keyboard.press("Enter");
  await hidden("status-content");
  await page.keyboard.press("ArrowDown");
  await shown("status-content");
  await page.waitForSelector("#status-active[data-active]");
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector("#status-ended[data-active]");
  assert.deepEqual(await styleOf("#status-active > svg", ["opacity", "color"]), {
    opacity: "1",
    color: systemColors.canvasText,
  });
  await page.keyboard.press("Escape");
  await hidden("status-content");

  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "planet-input");
  assert.deepEqual(await outline("#planet-input"), ringOutline(systemColors.highlight));

  const emailColor = (id) =>
    styleOf(`#customer-${id}-email`, ["color"]).then((style) => style.color);

  await page.click("#customer-input");
  await page.keyboard.type("a");
  await shown("customer-content");
  assert.equal(await emailColor(1), systemColors.canvasText, "an ordinary row's email");
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector("#customer-1[data-active]");
  assert.equal(await emailColor(1), systemColors.highlightText, "the highlighted row's email");
  assert.equal(await emailColor(3), systemColors.grayText, "a disabled row's email");
  await page.keyboard.press("Escape");
  await hidden("customer-content");
  await page.emulateMedia({ forcedColors: "none" });

  // File field. Exact geometry and outline widths are DPR-1 values.
  //
  // Server rendering: the hidden Input is a file input named by the Field's label, the looks carry
  // their slots and the disabled ones their state; no file or drag-over shows yet.
  const fileButtonInput = openingTag(html, "file-button-input");
  const fileZoneTag = openingTag(html, "file-zone");
  const fileButtonValue = element(html, "file-button-value");

  assert.match(fileButtonInput, /\btype="file"/);
  assert.match(fileButtonInput, /\bclass="[^"]*\bsr-only\b/);
  assert.match(fileButtonInput, /\bdata-slot="file-field-input"/);
  assert.match(fileButtonInput, /\baccept="\.pdf,\.jpg,\.jpeg,\.png"/);
  assert.match(fileButtonInput, /\baria-describedby="[^"]+"/);
  assert.match(openingTag(html, "file-button-label"), /\bfor="file-button-input"/);
  assert.match(openingTag(html, "file-button-root"), /\bdata-slot="file-field"/);
  assert.match(openingTag(html, "file-button"), /\bdata-slot="file-field-button"/);
  assert.match(openingTag(html, "file-button"), /\bclass="[^"]*\bh-8\b/);
  assert.doesNotMatch(openingTag(html, "file-button"), /\sdata-disabled=/);
  assert.match(openingTag(html, "file-locked-button"), /\bdata-disabled=""/);
  assert.match(openingTag(html, "file-locked-button-input"), /\sdisabled[\s=>]/);
  assert.match(openingTag(html, "file-locked-zone-input"), /\sdisabled[\s=>]/);
  assert.match(fileZoneTag, /\bdata-slot="file-field-drop-zone"/);
  assert.doesNotMatch(fileZoneTag, /\sdata-drag-over=/);
  assert.match(openingTag(html, "file-zone-label"), /\bfor="file-zone-input"/);
  assert.ok(
    tagsIn(element(html, "file-zone"), "svg").some(
      (tag) =>
        tag.includes('aria-hidden="true"') && tag.includes('data-slot="file-field-drop-zone-icon"'),
    ),
    "the zone's icon is hidden",
  );
  assert.match(fileButtonValue, /\bdata-slot="file-field-value"/);
  // No file on the server: the value is hidden and holds only its Clear's slot, with the Clear.
  assert.match(openingTag(html, "file-button-value"), /\shidden(="")?[\s>]/);
  assert.doesNotMatch(fileButtonValue, /data-slot="file-field-(value-icon|name|size)"/);
  assert.deepEqual(
    tagsIn(fileButtonValue, "span").map((tag) => /\bdata-slot="([^"]+)"/.exec(tag)?.[1]),
    ["file-field-clear-slot"],
  );
  assert.match(fileButtonValue, /\bid="file-button-clear"/, "the Clear is inside the value");

  // Each FileFieldClear is a native named button, hidden while its field is empty, with a hidden
  // icon; the disabled field's is natively disabled.
  for (const id of [
    "file-button-clear",
    "file-zone-clear",
    "file-locked-button-clear",
    "file-primary-clear",
    "file-narrow-clear",
  ]) {
    const clear = openingTag(html, id);

    assert.match(clear, /\btype="button"/, id);
    assert.match(clear, /\bdata-slot="file-field-clear"/, id);
    assert.match(clear, /\baria-label="Remove the [^"]+"/, id);
    assert.match(clear, /\shidden(="")?[\s>]/, `${id} is hidden while empty`);
    assert.ok(
      tagsIn(element(html, id), "svg").some((tag) => tag.includes('aria-hidden="true"')),
      `${id}'s icon is hidden`,
    );
  }

  assert.match(openingTag(html, "file-locked-button-clear"), /\sdisabled[\s=>]/);
  assert.doesNotMatch(openingTag(html, "file-button-clear"), /\sdisabled[\s=>]/);

  // Chooses a page-made file in an Input, as the picker does: its one file, then `change`.
  const pick = (id, name, size) =>
    page.evaluate(
      ([id, name, size]) => {
        const input = document.getElementById(id);
        const transfer = new DataTransfer();

        transfer.items.add(new File([new Uint8Array(size)], name));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      [id, name, size],
    );
  // A drag event carrying one page-made file, as Origami's Firefox and WebKit acceptance drives
  // the zone; reports whether the page cancelled it. A page-made DataTransfer outside a real drag
  // doesn't keep the dropEffect the zone sets, so that isn't observable here.
  const drag = (selector, type, name = "drop.pdf", size = 2048) =>
    page.evaluate(
      ([selector, type, name, size]) => {
        const transfer = new DataTransfer();

        transfer.items.add(new File([new Uint8Array(size)], name));

        const event = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        });

        document.querySelector(selector).dispatchEvent(event);

        return event.defaultPrevented;
      },
      [selector, type, name, size],
    );
  const chooseFrom = async (selector, file) => {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click(selector)]);
    const input = await chooser.element().evaluate((input) => input.id);

    await chooser.setFiles(file);

    return { input, multiple: chooser.isMultiple() };
  };
  const fileText = (id) =>
    page.evaluate((id) => {
      const value = document.getElementById(id);
      const name = value.querySelector("[data-slot=file-field-name]");

      return {
        name: name?.textContent ?? null,
        title: name?.title ?? null,
        size: value.querySelector("[data-slot=file-field-size]")?.textContent ?? null,
      };
    }, id);
  const untilFileSize = (id, size) =>
    page.waitForFunction(
      ([id, size]) =>
        document.querySelector(`#${id} [data-slot=file-field-size]`)?.textContent === size,
      [id, size],
    );
  const untilPresent = (id, name) =>
    page.waitForFunction(
      ([id, name]) => document.getElementById(id).hasAttribute(name),
      [id, name],
    );
  const MB = 1024 * 1024;

  await fresh();
  assert.equal(await page.evaluate(() => window.devicePixelRatio), 1);

  // Geometry: the button look is fold's secondary Button and the primary one a small primary
  // Button; the zone spans the Field with a 1px dashed input border; the Input is a focusable
  // 1×1 clipped box.
  const fileGeometry = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const look = (selector) => {
      const css = style(selector);

      return {
        height: css.height,
        radius: css.borderTopLeftRadius,
        ground: css.backgroundColor,
        border: `${css.borderTopWidth} ${css.borderTopStyle} ${css.borderTopColor}`,
        shadow: css.boxShadow,
        text: `${css.fontSize} ${css.fontWeight} ${css.color}`,
      };
    };
    const zone = style("#file-zone");
    const input = document.getElementById("file-button-input");

    input.focus();

    return {
      button: look("#file-button"),
      secondary: look("#focus-zoom"),
      primary: look("#file-primary"),
      primaryButton: style("#md").backgroundColor,
      zone: {
        width: rect("#file-zone").width,
        field: rect("#file-zone-field").width,
        border: `${zone.borderTopWidth} ${zone.borderTopStyle} ${zone.borderTopColor}`,
        radius: zone.borderTopLeftRadius,
        ground: zone.backgroundColor,
        padding: zone.paddingTop,
        text: `${zone.fontSize} ${zone.color}`,
        icon: `${rect("#file-zone [data-slot=file-field-drop-zone-icon]").width} ${style("#file-zone [data-slot=file-field-drop-zone-icon]").color}`,
      },
      input: {
        size: `${rect("#file-button-input").width}x${rect("#file-button-input").height}`,
        clip: style("#file-button-input").clipPath,
        focused: document.activeElement === input,
      },
    };
  });

  assert.deepEqual(fileGeometry.button, fileGeometry.secondary, "the button look is a Button");
  assert.equal(fileGeometry.button.height, "32px");
  assert.equal(fileGeometry.primary.height, "28px");
  assert.equal(fileGeometry.primary.ground, fileGeometry.primaryButton);
  const { width: zoneWidth, field: zoneField, ...zoneLook } = fileGeometry.zone;

  assert.ok(Math.abs(zoneWidth - zoneField) <= 0.5, `zone ${zoneWidth} vs field ${zoneField}`);
  assert.deepEqual(zoneLook, {
    border: `1px dashed ${darkInput}`,
    radius: "10px",
    ground: "rgb(28, 28, 28)",
    padding: "24px",
    text: "13px rgb(163, 163, 160)",
    icon: "24 rgb(163, 163, 160)",
  });
  assert.deepEqual(fileGeometry.input, { size: "1x1", clip: "inset(50%)", focused: true });

  // An empty field's FileFieldClear stays hidden even under a responsive display class
  // (`md:inline-flex` on the button look's ×): the native attribute wins.
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.getElementById("file-button-clear")).display,
    ),
    "none",
  );

  // Picks: the button look, the zone and the Field's label each open the picker for their
  // Input; the value shows the name and the size, in 1024-based units with a no-break space.
  assert.deepEqual(
    await chooseFrom("#file-button", {
      name: "report.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(1536),
    }),
    { input: "file-button-input", multiple: false },
  );
  await untilFileSize("file-button-value", "1.5 KB");
  assert.deepEqual(await fileText("file-button-value"), {
    name: "report.pdf",
    title: "report.pdf",
    size: "1.5 KB",
  });
  assert.deepEqual(
    await chooseFrom("#file-zone", { name: "empty.pdf", mimeType: "", buffer: Buffer.alloc(0) }),
    { input: "file-zone-input", multiple: false },
  );
  await untilFileSize("file-zone-value", "0 B");
  assert.deepEqual(
    await chooseFrom("#file-button-label", {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(999),
    }),
    { input: "file-button-input", multiple: false },
  );
  await untilFileSize("file-button-value", "999 B");
  await pick("file-button-input", "scan.pdf", 25 * MB);
  await untilFileSize("file-button-value", "25 MB");
  await pick("file-greek-input", "αναφορά.pdf", 1536);
  await untilFileSize("file-greek-value", "1,5 KB");

  // The value sits 12px after the button look on its row, and 8px under the zone; a 16px muted
  // file icon, the name in foreground body text, the size muted with tabular figures, 6px apart.
  const valueLayout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const middle = (box) => box.top + box.height / 2;
    const part = (slot) => `#file-button-value [data-slot=${slot}]`;

    return {
      afterButton: rect("#file-button-value").left - rect("#file-button").right,
      rowOffset: middle(rect("#file-button-value")) - middle(rect("#file-button")),
      underZone: rect("#file-zone-value").top - rect("#file-zone").bottom,
      icon: `${rect(part("file-field-value-icon")).width} ${style(part("file-field-value-icon")).color}`,
      iconGap: rect(part("file-field-name")).left - rect(part("file-field-value-icon")).right,
      sizeGap: rect(part("file-field-size")).left - rect(part("file-field-name")).right,
      name: `${style(part("file-field-name")).fontSize} ${style(part("file-field-name")).color}`,
      size: `${style(part("file-field-size")).color} ${style(part("file-field-size")).fontVariantNumeric}`,
    };
  });

  assert.ok(Math.abs(valueLayout.afterButton - 12) <= 0.5, `after ${valueLayout.afterButton}`);
  assert.ok(Math.abs(valueLayout.rowOffset) <= 1, `row offset ${valueLayout.rowOffset}`);
  assert.ok(Math.abs(valueLayout.underZone - 8) <= 0.5, `under ${valueLayout.underZone}`);
  assert.ok(Math.abs(valueLayout.iconGap - 6) <= 0.5, `icon gap ${valueLayout.iconGap}`);
  assert.ok(Math.abs(valueLayout.sizeGap - 6) <= 0.5, `size gap ${valueLayout.sizeGap}`);
  assert.equal(valueLayout.icon, "16 rgb(163, 163, 160)");
  assert.equal(valueLayout.name, `13px ${foreground}`);
  assert.equal(valueLayout.size, "rgb(163, 163, 160) tabular-nums");

  // FileFieldClear ends each row inside its value: a 32px ghost × with a 16px muted icon, at least
  // 12px after the size (exactly 12 once the name truncates, below) and centered on the button look
  // or, under the zone, on the value. Its negative margins leave the value 8px under the zone
  // (above) with the × shown, and keep its box clear of the zone's edge.
  const clearLayout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const middle = (box) => box.top + box.height / 2;
    const size = (selector) => `${rect(selector).width}x${rect(selector).height}`;

    return {
      size: size("#file-button-clear"),
      zoneSize: size("#file-zone-clear"),
      ground: style("#file-button-clear").backgroundColor,
      icon: `${rect("#file-button-clear svg").width} ${style("#file-button-clear svg").color}`,
      afterSize:
        rect("#file-button-clear").left -
        rect("#file-button-value [data-slot=file-field-size]").right,
      rowEnd: rect("#file-button-root").right - rect("#file-button-clear").right,
      buttonOffset: middle(rect("#file-button-clear")) - middle(rect("#file-button")),
      zoneAfterSize:
        rect("#file-zone-clear").left - rect("#file-zone-value [data-slot=file-field-size]").right,
      zoneRowEnd: rect("#file-zone-root").right - rect("#file-zone-clear").right,
      zoneOffset: middle(rect("#file-zone-clear")) - middle(rect("#file-zone-value")),
      underZone: rect("#file-zone-clear").top - rect("#file-zone").bottom,
    };
  });

  assert.equal(clearLayout.size, "32x32");
  assert.equal(clearLayout.zoneSize, "32x32");
  assert.equal(clearLayout.ground, "rgba(0, 0, 0, 0)");
  assert.equal(clearLayout.icon, "16 rgb(163, 163, 160)");
  assert.ok(clearLayout.afterSize >= 11.5, `× after ${clearLayout.afterSize}`);
  assert.ok(Math.abs(clearLayout.rowEnd) <= 0.5, `× to the row's end ${clearLayout.rowEnd}`);
  assert.ok(Math.abs(clearLayout.buttonOffset) <= 0.5, `× offset ${clearLayout.buttonOffset}`);
  assert.ok(clearLayout.zoneAfterSize >= 11.5, `zone × ${clearLayout.zoneAfterSize}`);
  assert.ok(Math.abs(clearLayout.zoneRowEnd) <= 0.5, `zone × to the end ${clearLayout.zoneRowEnd}`);
  assert.ok(Math.abs(clearLayout.zoneOffset) <= 0.5, `zone × offset ${clearLayout.zoneOffset}`);
  assert.ok(clearLayout.underZone >= 0, `zone × ${clearLayout.underZone} under the zone`);

  // Under the pointer, the × takes the ghost tint and its icon the foreground.
  await page.hover("#file-zone-clear");

  const clearHover = await styleOf("#file-zone-clear", ["backgroundColor", "color"]);

  assert.match(clearHover.backgroundColor, /\/ 0\.08\)$/, `× tint ${clearHover.backgroundColor}`);
  assert.equal(clearHover.color, foreground);
  await page.mouse.move(0, 0);

  // A long name truncates its stem and keeps its extension, inside the 240px root, with the full
  // name in its title.
  const longName = "a-very-long-statement-of-account-for-november-2026.pdf";

  await pick("file-narrow-input", longName, 25 * MB);
  await untilFileSize("file-narrow-value", "25 MB");

  const longLook = await page.evaluate(() => {
    const root = document.getElementById("file-narrow");
    const value = document.getElementById("file-narrow-value");
    const name = value.querySelector("[data-slot=file-field-name]");
    const [stem, extension] = name.children;
    const middle = (box) => box.top + box.height / 2;

    return {
      root: root.getBoundingClientRect().width,
      rootOverflow: root.scrollWidth - root.clientWidth,
      valueRight: value.getBoundingClientRect().right - root.getBoundingClientRect().right,
      stemClipped: stem.scrollWidth > stem.clientWidth,
      stemEllipsis: getComputedStyle(stem).textOverflow,
      extension: extension.textContent,
      extensionClipped: extension.scrollWidth > extension.clientWidth,
      extensionRight: extension.getBoundingClientRect().right - value.getBoundingClientRect().right,
      // Centered on the button's row, not wrapped under it.
      sameRow:
        Math.abs(
          middle(value.getBoundingClientRect()) -
            middle(document.getElementById("file-narrow-button").getBoundingClientRect()),
        ) <= 1,
      title: name.title,
    };
  });

  const { valueRight, extensionRight, ...longRest } = longLook;

  assert.ok(valueRight <= 0.5, `the value ends ${valueRight}px past the root`);
  assert.ok(extensionRight <= 0.5, `the extension ends ${extensionRight}px past the value`);
  assert.deepEqual(longRest, {
    root: 240,
    rootOverflow: 0,
    stemClipped: true,
    stemEllipsis: "ellipsis",
    extension: ".pdf",
    extensionClipped: false,
    sameRow: true,
    title: longName,
  });

  // With a FileFieldClear, a 220px root wraps the value under the default button look instead of
  // squeezing the name: the stem stays visible, and the × shares the value's line, 12px after the
  // size at the row's end.
  await pick("file-narrow-clear-input", longName, 25 * MB);
  await untilFileSize("file-narrow-clear-value", "25\u00a0MB");

  const narrowClear = await page.evaluate(() => {
    const rect = (id) => document.getElementById(id).getBoundingClientRect();
    const middle = (box) => box.top + box.height / 2;
    const root = document.getElementById("file-narrow-clear-root");
    const value = document.getElementById("file-narrow-clear-value");
    const [stem, extension] = value.querySelector("[data-slot=file-field-name]").children;

    return {
      root: rect("file-narrow-clear-root").width,
      rootOverflow: root.scrollWidth - root.clientWidth,
      stem: stem.getBoundingClientRect().width,
      extensionClipped: extension.scrollWidth > extension.clientWidth,
      underButton: rect("file-narrow-clear-value").top >= rect("file-narrow-clear-button").bottom,
      sameLine:
        Math.abs(middle(rect("file-narrow-clear")) - middle(rect("file-narrow-clear-value"))) <=
        0.5,
      afterSize:
        rect("file-narrow-clear").left -
        value.querySelector("[data-slot=file-field-size]").getBoundingClientRect().right,
      rowEnd: rect("file-narrow-clear-root").right - rect("file-narrow-clear").right,
    };
  });
  const { stem: narrowStem, afterSize, rowEnd, ...narrowRest } = narrowClear;

  assert.ok(narrowStem >= 24, `the stem shows ${narrowStem}px beside the ×`);
  assert.ok(Math.abs(afterSize - 12) <= 0.5, `× ${afterSize}px after the size`);
  assert.ok(Math.abs(rowEnd) <= 0.5, `× ${rowEnd}px from the row's end`);
  assert.deepEqual(narrowRest, {
    root: 220,
    rootOverflow: 0,
    extensionClipped: false,
    underButton: true,
    sameLine: true,
  });

  // What follows the last dot is kept visible only when it's a short extension: a long unbroken
  // suffix, or one with spaces, truncates with the rest of the name and stays inside the root.
  const nameParts = () =>
    page.evaluate(() => {
      const root = document.getElementById("file-narrow");
      const value = document.getElementById("file-narrow-value");
      const name = value.querySelector("[data-slot=file-field-name]");
      const size = value.querySelector("[data-slot=file-field-size]");
      // A split name has a stem and an extension; a whole one is a single text run.
      const [stem = name, extension] = name.children;

      return {
        rootOverflow: root.scrollWidth - root.clientWidth,
        valueRight: value.getBoundingClientRect().right - root.getBoundingClientRect().right,
        // How far the name runs into the size after it.
        nameOverlap: name.getBoundingClientRect().right - size.getBoundingClientRect().left,
        stemClipped: stem.scrollWidth > stem.clientWidth,
        stemWidth: stem.getBoundingClientRect().width,
        extensionClipped: extension ? extension.scrollWidth > extension.clientWidth : null,
        extension: extension?.textContent ?? "",
        stemLeft: stem.getBoundingClientRect().left,
        extensionLeft: extension?.getBoundingClientRect().left ?? null,
        dir: name.getAttribute("dir"),
        text: name.textContent,
        title: name.title,
      };
    });

  for (const [suffixName, size, shown] of [
    [`report.${"w".repeat(45)}`, 1536, "1.5 KB"],
    ["november statement.final version for the client", 2048, "2 KB"],
  ]) {
    await pick("file-narrow-input", suffixName, size);
    await untilFileSize("file-narrow-value", shown);

    const { rootOverflow, valueRight, stemClipped, extension, title } = await nameParts();

    assert.ok(valueRight <= 0.5, `${suffixName}: the value ends ${valueRight}px past the root`);
    assert.deepEqual(
      { rootOverflow, stemClipped, extension, title },
      { rootOverflow: 0, stemClipped: true, extension: "", title: suffixName },
    );
  }

  // A short name that fits shows its extension whole.
  await pick("file-narrow-input", "a.docx", 1024);
  await untilFileSize("file-narrow-value", "1\u00a0KB");

  const short = await nameParts();

  assert.deepEqual(
    { extension: short.extension, stem: short.stemClipped, ext: short.extensionClipped },
    { extension: ".docx", stem: false, ext: false },
  );

  // A 5-character extension, the longest kept, leaves the stem visible in the 240px root and
  // doesn't run into the size; a longer suffix truncates with the name.
  const wideExtension = `report-for-the-client.${"W".repeat(5)}`;

  await pick("file-narrow-input", wideExtension, 3072);
  await untilFileSize("file-narrow-value", "3\u00a0KB");

  const wide = await nameParts();

  assert.equal(wide.extension, ".WWWWW");
  assert.equal(wide.extensionClipped, false);
  assert.ok(wide.stemWidth >= 24, `the stem shows ${wide.stemWidth}px`);
  assert.ok(wide.nameOverlap <= 0.5, `the name runs ${wide.nameOverlap}px into the size`);
  assert.ok(wide.valueRight <= 0.5, `the value ends ${wide.valueRight}px past the root`);
  assert.equal(wide.rootOverflow, 0);

  // Only Latin, Greek and Cyrillic names without direction marks are split. Any other, such as
  // `تقرير-final.pdf`, a Yezidi one or one starting with a right-to-left mark, is one run the browser orders in its own direction, so `final.pdf` stays together.
  for (const [otherName, size, shown] of [
    ["تقرير-final.pdf", 4096, "4\u00a0KB"],
    ["\u{10E80}\u{10E81}.pdf", 5120, "5\u00a0KB"],
    ["\u200Freport.pdf", 6144, "6\u00a0KB"],
    ["\u{1EC71}23.pdf", 7168, "7\u00a0KB"],
  ]) {
    await pick("file-narrow-input", otherName, size);
    await untilFileSize("file-narrow-value", shown);

    const other = await nameParts();

    assert.deepEqual(
      { extension: other.extension, dir: other.dir, text: other.text },
      { extension: "", dir: "auto", text: otherName },
    );
  }

  // On a right-to-left page a left-to-right name keeps its order: the extension after the stem.
  await page.evaluate(() => document.getElementById("file-narrow").setAttribute("dir", "rtl"));
  await pick("file-narrow-input", "report.pdf", 512);
  await untilFileSize("file-narrow-value", "512 B");

  const rtlName = await nameParts();

  assert.equal(rtlName.extension, ".pdf");
  assert.equal(rtlName.dir, "ltr");
  assert.ok(
    rtlName.stemLeft < rtlName.extensionLeft,
    `stem at ${rtlName.stemLeft}, extension at ${rtlName.extensionLeft}`,
  );
  await page.evaluate(() => document.getElementById("file-narrow").removeAttribute("dir"));

  // Drag and drop, from a fresh page: a file drag marks the zone, crossing its icon keeps the
  // mark, leaving clears it, and a drop chooses the file and touches the field. The button look
  // isn't a zone, and the disabled zone refuses the drop.
  await fresh();

  const icon = "#file-zone [data-slot=file-field-drop-zone-icon]";

  await drag("#file-zone", "dragenter");
  await untilPresent("file-zone", "data-drag-over");

  const dragLook = await styleOf("#file-zone", [
    "borderTopStyle",
    "borderTopColor",
    "backgroundColor",
  ]);

  assert.equal(dragLook.borderTopStyle, "solid");
  assert.equal(dragLook.borderTopColor, foreground);
  assert.notEqual(dragLook.backgroundColor, "rgb(28, 28, 28)", "the drag tint");
  assert.match(dragLook.backgroundColor, /\/ 0\.08\)$/, `drag tint ${dragLook.backgroundColor}`);
  await drag(icon, "dragenter");
  await drag("#file-zone", "dragleave");
  await rendered();
  assert.equal(await attribute("file-zone", "data-drag-over"), "", "crossing the icon");
  await drag(icon, "dragleave");
  await untilAbsent("file-zone", "data-drag-over");
  assert.equal(await textOf("file-zone-touched"), "false");
  await drag("#file-zone", "dragenter", "dropped.pdf");
  assert.equal(await drag("#file-zone", "dragover", "dropped.pdf"), true, "dragover accepted");
  assert.equal(await drag("#file-zone", "drop", "dropped.pdf"), true, "the browser opens nothing");
  await untilFileSize("file-zone-value", "2 KB");
  await untilAbsent("file-zone", "data-drag-over");
  assert.equal((await fileText("file-zone-value")).name, "dropped.pdf");
  await untilText("file-zone-touched", "true");

  await drag("#file-button", "dragenter");
  assert.equal(await drag("#file-button", "dragover"), false, "the button look");
  await rendered();
  assert.equal(await attribute("file-button", "data-drag-over"), null);

  await drag("#file-locked-zone", "dragenter");
  // A disabled zone still cancels dragover, so the browser delivers no drop and opens nothing.
  assert.equal(await drag("#file-locked-zone", "dragover"), true, "disabled dragover");
  await drag("#file-locked-zone", "drop");
  await rendered();
  assert.equal(await attribute("file-locked-zone", "data-drag-over"), null);
  assert.equal(
    await page.evaluate(() => document.getElementById("file-locked-zone-value").hidden),
    true,
    "a disabled zone takes no drop",
  );

  // Keyboard focus, from a fresh page: Tab to a hidden Input rings the look around it, and the
  // zone's border turns the ring color too; a mouse click rings neither.
  await fresh();
  await page.focus("#file-button-save");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await activeId(), "file-button-input");
  assert.deepEqual(await outline("#file-button"), ringOutline(darkRing));
  await page.focus("#file-zone-save");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await activeId(), "file-zone-input");
  assert.deepEqual(await outline("#file-zone"), ringOutline(darkRing));
  assert.equal((await styleOf("#file-zone", ["borderTopColor"])).borderTopColor, darkRing);

  for (const selector of ["#file-button", "#file-zone"]) {
    await chooseFrom(selector, []);
    assert.equal((await outline(selector)).style, "none", `${selector} after a click`);
  }

  // Validation, from a fresh page: a pick touches the field, so a file over the limit shows its
  // error at once. Saving with no file shows the error, marks the Input invalid, turns the looks'
  // borders orange and focuses the Input.
  await fresh();
  await pick("file-button-input", "scan.pdf", 26 * MB);
  await page.waitForFunction(
    () => document.getElementById("file-button-error")?.textContent.trim() === "Up to 25 MB",
  );
  assert.equal((await fileText("file-button-value")).size, "26 MB");

  await fresh();
  await page.click("#file-button-save");
  await page.waitForFunction(
    () => document.getElementById("file-button-error")?.textContent.trim() === "Choose the invoice",
  );
  assert.equal(await activeId(), "file-button-input");
  assert.equal(await attribute("file-button-input", "aria-invalid"), "true");
  await page.click("#file-zone-save");
  await page.waitForFunction(
    () => document.getElementById("file-zone-error")?.textContent.trim() === "Choose an attachment",
  );
  assert.equal(await activeId(), "file-zone-input");
  assert.equal(await attribute("file-zone-input", "aria-invalid"), "true");
  await page.evaluate(() => document.activeElement.blur());
  assert.equal((await styleOf("#file-button", ["borderTopColor"])).borderTopColor, darkOrange);
  assert.deepEqual(await styleOf("#file-zone", ["borderTopColor", "borderTopStyle"]), {
    borderTopColor: darkOrange,
    borderTopStyle: "dashed",
  });

  // FileFieldClear writes null through Origami, by pointer and by Enter: the value line and the ×
  // go, leaving no gap, the Input holds no file and has focus, and no picker opens. The × stays
  // 32px beside the 28px small button look, centered on it.
  const rootWidth = () =>
    page.evaluate(() => ({
      root: document.getElementById("file-primary-root").getBoundingClientRect().width,
      button: document.getElementById("file-primary").getBoundingClientRect().width,
    }));
  const noPicker = () =>
    page.waitForEvent("filechooser", { timeout: 500 }).then(
      () => true,
      () => false,
    );
  const cleared = async (how, picker) => {
    await page.waitForFunction(() => document.getElementById("file-primary-value").hidden);
    await rendered();
    assert.deepEqual(
      await page.evaluate(() => ({
        value: getComputedStyle(document.getElementById("file-primary-value")).display,
        clear: getComputedStyle(document.getElementById("file-primary-clear")).display,
        files: document.getElementById("file-primary-input").files.length,
        focus: document.activeElement?.id,
      })),
      { value: "none", clear: "none", files: 0, focus: "file-primary-input" },
      how,
    );
    assert.ok(
      Math.abs((await rootWidth()).root - (await rootWidth()).button) <= 0.5,
      `no gap after clearing by ${how}`,
    );
    assert.equal(await picker, false, `clearing by ${how} opened the picker`);
  };

  await pick("file-primary-input", "logo.png", 1536);
  await untilFileSize("file-primary-value", "1.5 KB");
  assert.ok((await rootWidth()).root > (await rootWidth()).button + 12, "the value is shown");
  assert.deepEqual(
    await page.evaluate(() => {
      const rect = (id) => document.getElementById(id).getBoundingClientRect();
      const middle = (box) => box.top + box.height / 2;

      return {
        clear: rect("file-primary-clear").height,
        button: rect("file-primary").height,
        centered:
          Math.abs(middle(rect("file-primary-clear")) - middle(rect("file-primary"))) <= 0.5,
      };
    }),
    { clear: 32, button: 28, centered: true },
  );

  let picker = noPicker();

  await page.click("#file-primary-clear");
  await cleared("pointer", picker);
  await pick("file-primary-input", "logo.png", 1536);
  await untilFileSize("file-primary-value", "1.5 KB");
  await page.focus("#file-primary-clear");
  picker = noPicker();
  await page.keyboard.press("Enter");
  await cleared("Enter", picker);

  // Disabled: dimmed, not-allowed, no hover change, no picker; the app can still write a file,
  // and its value line dims too.
  const lockedButtonLook = await styleOf("#file-locked-button", [
    "opacity",
    "cursor",
    "backgroundColor",
  ]);

  await page.hover("#file-locked-button", { force: true });
  assert.equal(
    (await styleOf("#file-locked-button", ["backgroundColor"])).backgroundColor,
    lockedButtonLook.backgroundColor,
    "no hover on the disabled button look",
  );
  await page.hover("#file-locked-zone", { force: true });
  assert.deepEqual(
    await styleOf("#file-locked-zone", ["opacity", "cursor", "borderTopColor"]),
    { opacity: "0.5", cursor: "not-allowed", borderTopColor: darkInput },
    "no hover on the disabled zone",
  );
  await page.mouse.move(0, 0);
  assert.deepEqual(
    { opacity: lockedButtonLook.opacity, cursor: lockedButtonLook.cursor },
    { opacity: "0.5", cursor: "not-allowed" },
  );

  for (const selector of ["#file-locked-button", "#file-locked-zone"]) {
    const chooser = page.waitForEvent("filechooser", { timeout: 500 }).then(
      () => true,
      () => false,
    );

    await page.click(selector, { force: true });
    assert.equal(await chooser, false, `${selector} opened the picker`);
  }

  await page.click("#file-locked-fill");
  await untilFileSize("file-locked-button-value", "1.5 KB");
  // The value dims its icon, name and size, not its Clear's slot, so the × is dimmed once: 50%.
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.getElementById("file-locked-button-value").children].map(
        (child) => `${child.dataset.slot} ${getComputedStyle(child).opacity}`,
      ),
    ),
    [
      "file-field-value-icon 0.5",
      "file-field-name 0.5",
      "file-field-size 0.5",
      "file-field-clear-slot 1",
    ],
  );
  assert.equal((await styleOf("#file-locked-button-value", ["opacity"])).opacity, "1");
  assert.deepEqual(
    await page.evaluate(() => {
      const clear = document.getElementById("file-locked-button-clear");

      return {
        shown: getComputedStyle(clear).display !== "none",
        disabled: clear.disabled,
        ariaDisabled: clear.getAttribute("aria-disabled"),
        dataDisabled: clear.getAttribute("data-disabled"),
        opacity: getComputedStyle(clear).opacity,
      };
    }),
    {
      shown: true,
      disabled: true,
      ariaDisabled: "true",
      dataDisabled: "",
      opacity: "0.5",
    },
    "the disabled field's ×",
  );

  // Themes, from a fresh page: the light subtree's tokens, against the dark document's.
  await fresh();
  await pick("file-light-input", "report.pdf", 1536);
  await untilFileSize("file-light-value", "1.5 KB");
  assert.deepEqual(
    await page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      const colors = (selector) =>
        `${style(selector).backgroundColor} ${style(selector).borderTopColor} ${style(selector).color}`;

      return {
        darkButton: colors("#file-button"),
        darkZone: colors("#file-zone"),
        lightButton: colors("#file-light-button"),
        lightZone: colors("#file-light-zone"),
        lightName: style("#file-light-value [data-slot=file-field-name]").color,
        lightSize: style("#file-light-value [data-slot=file-field-size]").color,
      };
    }),
    {
      darkButton: `rgb(42, 42, 42) ${darkInput} ${foreground}`,
      darkZone: `rgb(28, 28, 28) ${darkInput} rgb(163, 163, 160)`,
      lightButton: "rgb(251, 251, 250) rgb(133, 133, 129) rgb(27, 27, 27)",
      lightZone: "rgb(247, 247, 246) rgb(133, 133, 129) rgb(91, 91, 88)",
      lightName: "rgb(27, 27, 27)",
      lightSize: "rgb(91, 91, 88)",
    },
  );

  // Reduced motion removes the button look's and the zone's transitions.
  assert.deepEqual(
    await page.evaluate(() =>
      ["#file-button", "#file-zone"].map(
        (selector) => getComputedStyle(document.querySelector(selector)).transitionProperty,
      ),
    ),
    ["none", "none"],
  );

  // Forced colors, from a fresh page: the zone's border is a dashed system color at rest and
  // under the pointer, and a solid Highlight on drag-over, also while keyboard-focused or
  // invalid; the looks' focus outlines are drawn.
  await page.emulateMedia({ forcedColors: "active" });
  await fresh();

  const forcedZone = () => styleOf("#file-zone", ["borderTopColor", "borderTopStyle"]);
  const zoneRest = await forcedZone();
  const dragOver = async () => {
    await drag("#file-zone", "dragenter");
    await untilPresent("file-zone", "data-drag-over");

    const look = await forcedZone();

    await drag("#file-zone", "dragleave");
    await untilAbsent("file-zone", "data-drag-over");

    return look;
  };
  const highlighted = { borderTopColor: systemColors.highlight, borderTopStyle: "solid" };

  assert.equal(zoneRest.borderTopStyle, "dashed");
  assert.ok(
    Object.values(systemColors).includes(zoneRest.borderTopColor) &&
      zoneRest.borderTopColor !== darkInput,
    `forced zone border ${zoneRest.borderTopColor}`,
  );
  await page.hover("#file-zone");
  assert.deepEqual(await forcedZone(), zoneRest, "a hovered forced zone");
  await page.mouse.move(0, 0);
  assert.deepEqual(await dragOver(), highlighted, "a forced drag-over");

  await page.focus("#file-zone-save");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await activeId(), "file-zone-input");
  await drag("#file-zone", "dragenter");
  await untilPresent("file-zone", "data-drag-over");
  assert.deepEqual(await forcedZone(), highlighted, "a forced drag-over while focused");
  assert.deepEqual(
    { ...(await outline("#file-zone")), color: undefined },
    { ...ringOutline(), color: undefined },
  );
  await drag("#file-zone", "dragleave");
  await untilAbsent("file-zone", "data-drag-over");

  await page.click("#file-zone-save");
  await until("file-zone-input", "aria-invalid", "true");
  await page.evaluate(() => document.activeElement.blur());
  assert.deepEqual(await dragOver(), highlighted, "a forced drag-over while invalid");
  assert.deepEqual(await forcedZone(), zoneRest, "a forced invalid zone after the drag");

  await page.focus("#file-button-save");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await activeId(), "file-button-input");
  assert.deepEqual(
    { ...(await outline("#file-button")), color: undefined },
    { ...ringOutline(), color: undefined },
  );
  await page.emulateMedia({ forcedColors: "none" });

  // Tabs, Tooltip and Popover. Exact geometry and outline widths are DPR-1 values.
  //
  // Server rendering: each List is a named tablist with its orientation and one Tab stop; every
  // fold Trigger carries the orientation and its hidden dot; unselected Panels are hidden. A
  // Tooltip's id joins a Field description's on its Trigger, and fold Buttons keep their slot.
  // Popover Content is a closed, inert dialog with no tabindex of fold's.
  for (const [list, orientation] of [
    ["tabs-list", "horizontal"],
    ["vtabs-list", "vertical"],
  ]) {
    const tag = openingTag(html, list);
    const triggers = tagsIn(element(html, list), "button");

    assert.match(tag, /\brole="tablist"/);
    assert.match(tag, new RegExp(`\\baria-orientation="${orientation}"`));
    assert.match(tag, /\bdata-slot="tabs-list"/);
    assert.equal(triggers.filter((tag) => tag.includes('tabindex="0"')).length, 1, list);

    for (const trigger of triggers) {
      assert.match(trigger, /\brole="tab"/);
      assert.match(trigger, /\bdata-slot="tabs-trigger"/);
      assert.match(trigger, new RegExp(`\\bdata-orientation="${orientation}"`));
    }
  }

  assert.match(openingTag(html, "tab-all"), /\baria-selected="true"/);
  assert.match(openingTag(html, "tab-drafts"), /\baria-selected="false"/);
  assert.match(openingTag(html, "inner-active"), /\bdata-orientation="horizontal"/);
  assert.ok(
    tagsIn(element(html, "tab-all"), "span").some(
      (tag) => tag.includes('aria-hidden="true"') && tag.includes('data-slot="tabs-indicator"'),
    ),
    "the tab's dot is hidden",
  );
  assert.match(openingTag(html, "panel-all"), /\brole="tabpanel"/);
  assert.match(openingTag(html, "panel-all"), /\btabindex="0"/);
  assert.match(openingTag(html, "panel-all"), /\bdata-slot="tabs-panel"/);
  assert.doesNotMatch(openingTag(html, "panel-all"), /\shidden[\s=>]/);
  assert.match(openingTag(html, "panel-drafts"), /\shidden[\s=>]/);
  assert.match(openingTag(html, "tabs"), /\bdata-slot="tabs"/);

  const describedBy = /\baria-describedby="([^"]*)"/.exec(openingTag(html, "tip-status"));

  assert.ok(describedBy, "the Select Trigger is described");
  assert.deepEqual(describedBy[1].split(" ").sort(), [
    "tip-status-content",
    "tip-status-description",
  ]);
  assert.match(openingTag(html, "tip-copy-content"), /\brole="tooltip"/);
  assert.match(openingTag(html, "tip-copy-content"), /\bpopover="manual"/);
  assert.match(openingTag(html, "tip-copy-content"), /\sinert[\s=>]/);
  assert.match(openingTag(html, "tip-copy-content"), /\bdata-slot="tooltip-content"/);
  assert.match(openingTag(html, "tip-copy-trigger"), /\baria-describedby="tip-copy-content"/);
  assert.match(openingTag(html, "tip-save-trigger"), /\bdata-slot="button"/);
  assert.match(openingTag(html, "tip-publish-trigger"), /\baria-disabled="true"/);
  assert.match(openingTag(html, "tip-save"), /\bdata-slot="tooltip"/);

  const filtersTrigger = openingTag(html, "filters-trigger");
  const filtersContent = openingTag(html, "filters-content");

  assert.match(filtersTrigger, /\baria-expanded="false"/);
  assert.match(filtersTrigger, /\baria-controls="filters-content"/);
  assert.match(filtersTrigger, /\baria-haspopup="dialog"/);
  assert.match(filtersTrigger, /\baria-describedby="tip-filters-content"/);
  assert.match(filtersTrigger, /\bdata-slot="popover-trigger"/);
  assert.match(filtersTrigger, /\bclass="[^"]*\bh-8\b/);
  assert.match(filtersContent, /\brole="dialog"/);
  assert.match(filtersContent, /\bpopover="manual"/);
  assert.match(filtersContent, /\sinert[\s=>]/);
  assert.match(filtersContent, /\bdata-slot="popover-content"/);
  assert.doesNotMatch(filtersContent, /\stabindex=/);
  assert.doesNotMatch(openingTag(html, "notes-content"), /\stabindex=/);
  assert.match(openingTag(html, "filters"), /\bdata-slot="popover"/);

  // Tabs from a fresh page. The first label's x and its text edges, read from the label's own
  // text, not the Trigger's box.
  await fresh();

  const labelEdges = (ids) =>
    page.evaluate((ids) => {
      const result = {};

      for (const id of ids) {
        let text = null;

        for (const node of document.getElementById(id).childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== "") {
            text = node;
            break;
          }
        }

        const content = text.textContent;
        const first = content.search(/\S/);
        const last = content.trimEnd().length - 1;
        const range = document.createRange();

        range.setStart(text, first);
        range.setEnd(text, first + 1);
        const left = range.getBoundingClientRect().left;

        range.setStart(text, last);
        range.setEnd(text, last + 1);
        result[id] = { left, right: range.getBoundingClientRect().right };
      }

      return result;
    }, ids);
  const tabsLook = await page.evaluate(() => {
    const style = (selector, pseudo) => getComputedStyle(document.querySelector(selector), pseudo);
    const dot = (id) => {
      const indicator = style(`#${id} > [data-slot=tabs-indicator]`);

      return `${indicator.display} ${indicator.visibility}`;
    };
    const rect = (id) => document.getElementById(id).getBoundingClientRect();

    return {
      selected: `${style("#tab-all").fontWeight} ${style("#tab-all").color}`,
      unselected: `${style("#tab-reports").fontWeight} ${style("#tab-reports").color}`,
      underline: `${style("#tab-all", "::after").borderBottomWidth} ${style("#tab-all", "::after").borderBottomStyle} ${style("#tab-all", "::after").borderBottomColor}`,
      unselectedAfter: style("#tab-reports", "::after").content,
      flushUnderline: Math.abs(rect("tabs-list").bottom - 1 - rect("tab-all").bottom) < 0.5,
      height: style("#tab-all").height,
      listGap: style("#tabs-list").columnGap,
      baseline: `${style("#tabs-list").borderBottomWidth} ${style("#tabs-list").borderBottomColor}`,
      disabled: style("#tab-archived").opacity,
      dots: [
        "tab-all",
        "tab-drafts",
        "tab-archived",
        "tab-reports",
        "inner-active",
        "inner-ended",
      ].map(dot),
      verticalDots: ["vtab-profile", "vtab-security", "vtab-billing", "vtab-team"].map(dot),
      verticalList: `${style("#vtabs-list").flexDirection} ${style("#vtabs-list").borderRightWidth} ${style("#vtabs-list").borderBottomWidth}`,
      verticalBar: `${style("#vtab-profile", "::after").borderRightWidth} ${style("#vtab-profile", "::after").borderBottomWidth}`,
      verticalWidth: Math.abs(rect("vtab-security").width - (rect("vtabs-list").width - 1)) < 0.5,
      hiddenGrid: style("#panel-drafts").display,
    };
  });

  assert.deepEqual(tabsLook, {
    selected: `600 ${foreground}`,
    unselected: "500 rgb(163, 163, 160)",
    underline: `2px solid ${foreground}`,
    unselectedAfter: "none",
    flushUnderline: true,
    height: "36px",
    listGap: "20px",
    baseline: `1px ${darkBorder}`,
    disabled: "0.5",
    dots: [
      "block visible",
      "none visible",
      "none visible",
      "none visible",
      "block visible",
      "none visible",
    ],
    verticalDots: ["block visible", "block hidden", "block hidden", "block hidden"],
    verticalList: "column 1px 0px",
    verticalBar: "2px 0px",
    verticalWidth: true,
    hiddenGrid: "none",
  });

  const beforeArrow = await labelEdges(["tab-all", "tab-drafts", "tab-archived", "tab-reports"]);

  near(beforeArrow["tab-drafts"].left - beforeArrow["tab-all"].right, 24, 0.5, "label spacing");

  // The keys: ArrowRight selects the next tab, moving only the label that lost the dot; the next
  // skips the disabled tab. Tab reaches the Panel's ring; a pointer click on a Panel shows none.
  await page.click("#tab-all");
  await page.keyboard.press("ArrowRight");
  await until("tab-drafts", "aria-selected", "true");
  await rendered();

  const afterArrow = await labelEdges(["tab-all", "tab-drafts", "tab-archived", "tab-reports"]);

  near(
    afterArrow["tab-all"].left - beforeArrow["tab-all"].left,
    -14,
    1,
    "label 1 after ArrowRight",
  );
  near(
    afterArrow["tab-archived"].left - beforeArrow["tab-archived"].left,
    0,
    1,
    "label 3 after ArrowRight",
  );
  assert.equal(await activeId(), "tab-drafts");
  assert.deepEqual(await outline("#tab-drafts"), ringOutline("rgb(76, 196, 111)"));

  await page.keyboard.press("ArrowRight");
  await until("tab-reports", "aria-selected", "true");
  assert.equal(await activeId(), "tab-reports");
  await page.waitForSelector("#reports-body");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "panel-reports");
  assert.deepEqual(await outline("#panel-reports"), ringOutline("rgb(76, 196, 111)"));

  await page.click("#vpanel-profile");
  assert.deepEqual(
    await page.evaluate(() => {
      const panel = document.getElementById("vpanel-profile");

      return [document.activeElement === panel, panel.matches(":focus-visible")];
    }),
    [true, false],
  );

  // Vertical: every label lines up whichever tab is selected, and ArrowDown moves none of them.
  const verticalIds = ["vtab-profile", "vtab-security", "vtab-billing", "vtab-team"];
  const beforeDown = await labelEdges(verticalIds);

  await page.click("#vtab-profile");
  await page.keyboard.press("ArrowDown");
  await until("vtab-security", "aria-selected", "true");
  await rendered();

  const afterDown = await labelEdges(verticalIds);

  for (const id of verticalIds) {
    near(beforeDown[id].left, beforeDown["vtab-profile"].left, 0.5, `${id} lines up`);
    near(afterDown[id].left - beforeDown[id].left, 0, 1, `${id} after ArrowDown`);
  }

  // The focusable disabled tab takes focus without being selected.
  await page.keyboard.press("ArrowDown");
  assert.equal(await activeId(), "vtab-billing");
  assert.equal(await attribute("vtab-billing", "aria-disabled"), "true");
  assert.equal(await attribute("vtab-billing", "aria-selected"), "false");
  assert.equal((await styleOf("#vtab-billing", ["opacity"])).opacity, "0.5");

  // Tooltip, from a fresh page: a resting mouse opens it, without a fixed sleep.
  const opened = (id, timeout = 5000) =>
    page.waitForFunction(
      (id) => {
        const content = document.getElementById(id);

        return content.matches(":popover-open") && getComputedStyle(content).opacity === "1";
      },
      id,
      { timeout },
    );
  const isOpen = (id) =>
    page.evaluate((id) => document.getElementById(id).matches(":popover-open"), id);
  const dismissed = (id) =>
    page.waitForFunction((id) => !document.getElementById(id).matches(":popover-open"), id);

  // The Tooltips and Popovers sit near the page's end, so the page gets room to scroll one to the
  // viewport's top.
  const scrollToTop = (id) =>
    page.evaluate((id) => {
      document.body.style.paddingBottom = "100vh";
      document.getElementById(id).scrollIntoView({ block: "start" });
    }, id);

  await fresh();
  await page.hover("#tip-save-trigger");
  await opened("tip-save-content", 1500);
  await page.mouse.move(0, 0);
  await dismissed("tip-save-content");

  // Keyboard focus opens one at once, 6px above its Trigger and centred on it, as the inverted
  // chip; Escape closes it and keeps focus.
  await page.focus("#tip-save-trigger");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "tip-copy-trigger");
  await opened("tip-copy-content");

  const copyTrigger = await rectOf("#tip-copy-trigger");
  const copyChip = await rectOf("#tip-copy-content");

  near(copyTrigger.top - copyChip.bottom, 6, 0.5, "the Tooltip's gap");
  near(
    copyChip.left + copyChip.width / 2,
    copyTrigger.left + copyTrigger.width / 2,
    0.5,
    "the Tooltip's centre",
  );
  assert.deepEqual(
    await styleOf("#tip-copy-content", [
      "backgroundColor",
      "color",
      "fontSize",
      "fontWeight",
      "borderTopLeftRadius",
      "paddingTop",
      "paddingLeft",
    ]),
    {
      backgroundColor: foreground,
      color: "rgb(20, 20, 20)",
      fontSize: "12px",
      fontWeight: "400",
      borderTopLeftRadius: "6px",
      paddingTop: "4px",
      paddingLeft: "8px",
    },
  );
  await page.keyboard.press("Escape");
  await dismissed("tip-copy-content");
  assert.equal(await activeId(), "tip-copy-trigger");

  // An unavailable action explains itself on focus, and its guarded handler ignores a pointer
  // click, Enter and Space; once available, one click runs it. Playwright treats aria-disabled as
  // disabled, hence force.
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "tip-publish-trigger");
  await opened("tip-publish-content");
  assert.equal(await textOf("tip-publish-content"), "Nothing to publish yet");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await page.click("#tip-publish-trigger", { force: true });
  await rendered();
  assert.equal(await textOf("publish-count"), "0");
  await page.click("#edit-draft");
  await page.click("#tip-publish-trigger");
  await untilText("publish-count", "1");

  // At the viewport's top edge it flips below, 6px from its Trigger.
  await scrollToTop("tip-save-trigger");
  await page.focus("#tip-copy-trigger");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await activeId(), "tip-save-trigger");
  await opened("tip-save-content");

  const topTrigger = await rectOf("#tip-save-trigger");
  const topChip = await rectOf("#tip-save-content");

  near(topChip.top - topTrigger.bottom, 6, 0.5, "the flipped Tooltip's gap");
  await page.keyboard.press("Escape");

  // Popover, from a fresh page: a click opens it, 4px below the Trigger at its start, 288px wide
  // with 12px padding, on the surface; it replaces the Trigger's Tooltip.
  await fresh();
  await scrollToTop("filters-trigger");
  // The Trigger announces Content's default dialog role, hydrated, open and closed again.
  assert.equal(await attribute("filters-trigger", "aria-haspopup"), "dialog");
  // The Trigger's own Tooltip is open on hover first, so the click has one to replace.
  await page.hover("#filters-trigger");
  await opened("tip-filters-content");
  await page.click("#filters-trigger");
  await opened("filters-content");
  await dismissed("tip-filters-content");
  assert.equal(await isOpen("tip-filters-content"), false);
  // Off the Trigger, so its Tooltip opens only from keyboard focus from here on.
  await page.mouse.move(0, 0);
  assert.equal(await attribute("filters-trigger", "aria-expanded"), "true");
  assert.equal(await attribute("filters-trigger", "aria-haspopup"), "dialog");

  const popoverTrigger = await rectOf("#filters-trigger");
  const popover = await rectOf("#filters-content");

  near(popover.top - popoverTrigger.bottom, 4, 0.5, "the Popover's gap");
  near(popover.left, popoverTrigger.left, 0.5, "the Popover's start");
  assert.deepEqual(
    await styleOf("#filters-content", [
      "width",
      "paddingTop",
      "backgroundColor",
      "borderTopLeftRadius",
      "borderTopWidth",
    ]),
    {
      width: "288px",
      paddingTop: "0px",
      backgroundColor: darkSurface,
      borderTopLeftRadius: "12px",
      borderTopWidth: "1px",
    },
  );
  // The 12px padding is inside the panel's scroller.
  assert.deepEqual(
    await styleOf("#filters-content [data-slot=scroll-area-content] > div", ["paddingTop"]),
    { paddingTop: "12px" },
  );

  // Tab runs from the Trigger through its controls to what follows, focusing the nested
  // Tooltip's button opens it, and Shift+Tab reverses.
  const forward = [];

  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("Tab");
    forward.push(await activeId());

    if (forward.at(-1) === "filter-reset") {
      await opened("tip-reset-content");
    }
  }

  assert.deepEqual(forward, ["filter-owner", "filter-reset", "filter-apply", "after-filters"]);

  const backward = [];

  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("Shift+Tab");
    backward.push(await activeId());
  }

  assert.deepEqual(backward, ["filter-apply", "filter-reset", "filter-owner", "filters-trigger"]);

  // Escape closes it from inside and returns focus to the Trigger.
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "filter-owner");
  await page.keyboard.press("Escape");
  await dismissed("filters-content");
  assert.equal(await activeId(), "filters-trigger");
  assert.equal(await attribute("filters-trigger", "aria-expanded"), "false");
  assert.equal(await attribute("filters-trigger", "aria-haspopup"), "dialog");

  // A Tooltip inside it is hidden by the time the Popover is, when code closes the Popover.
  await page.keyboard.press("Enter");
  await opened("filters-content");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "filter-reset");
  await opened("tip-reset-content");
  await page.evaluate(() => {
    const content = document.getElementById("filters-content");
    const tip = document.getElementById("tip-reset-content");

    window.tipOpenAtHide = undefined;
    content.addEventListener(
      "toggle",
      (event) => {
        if (event.newState === "closed") {
          window.tipOpenAtHide = tip.matches(":popover-open");
        }
      },
      { once: true },
    );
    document.getElementById("filter-apply").click();
  });
  assert.equal(
    await (await page.waitForFunction(() => window.tipOpenAtHide !== undefined)).jsonValue(),
    true,
  );
  assert.equal(await page.evaluate(() => window.tipOpenAtHide), false);

  // An outside click closes it and leaves focus where it landed.
  await page.click("#filters-trigger");
  await opened("filters-content");
  await page.click("#vpanel-profile");
  await dismissed("filters-content");
  assert.equal(await activeId(), "vpanel-profile");

  // At the viewport's bottom it opens 4px above.
  await page.evaluate(() =>
    document.getElementById("filters-trigger").scrollIntoView({ block: "end" }),
  );
  await page.click("#filters-trigger");
  await opened("filters-content");

  const bottomTrigger = await rectOf("#filters-trigger");
  const flipped = await rectOf("#filters-content");

  near(bottomTrigger.top - flipped.bottom, 4, 0.5, "the flipped Popover's gap");
  await page.keyboard.press("Escape");
  await dismissed("filters-content");

  // Motion: both fade and scale in with the floating surfaces' popup-in, and not under reduced
  // motion.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fresh();
  await scrollToTop("filters-trigger");
  await watchAnimations("filters-content", "data-entering");
  await page.click("#filters-trigger");
  assert.deepEqual(await watchedAnimations(), [
    { name: "popup-in", duration: 120, direction: "normal" },
  ]);
  await opened("filters-content");
  await page.keyboard.press("Escape");
  await dismissed("filters-content");
  await page.focus("#tip-save-trigger");
  await watchAnimations("tip-copy-content", "data-entering");
  await page.keyboard.press("Tab");
  assert.deepEqual(await watchedAnimations(), [
    { name: "popup-in", duration: 120, direction: "normal" },
  ]);
  await opened("tip-copy-content");
  await page.keyboard.press("Escape");
  await dismissed("tip-copy-content");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await watchAnimations("tip-copy-content", "data-entering");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  assert.deepEqual(await watchedAnimations(), []);
  await opened("tip-copy-content");
  await page.keyboard.press("Escape");
  await dismissed("tip-copy-content");
  await watchAnimations("filters-content", "data-entering");
  await page.click("#filters-trigger");
  assert.deepEqual(await watchedAnimations(), []);
  await opened("filters-content");
  await page.keyboard.press("Escape");
  await dismissed("filters-content");

  // Forced colors, from a fresh page: the selected tab's underline stays an opaque border and its
  // dot is CanvasText; both disabled tabs, natively or focusably, are GrayText; the chip's and
  // panel's borders are opaque; tab, Panel and Popover Content rings are Chromium's Highlight.
  await page.emulateMedia({ forcedColors: "active" });
  await fresh();

  const forcedTabs = await page.evaluate(() => {
    const style = (selector, pseudo) => getComputedStyle(document.querySelector(selector), pseudo);
    const after = style("#tab-all", "::after");

    return {
      underline: `${after.borderBottomWidth} ${after.borderBottomStyle}`,
      underlineColor: after.borderBottomColor,
      dot: style("#tab-all > [data-slot=tabs-indicator]").backgroundColor,
      disabled: style("#tab-archived").color,
      focusableDisabled: style("#vtab-billing").color,
    };
  });

  assert.equal(forcedTabs.underline, "2px solid");
  assert.match(forcedTabs.underlineColor, /^rgb\(/, "the forced underline is opaque");
  assert.equal(forcedTabs.dot, systemColors.canvasText);
  assert.equal(forcedTabs.disabled, systemColors.grayText);
  assert.equal(forcedTabs.focusableDisabled, systemColors.grayText);

  await page.click("#tab-all");
  await page.keyboard.press("ArrowRight");
  await until("tab-drafts", "aria-selected", "true");
  assert.deepEqual(await outline("#tab-drafts"), ringOutline(systemColors.highlight));
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "panel-drafts");
  assert.deepEqual(await outline("#panel-drafts"), ringOutline(systemColors.highlight));

  await page.focus("#tip-save-trigger");
  await page.keyboard.press("Tab");
  await opened("tip-copy-content");

  const forcedChip = await styleOf("#tip-copy-content", ["borderTopWidth", "borderTopColor"]);

  assert.equal(forcedChip.borderTopWidth, "1px");
  assert.match(forcedChip.borderTopColor, /^rgb\(/, "the forced chip's border is opaque");
  await page.keyboard.press("Escape");

  await scrollToTop("notes-trigger");
  await page.click("#notes-trigger");
  await opened("notes-content");

  const forcedPanel = await styleOf("#notes-content", ["borderTopWidth", "borderTopColor"]);

  assert.equal(forcedPanel.borderTopWidth, "1px");
  assert.match(forcedPanel.borderTopColor, /^rgb\(/, "the forced panel's border is opaque");
  // The authored tabindex="0" is on the panel's scroller, which shows its inset ring.
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() =>
      document.activeElement.matches("#notes-content [data-slot=scroll-area-viewport]"),
    ),
    "the notes scroller has focus",
  );
  assert.deepEqual(await outline("#notes-content [data-slot=scroll-area-viewport]"), {
    style: "solid",
    width: "2px",
    offset: "-2px",
    color: systemColors.highlight,
  });
  await page.keyboard.press("Escape");
  await dismissed("notes-content");
  await page.emulateMedia({ forcedColors: "none" });

  // Menu. Exact geometry is a DPR-1 value.
  //
  // Server rendering: the Trigger announces a closed menu it controls, Content is a closed, inert
  // menu, checkable rows carry their bound state, the destructive row its variant, a group its
  // label, and the shortcut is hidden.
  const rowTrigger = openingTag(html, "menu-row-trigger");
  const rowContent = openingTag(html, "menu-row-content");

  assert.match(rowTrigger, /\baria-haspopup="menu"/);
  assert.match(rowTrigger, /\baria-expanded="false"/);
  assert.match(rowTrigger, /\baria-controls="menu-row-content"/);
  assert.match(rowTrigger, /\bdata-slot="menu-trigger"/);
  assert.match(rowTrigger, /\bclass="[^"]*\bsize-8\b/);
  assert.match(rowContent, /\brole="menu"/);
  assert.match(rowContent, /\bpopover="manual"/);
  assert.match(rowContent, /\sinert[\s=>]/);
  assert.match(rowContent, /\bdata-slot="menu-content"/);
  assert.match(openingTag(html, "menu-row"), /\bdata-slot="menu"/);
  assert.match(openingTag(html, "menu-row-edit"), /\bdata-slot="menu-link"/);
  assert.match(openingTag(html, "menu-row-shortcut"), /\baria-hidden="true"/);
  assert.match(openingTag(html, "menu-row-separator"), /\brole="separator"/);
  assert.match(openingTag(html, "menu-row-delete"), /\brole="menuitem"/);
  assert.match(openingTag(html, "menu-row-delete"), /\bdata-variant="destructive"/);

  const completed = openingTag(html, "menu-view-completed");
  const archived = openingTag(html, "menu-view-archived");

  assert.match(completed, /\brole="menuitemcheckbox"/);
  assert.match(completed, /\baria-checked="true"/);
  assert.match(completed, /\bdata-checked=""/);
  assert.match(archived, /\baria-checked="false"/);
  assert.doesNotMatch(archived, /\sdata-checked=/);
  assert.match(openingTag(html, "menu-view-comfortable"), /\baria-checked="true"/);
  assert.match(openingTag(html, "menu-view-compact"), /\baria-checked="false"/);
  assert.match(openingTag(html, "menu-view-show"), /\baria-labelledby="menu-view-show-label"/);
  assert.match(openingTag(html, "menu-view-move-trigger"), /\baria-haspopup="menu"/);
  assert.match(openingTag(html, "menu-view-move-trigger"), /\baria-expanded="false"/);
  assert.match(openingTag(html, "menu-view-archive"), /\bdata-disabled=""/);

  // The row highlight: the theme's foreground mixed at 8% into transparent, read from a probe.
  const menuFill = () =>
    page.evaluate(() => {
      const probe = document.createElement("span");

      probe.style.backgroundColor = "color-mix(in oklab, var(--foreground) 8%, transparent)";
      document.body.append(probe);

      const fill = getComputedStyle(probe).backgroundColor;

      probe.remove();

      return fill;
    });
  const darkMenuFill = await menuFill();

  // A click opens the row actions on the first item, 4px below the Trigger and end-aligned to
  // it, with the floating surfaces' popup-in.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fresh();
  await scrollToTop("menu-row-trigger");
  await watchAnimations("menu-row-content", "data-entering");
  await page.click("#menu-row-trigger");
  assert.deepEqual(await watchedAnimations(), [
    { name: "popup-in", duration: 120, direction: "normal" },
  ]);
  await opened("menu-row-content");
  await page.waitForFunction(() => document.activeElement?.id === "menu-row-edit");
  assert.equal(await attribute("menu-row-trigger", "aria-expanded"), "true");

  const menuRowTrigger = await rectOf("#menu-row-trigger");
  const menuRow = await rectOf("#menu-row-content");

  near(menuRow.top - menuRowTrigger.bottom, 4, 0.5, "the Menu's gap");
  near(menuRow.right, menuRowTrigger.right, 0.5, "the Menu's end");
  assert.deepEqual(
    await styleOf("#menu-row-content", [
      "backgroundColor",
      "borderTopLeftRadius",
      "borderTopWidth",
      "paddingTop",
    ]),
    {
      backgroundColor: darkSurface,
      borderTopLeftRadius: "12px",
      borderTopWidth: "1px",
      paddingTop: "4px",
    },
  );
  assert.ok(menuRow.width >= 192, `the Menu's width ${menuRow.width}`);
  assert.deepEqual(await styleOf("#menu-row-edit", ["height", "borderTopLeftRadius"]), {
    height: "32px",
    borderTopLeftRadius: "6px",
  });

  // ArrowDown skips the separator to Delete: the neutral fill, orange text and icon, and the ring.
  await page.keyboard.press("ArrowDown");
  assert.equal(await activeId(), "menu-row-delete");
  assert.deepEqual(await styleOf("#menu-row-delete", ["backgroundColor", "color"]), {
    backgroundColor: darkMenuFill,
    color: darkOrange,
  });
  assert.equal((await styleOf("#menu-row-delete > svg", ["color"])).color, darkOrange);
  assert.deepEqual(await outline("#menu-row-delete"), ringOutline(darkRing));

  // Enter runs it: the menu closes and focus returns to the Trigger.
  await page.keyboard.press("Enter");
  await untilText("menu-row-status", "Deleted LC-2041");
  await dismissed("menu-row-content");
  assert.equal(await activeId(), "menu-row-trigger");
  assert.equal(await attribute("menu-row-trigger", "aria-expanded"), "false");

  // The View menu: captions stay start-aligned under align="end"; a click toggles a checkbox row,
  // its check showing, and selects a radio row, with the menu kept open.
  await page.click("#menu-view-trigger");
  await opened("menu-view-content");
  assert.deepEqual(
    [
      (await styleOf("#menu-view-content", ["textAlign"])).textAlign,
      (await styleOf("#menu-view-show-label", ["textAlign"])).textAlign,
      (await styleOf("#menu-view-density-label", ["textAlign"])).textAlign,
    ],
    ["start", "start", "start"],
  );

  const checkMark = (id, slot) =>
    page.evaluate(
      ([id, slot]) =>
        getComputedStyle(document.querySelector(`#${id} > [data-slot=${slot}]`)).visibility,
      [id, slot],
    );

  assert.equal(await checkMark("menu-view-completed", "menu-checkbox-item-indicator"), "visible");
  assert.equal(await checkMark("menu-view-archived", "menu-checkbox-item-indicator"), "hidden");
  await page.click("#menu-view-archived");
  await untilText("menu-view-archived-value", "true");
  assert.equal(await hasAttribute("menu-view-archived", "data-checked"), true);
  assert.equal(await checkMark("menu-view-archived", "menu-checkbox-item-indicator"), "visible");
  await page.click("#menu-view-completed");
  await untilText("menu-view-completed-value", "false");
  assert.equal(await hasAttribute("menu-view-completed", "data-checked"), false);
  assert.equal(await checkMark("menu-view-completed", "menu-checkbox-item-indicator"), "hidden");
  assert.equal(await checkMark("menu-view-comfortable", "menu-radio-item-indicator"), "visible");
  await page.click("#menu-view-compact");
  await untilText("menu-view-density-value", "compact");
  assert.equal(await hasAttribute("menu-view-compact", "data-checked"), true);
  assert.equal(await hasAttribute("menu-view-comfortable", "data-checked"), false);
  assert.equal(await checkMark("menu-view-compact", "menu-radio-item-indicator"), "visible");
  assert.equal(await checkMark("menu-view-comfortable", "menu-radio-item-indicator"), "hidden");
  assert.equal(await isOpen("menu-view-content"), true);

  // The mouse focuses the row it moves over: the fill without the ring, on a disabled row too,
  // which Enter doesn't activate.
  await page.hover("#menu-view-merged");
  await page.waitForFunction(() => document.activeElement?.id === "menu-view-merged");
  assert.equal(
    (await styleOf("#menu-view-merged", ["backgroundColor"])).backgroundColor,
    darkMenuFill,
  );
  assert.equal((await outline("#menu-view-merged")).style, "none");
  await page.hover("#menu-view-archive");
  await page.waitForFunction(() => document.activeElement?.id === "menu-view-archive");
  assert.deepEqual(await styleOf("#menu-view-archive", ["backgroundColor", "opacity"]), {
    backgroundColor: darkMenuFill,
    opacity: "0.5",
  });
  await page.keyboard.press("Enter");
  await rendered();
  assert.equal(await isOpen("menu-view-content"), true);
  assert.equal(await activeId(), "menu-view-archive");

  // The submenu opens 4px beside its sub-trigger, which keeps its fill while focus is inside;
  // ArrowLeft closes it and focuses the sub-trigger again.
  await page.click("#menu-view-move-trigger");
  await opened("menu-view-move-content");
  assert.equal(await attribute("menu-view-move-content", "data-side"), "inline-end");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.activeElement?.id === "menu-view-backlog");
  assert.equal(await attribute("menu-view-move-trigger", "aria-expanded"), "true");
  assert.equal(
    (await styleOf("#menu-view-move-trigger", ["backgroundColor"])).backgroundColor,
    darkMenuFill,
  );

  const subTrigger = await rectOf("#menu-view-move-trigger");
  const submenu = await rectOf("#menu-view-move-content");

  near(submenu.left - subTrigger.right, 4, 0.5, "the submenu's gap");
  await page.keyboard.press("ArrowLeft");
  await dismissed("menu-view-move-content");
  assert.equal(await activeId(), "menu-view-move-trigger");
  await page.keyboard.press("Escape");
  await dismissed("menu-view-content");
  assert.equal(await activeId(), "menu-view-trigger");

  // A consumer class wins over the row's padding.
  assert.deepEqual(await styleOf("#menu-view-merged", ["paddingLeft", "paddingRight"]), {
    paddingLeft: "24px",
    paddingRight: "8px",
  });

  // Forced colors: the focused row is Highlight and the separator stays a visible GrayText rule.
  await page.emulateMedia({ forcedColors: "active" });
  await fresh();
  await scrollToTop("menu-row-trigger");
  await page.focus("#menu-row-trigger");
  await page.keyboard.press("Enter");
  await opened("menu-row-content");
  await page.waitForFunction(() => document.activeElement?.id === "menu-row-edit");
  assert.deepEqual(await styleOf("#menu-row-edit", ["backgroundColor", "color"]), {
    backgroundColor: systemColors.highlight,
    color: systemColors.highlightText,
  });

  const forcedSeparator = (await styleOf("#menu-row-separator", ["backgroundColor"]))
    .backgroundColor;

  assert.notEqual(forcedSeparator, systemColors.canvas, "the forced separator is visible");
  assert.equal(forcedSeparator, systemColors.grayText);
  await page.keyboard.press("Escape");
  await dismissed("menu-row-content");
  await page.emulateMedia({ forcedColors: "none" });

  // ScrollArea, Avatar and Progress. Server HTML first: the bars' ARIA, value and state, the
  // avatars' status and the two component stylesheets with their keyframes.
  const uploadBar = openingTag(html, "progress-40");
  const unknownBar = openingTag(html, "progress-unknown");

  assert.match(uploadBar, /\brole="progressbar"/);
  assert.match(uploadBar, /\baria-valuenow="40"/);
  assert.match(uploadBar, /--og-progress-percent:\s*40%/);
  assert.match(uploadBar, /\bdata-slot="progress"/);
  assert.match(openingTag(html, "progress-complete"), /\bdata-complete=""/);
  assert.match(unknownBar, /\bdata-indeterminate=""/);
  assert.doesNotMatch(unknownBar, /\saria-valuenow=/);
  assert.match(html, /data-slot="progress-fill"/);
  assert.match(openingTag(html, "avatar-circle-md"), /\bdata-status="loading"/);
  assert.match(openingTag(html, "avatar-circle-md-idle"), /\bdata-status="idle"/);
  assert.match(openingTag(html, "avatar-circle-md"), /\bdata-slot="avatar"/);
  assert.match(html, /@keyframes [^{\s]*progress-indeterminate\s*\{/);
  assert.match(html, /@keyframes [^{\s]*avatar-fallback-delay\s*\{/);

  // The server's DOM: the name and the Tab stop on the viewport, none on the root, one
  // aria-hidden rail per mounted axis, and the images' sources.
  const displayPrerendered = await browser.newPage({ javaScriptEnabled: false });

  await displayPrerendered.goto(base);
  assert.deepEqual(
    await displayPrerendered.evaluate(() => {
      const viewport = (id) => document.querySelector(`#${id} > [data-slot=scroll-area-viewport]`);
      const rails = (id) => {
        const result = [];

        for (const rail of document.querySelectorAll(
          `#${id} > [data-slot=scroll-area-scrollbar]`,
        )) {
          result.push(
            `${rail.getAttribute("data-orientation")} ${rail.getAttribute("aria-hidden")}`,
          );
        }

        return result;
      };
      const root = document.getElementById("sa-both");

      return {
        tabindex: viewport("sa-both").getAttribute("tabindex"),
        role: viewport("sa-both").getAttribute("role"),
        labelledby: viewport("sa-both").getAttribute("aria-labelledby"),
        label: viewport("sa-vertical").getAttribute("aria-label"),
        rootName: [
          root.getAttribute("role"),
          root.getAttribute("aria-labelledby"),
          document.getElementById("sa-vertical").getAttribute("aria-label"),
        ],
        both: rails("sa-both"),
        vertical: rails("sa-vertical"),
        horizontal: rails("sa-horizontal"),
        photo: document.querySelector("#avatar-circle-md > img").getAttribute("src").slice(0, 18),
        noPhoto: document.querySelector("#avatar-circle-md-idle > img").hasAttribute("src"),
      };
    }),
    {
      tabindex: "0",
      role: "region",
      labelledby: "sa-both-title",
      label: "Delivery notes",
      rootName: [null, null, null],
      both: ["vertical true", "horizontal true"],
      vertical: ["vertical true"],
      horizontal: ["horizontal true"],
      photo: "data:image/svg+xml",
      noPhoto: false,
    },
  );
  await displayPrerendered.close();

  // Running CSS animation in every sample and more than 2px of rendered movement across them;
  // the sweep animates `translate`, so the rendered position is what moves.
  const sweepSamples = async (selector) => {
    const samples = [];

    for (let index = 0; index < 4; index++) {
      samples.push(
        await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          let running = false;

          for (const animation of element.getAnimations()) {
            if (animation.playState === "running") {
              running = true;
            }
          }

          return { running, left: element.getBoundingClientRect().left };
        }, selector),
      );

      if (index < 3) {
        await page.waitForTimeout(140);
      }
    }

    const lefts = samples.map((sample) => sample.left);

    return {
      running: samples.map((sample) => sample.running),
      distance: Math.max(...lefts) - Math.min(...lefts),
    };
  };
  const assertSweep = async (selector) => {
    const { running, distance } = await sweepSamples(selector);
    const everyRunning = running.every(Boolean);

    assert.ok(
      everyRunning && distance > 2,
      `${selector}: sweep must run and move: running=${everyRunning}, distance=${distance}`,
    );
  };
  // No running animation and no rendered movement.
  const assertStill = async (selector) => {
    const { running, distance } = await sweepSamples(selector);
    const anyRunning = running.some(Boolean);

    assert.ok(
      !anyRunning && distance === 0,
      `${selector}: must stay still: running=${anyRunning}, distance=${distance}`,
    );
  };
  const viewportOf = (id) => `#${id} > [data-slot=scroll-area-viewport]`;
  const railOf = (id, orientation) =>
    `#${id} > [data-slot=scroll-area-scrollbar][data-orientation=${orientation}]`;
  const thumbOf = (id, orientation) => `${railOf(id, orientation)} > [data-slot=scroll-area-thumb]`;
  const visibility = (selector) =>
    page.evaluate((selector) => {
      const style = getComputedStyle(document.querySelector(selector));

      return `${style.visibility} ${style.opacity}`;
    }, selector);
  const untilShown = (selector) =>
    page.waitForFunction((selector) => {
      const style = getComputedStyle(document.querySelector(selector));

      return style.visibility === "visible" && style.opacity === "1";
    }, selector);
  const untilHidden = (selector) =>
    page.waitForFunction(
      (selector) => getComputedStyle(document.querySelector(selector)).visibility === "hidden",
      selector,
    );
  const scrollOf = (selector) =>
    page.evaluate((selector) => {
      const viewport = document.querySelector(selector);

      return { left: viewport.scrollLeft, top: viewport.scrollTop };
    }, selector);
  const displayInput = "rgb(107, 107, 104)";
  const displayMutedForeground = "rgb(163, 163, 160)";

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fresh();

  // ScrollArea's bounds: the table fills its sized parent and overflows both ways, the capped
  // list stops at 240px and scrolls, the short one hugs its three rows, and the panel's area takes
  // what its fixed header and footer leave.
  const bounds = await page.evaluate(() => {
    const viewport = (id) => document.querySelector(`#${id} > [data-slot=scroll-area-viewport]`);
    const both = viewport("sa-both");
    const bound = document.getElementById("sa-both-bound");
    const panelBound = document.getElementById("sa-panel-bound");

    return {
      both: [both.clientWidth, both.clientHeight],
      bothBound: [bound.clientWidth, bound.clientHeight],
      bothRangeX: both.scrollWidth - both.clientWidth,
      bothRangeY: both.scrollHeight - both.clientHeight,
      capped: viewport("sa-capped").getBoundingClientRect().height,
      cappedScrolls: viewport("sa-capped").scrollHeight > viewport("sa-capped").clientHeight,
      short: viewport("sa-short").getBoundingClientRect().height,
      shortRange: viewport("sa-short").scrollHeight - viewport("sa-short").clientHeight,
      panelBands: [
        document.getElementById("sa-panel-header").getBoundingClientRect().height,
        document.getElementById("sa-panel-footer").getBoundingClientRect().height,
      ],
      panel: viewport("sa-panel").getBoundingClientRect().height,
      panelBound: panelBound.clientHeight,
      panelScrolls: viewport("sa-panel").scrollHeight > viewport("sa-panel").clientHeight,
      verticalText: [
        document.querySelector("#sa-vertical [data-slot=scroll-area-content]").clientWidth,
        viewport("sa-vertical").clientWidth,
        viewport("sa-vertical").scrollWidth,
      ],
    };
  });

  assert.deepEqual(bounds.both, bounds.bothBound, "the table's viewport fills its parent");
  assert.ok(bounds.bothRangeX >= 250, `the table scrolls ${bounds.bothRangeX}px sideways`);
  assert.ok(bounds.bothRangeY >= 220, `the table scrolls ${bounds.bothRangeY}px down`);
  assert.equal(bounds.capped, 240);
  assert.ok(bounds.cappedScrolls, "the capped list scrolls");
  assert.equal(bounds.short, 96);
  assert.equal(bounds.shortRange, 0);
  assert.deepEqual(bounds.panelBands, [48, 48]);
  assert.equal(bounds.panel, bounds.panelBound - 96);
  assert.ok(bounds.panelScrolls, "the panel's area scrolls");
  // Vertical-only text wraps to the viewport instead of scrolling sideways.
  assert.equal(bounds.verticalText[0], bounds.verticalText[1]);
  assert.equal(bounds.verticalText[2], bounds.verticalText[1]);

  // At rest the rails are hidden; hover shows both of the table's, 10px rails with 6px thumbs in
  // the input color, each stopping 10px short of the other's corner.
  await page.evaluate(() => document.getElementById("sa-both").scrollIntoView({ block: "center" }));
  assert.equal(await visibility(railOf("sa-both", "vertical")), "hidden 0");
  assert.equal(await visibility(railOf("sa-both", "horizontal")), "hidden 0");

  const bothRect = await rectOf("#sa-both");

  await page.mouse.move(bothRect.left + 100, bothRect.top + 100);
  await untilShown(railOf("sa-both", "vertical"));
  await untilShown(railOf("sa-both", "horizontal"));

  const rails = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const rail = (orientation) =>
      `#sa-both > [data-slot=scroll-area-scrollbar][data-orientation=${orientation}]`;
    const vertical = rect(rail("vertical"));
    const horizontal = rect(rail("horizontal"));
    const verticalThumb = rect(`${rail("vertical")} > [data-slot=scroll-area-thumb]`);
    const horizontalThumb = rect(`${rail("horizontal")} > [data-slot=scroll-area-thumb]`);
    const root = rect("#sa-both");

    return {
      vertical: vertical.width,
      horizontal: horizontal.height,
      verticalThumb: verticalThumb.width,
      horizontalThumb: horizontalThumb.height,
      thumbColor: getComputedStyle(
        document.querySelector(`${rail("vertical")} > [data-slot=scroll-area-thumb]`),
      ).backgroundColor,
      horizontalEnd: root.right - horizontal.right,
      verticalEnd: root.bottom - vertical.bottom,
    };
  });

  assert.deepEqual(rails, {
    vertical: 10,
    horizontal: 10,
    verticalThumb: 6,
    horizontalThumb: 6,
    thumbColor: displayInput,
    horizontalEnd: 10,
    verticalEnd: 10,
  });

  // The rail under the pointer darkens its thumb, and dragging the thumb scrolls.
  const verticalThumb = await rectOf(thumbOf("sa-both", "vertical"));

  await page.mouse.move(verticalThumb.left + 3, verticalThumb.top + 5);
  await page.waitForFunction(
    ([selector, color]) =>
      getComputedStyle(document.querySelector(selector)).backgroundColor === color,
    [thumbOf("sa-both", "vertical"), displayMutedForeground],
  );
  await page.mouse.down();
  await page.mouse.move(verticalThumb.left + 3, verticalThumb.top + 45, { steps: 4 });
  await page.mouse.up();
  assert.ok((await scrollOf(viewportOf("sa-both"))).top > 0, "dragging the thumb scrolls");

  // The template reference's viewport() scrolls the table.
  await page.evaluate(
    (selector) => document.querySelector(selector).scrollTo({ left: 0, top: 0 }),
    viewportOf("sa-both"),
  );
  await page.click("#sa-scroll");
  await page.waitForFunction(
    (selector) => document.querySelector(selector).scrollTop === 220,
    viewportOf("sa-both"),
  );
  assert.deepEqual(await scrollOf(viewportOf("sa-both")), { left: 250, top: 220 });

  // Leaving hides the rails: data-visible goes 600ms after the last scroll or hover, then the
  // 120ms fade ends hidden.
  await page.mouse.move(0, 0);
  await page.waitForFunction(
    (selector) => !document.querySelector(selector).hasAttribute("data-visible"),
    railOf("sa-both", "vertical"),
  );
  await untilHidden(railOf("sa-both", "vertical"));
  await untilHidden(railOf("sa-both", "horizontal"));

  // A list shorter than its cap shows no rail, even on hover.
  const shortRect = await rectOf("#sa-short");

  await page.mouse.move(shortRect.left + 20, shortRect.top + 20);
  await page.waitForTimeout(200);
  assert.equal(await hasAttribute("sa-short", "data-overflow-y"), false);
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).hasAttribute("data-visible"),
      railOf("sa-short", "vertical"),
    ),
    false,
  );
  assert.equal(await visibility(railOf("sa-short", "vertical")), "hidden 0");
  await page.mouse.move(0, 0);

  // The name is the viewport's: regions named by the heading and the input, renamed by binding,
  // and never on the root.
  assert.equal(await page.getByRole("region", { name: "Addresses" }).count(), 1);
  assert.equal(await page.getByRole("region", { name: "Delivery notes", exact: true }).count(), 1);
  await page.click("#sa-rename");
  await page.getByRole("region", { name: "Updated delivery notes" }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Delivery notes", exact: true }).count(), 0);
  assert.equal(await page.getAttribute("#sa-vertical", "aria-label"), null);
  assert.equal(await page.getAttribute("#sa-vertical", "role"), null);

  // Tab reaches the viewport after the button before it, with an inset 2px ring.
  await page.focus("#sa-scroll");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.parentElement.id), "sa-vertical");
  assert.deepEqual(await outline(viewportOf("sa-vertical")), {
    style: "solid",
    width: "2px",
    offset: "-2px",
    color: "rgb(76, 196, 111)",
  });

  // The rails fade in 120ms, and not under reduced motion.
  assert.deepEqual(
    await styleOf(railOf("sa-both", "vertical"), ["transitionProperty", "transitionDuration"]),
    { transitionProperty: "opacity, visibility", transitionDuration: "0.12s" },
  );

  // Avatar: the size ladder and its text, circles and the square's stepped radius, and class
  // sizes, which keep their size step's radius.
  await page.waitForFunction(
    () => document.querySelectorAll("[data-slot=avatar][data-status=loading]").length === 0,
  );

  const avatars = await page.evaluate(() => {
    const result = {};

    for (const shape of ["circle", "square"]) {
      for (const size of ["sm", "md", "lg"]) {
        const root = document.getElementById(`avatar-${shape}-${size}`);
        const fallback = document.querySelector(`#avatar-${shape}-${size}-idle > span`);
        const style = getComputedStyle(root);

        result[`${shape}-${size}`] = {
          box: `${style.width} ${style.height}`,
          radius: style.borderTopLeftRadius,
          ring: (({ boxShadow, width, height }) => `${boxShadow} | ${width} ${height}`)(
            getComputedStyle(root, "::after"),
          ),
          text: `${getComputedStyle(fallback).fontSize} ${getComputedStyle(fallback).fontWeight}`,
        };
      }
    }

    for (const id of ["avatar-large", "avatar-square-large", "avatar-square-large-radius"]) {
      const style = getComputedStyle(document.getElementById(id));

      result[id] = { box: `${style.width} ${style.height}`, radius: style.borderTopLeftRadius };
    }

    return result;
  });
  // rounded-full computes to a large length, not 50%: a circle's radius reaches half its side.
  for (const [size, side] of [
    ["sm", 24],
    ["md", 32],
    ["lg", 40],
  ]) {
    const circle = avatars[`circle-${size}`];

    assert.equal(circle.box, `${side}px ${side}px`, `circle ${size} box`);
    assert.ok(parseFloat(circle.radius) >= side / 2, `circle ${size} radius ${circle.radius}`);
  }

  // The 1px inset ring is a rendered ::after box filling the root's grid cell, after the photo,
  // so it paints over a loaded photo's edge too.
  for (const key of [
    "circle-sm",
    "circle-md",
    "circle-lg",
    "square-sm",
    "square-md",
    "square-lg",
  ]) {
    const avatar = avatars[key];
    const side = avatar.box.split(" ")[0];

    assert.match(
      avatar.ring,
      new RegExp(`0px 0px 0px 1px inset \\| ${side} ${side}$`),
      `${key} ring`,
    );
    delete avatar.ring;
  }
  assert.deepEqual(
    {
      sm: avatars["square-sm"],
      md: avatars["square-md"],
      lg: avatars["square-lg"],
      circleText: [avatars["circle-sm"].text, avatars["circle-md"].text, avatars["circle-lg"].text],
      large: avatars["avatar-large"].box,
      squareLarge: avatars["avatar-square-large"],
      squareLargeRadius: avatars["avatar-square-large-radius"],
    },
    {
      sm: { box: "24px 24px", radius: "6px", text: "12px 600" },
      md: { box: "32px 32px", radius: "8px", text: "12px 600" },
      lg: { box: "40px 40px", radius: "10px", text: "13px 600" },
      circleText: ["12px 600", "12px 600", "13px 600"],
      large: "128px 128px",
      squareLarge: { box: "128px 128px", radius: "8px" },
      squareLargeRadius: { box: "128px 128px", radius: "10px" },
    },
  );

  // Loaded: the photo covers the box and the fallback is hidden. Failed: the image is hidden and
  // the fallback shows at once. No source: the fallback, also with an icon.
  const avatarStates = await page.evaluate(() => {
    const parts = (id) => {
      const image = document.querySelector(`#${id} > img`);
      const fallback = document.querySelector(`#${id} > [data-slot=avatar-fallback]`);

      return {
        status: document.getElementById(id).getAttribute("data-status"),
        image: image && `${getComputedStyle(image).display} ${getComputedStyle(image).objectFit}`,
        fallback: `${getComputedStyle(fallback).display} ${getComputedStyle(fallback).opacity}`,
      };
    };
    const icon = document.querySelector("#avatar-square-icon svg").getBoundingClientRect();

    return {
      loaded: parts("avatar-square-lg"),
      error: parts("avatar-circle-md-error"),
      idle: parts("avatar-circle-md-idle"),
      icon: `${icon.width} ${icon.height}`,
    };
  });

  assert.deepEqual(avatarStates, {
    loaded: { status: "loaded", image: "block cover", fallback: "none 1" },
    error: { status: "error", image: "none cover", fallback: "grid 1" },
    idle: { status: "idle", image: "none cover", fallback: "grid 1" },
    icon: "22 22",
  });

  // A root-named avatar is one image, named once.
  assert.equal(await page.getByRole("img", { name: "Grace Hopper" }).count(), 1);

  // While a photo loads, the fallback waits 600ms before it paints, unless the consumer's
  // important animate-none! removes the wait.
  let releasePhotos;
  const photosReleased = new Promise((release) => {
    releasePhotos = release;
  });

  await page.route(/\/slow-avatar(-2)?\.svg$/, async (route) => {
    await photosReleased;
    await route.fulfill({
      contentType: "image/svg+xml",
      body: "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#26803f'/></svg>",
    });
  });

  const fallbackLook = () =>
    page.evaluate(() => {
      const look = (id) => {
        const style = getComputedStyle(document.getElementById(id));

        return `${style.opacity} ${style.animationName === "none" ? "none" : "delay"}`;
      };

      return {
        status: document.getElementById("avatar-slow").getAttribute("data-status"),
        slow: look("avatar-slow-fallback"),
        now: look("avatar-slow-now-fallback"),
      };
    });

  assert.equal(await attribute("avatar-slow", "data-status"), "idle");
  await page.click("#avatar-load");
  await until("avatar-slow", "data-status", "loading");

  const loadingAt = Date.now();

  await page.waitForTimeout(100);
  assert.deepEqual(await fallbackLook(), {
    status: "loading",
    slow: "0 delay",
    now: "1 none",
  });
  await page.waitForTimeout(Math.max(0, 750 - (Date.now() - loadingAt)));
  assert.deepEqual(await fallbackLook(), {
    status: "loading",
    slow: "1 delay",
    now: "1 none",
  });
  releasePhotos();
  await until("avatar-slow", "data-status", "loaded");
  assert.equal(
    (await styleOf("#avatar-slow-fallback", ["display"])).display,
    "none",
    "the loaded photo hides the fallback",
  );
  await page.unroute(/\/slow-avatar(-2)?\.svg$/);

  // Progress: a 2px neutral bar, filled to its value, complete at full width, and sweeping a 40%
  // segment while its value is unknown, unless the consumer stopped it with the important class.
  const barLooks = () =>
    page.evaluate(() => {
      const look = (id) => {
        const bar = document.getElementById(id);
        const fill = bar.querySelector("[data-slot=progress-fill]");
        const barStyle = getComputedStyle(bar);
        const fillStyle = getComputedStyle(fill);

        return {
          height: bar.getBoundingClientRect().height,
          share: Math.round((fill.getBoundingClientRect().width / bar.clientWidth) * 100),
          track: barStyle.backgroundColor,
          fill: fillStyle.backgroundColor,
          opacity: fillStyle.opacity,
          animation: fillStyle.animationName === "none" ? "none" : "sweep",
        };
      };

      return {
        upload: look("progress-40"),
        complete: look("progress-complete"),
        unknown: look("progress-unknown"),
        still: look("progress-still"),
        campaign: look("progress-campaign"),
      };
    });
  const looks = await barLooks();

  assert.deepEqual(looks, {
    upload: {
      height: 2,
      share: 40,
      track: displayInput,
      fill: foreground,
      opacity: "1",
      animation: "none",
    },
    complete: {
      height: 2,
      share: 100,
      track: displayInput,
      fill: foreground,
      opacity: "1",
      animation: "none",
    },
    unknown: {
      height: 4,
      share: 40,
      track: displayInput,
      fill: foreground,
      opacity: "1",
      animation: "sweep",
    },
    still: {
      height: 2,
      share: 40,
      track: displayInput,
      fill: foreground,
      opacity: "1",
      animation: "none",
    },
    campaign: {
      height: 24,
      share: 62,
      track: displayInput,
      fill: foreground,
      opacity: "1",
      animation: "none",
    },
  });
  assert.equal(await attribute("progress-complete", "data-complete"), "");
  assert.equal(await attribute("progress-unknown", "aria-valuenow"), null);
  await assertSweep("#progress-unknown > [data-slot=progress-fill]");
  await assertStill("#progress-still > [data-slot=progress-fill]");
  // The visible text beside the campaign bar is its value text.
  assert.equal(
    await page.textContent("#progress-campaign-text").then((text) => text.trim()),
    await attribute("progress-campaign", "aria-valuetext"),
  );
  assert.equal(await attribute("progress-campaign", "aria-valuetext"), "62%");

  // The dialog steps recipe: the bar runs flush to the dialog's border, 20px below the header's
  // text and 20px above the body's, and stays 2px when the dialog runs out of height.
  const stepsLayout = () =>
    page.evaluate(() => {
      const rect = (id) => document.getElementById(id).getBoundingClientRect();
      const dialog = rect("steps-dialog");
      const bar = rect("steps-progress");
      const body = document.querySelector("#steps-body [data-slot=scroll-area-viewport]");

      return {
        start: bar.left - dialog.left,
        end: dialog.right - bar.right,
        above: bar.top - rect("steps-description").bottom,
        below: document.querySelector("#steps-body p").getBoundingClientRect().top - bar.bottom,
        height: bar.height,
        bodyScrolls: body.scrollHeight > body.clientHeight,
      };
    });

  await page.click("#steps-trigger");
  await page.waitForFunction(() => {
    const dialog = document.getElementById("steps-dialog");

    return dialog.open && dialog.getAnimations().length === 0;
  });

  const steps = await stepsLayout();

  near(steps.start, 1, 0.5, "the steps bar's start");
  near(steps.end, 1, 0.5, "the steps bar's end");
  near(steps.above, 20, 0.5, "the space above the steps bar");
  near(steps.below, 20, 0.5, "the space below the steps bar");
  assert.equal(steps.height, 2);
  assert.equal(steps.bodyScrolls, false);
  await page.setViewportSize({ width: 1280, height: 400 });

  const compactSteps = await stepsLayout();

  assert.equal(compactSteps.height, 2);
  assert.equal(compactSteps.bodyScrolls, true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("steps-dialog").open);

  // Light tokens: the thumb, the avatar's fill and text, and the bar's track and fill.
  const lightDisplay = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));

    return {
      thumb: style("#sa-light > [data-slot=scroll-area-scrollbar] > [data-slot=scroll-area-thumb]")
        .backgroundColor,
      avatar: `${style("#avatar-light").backgroundColor} ${style("#avatar-light").color}`,
      bar: `${style("#progress-light").backgroundColor} ${style("#progress-light > span").backgroundColor}`,
    };
  });

  assert.deepEqual(lightDisplay, {
    thumb: "rgb(133, 133, 129)",
    avatar: "rgb(251, 251, 250) rgb(91, 91, 88)",
    bar: "rgb(133, 133, 129) rgb(27, 27, 27)",
  });

  // Reduced motion: no rail fade, and the unknown bar is a still, full, half-opacity bar; the
  // sweep comes back with motion.
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    (await styleOf(railOf("sa-both", "vertical"), ["transitionProperty"])).transitionProperty,
    "none",
  );
  await assertStill("#progress-unknown > [data-slot=progress-fill]");
  assert.deepEqual((await barLooks()).unknown, {
    height: 4,
    share: 100,
    track: displayInput,
    fill: foreground,
    opacity: "0.5",
    animation: "none",
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await assertSweep("#progress-unknown > [data-slot=progress-fill]");

  // Forced colors: a CanvasText thumb on a Canvas rail, a CanvasText ring around the avatar, and
  // a GrayText track with a CanvasText fill that keeps its 2px.
  await page.emulateMedia({ forcedColors: "active" });

  const forcedDisplay = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const rail = "#sa-both > [data-slot=scroll-area-scrollbar][data-orientation=vertical]";

    return {
      thumb: style(`${rail} > [data-slot=scroll-area-thumb]`).backgroundColor,
      rail: style(rail).backgroundColor,
      avatar: `${style("#avatar-circle-md-idle").borderTopWidth} ${style("#avatar-circle-md-idle").borderTopColor}`,
      track: style("#progress-40").backgroundColor,
      fill: style("#progress-40 > span").backgroundColor,
      height: document.getElementById("progress-40").getBoundingClientRect().height,
    };
  });

  // Hovering the rail keeps the thumb CanvasText: the hover color applies only outside forced colors.
  const forcedRail = "#sa-both > [data-slot=scroll-area-scrollbar][data-orientation=vertical]";

  await page.hover("#sa-both");
  await page.waitForSelector(`${forcedRail}[data-visible]`);
  await page.hover(forcedRail);
  forcedDisplay.hoveredThumb = await page.evaluate(
    (rail) =>
      getComputedStyle(document.querySelector(`${rail} > [data-slot=scroll-area-thumb]`))
        .backgroundColor,
    forcedRail,
  );
  await page.mouse.move(0, 0);

  assert.deepEqual(forcedDisplay, {
    thumb: systemColors.canvasText,
    hoveredThumb: systemColors.canvasText,
    rail: systemColors.canvas,
    avatar: `1px ${systemColors.canvasText}`,
    track: systemColors.grayText,
    fill: systemColors.canvasText,
    height: 2,
  });
  await page.emulateMedia({ forcedColors: "none" });

  // Toast. Exact geometry is a DPR-1 value at 1280px.
  //
  // Server rendering: the region is a named polite live region with an empty list, before any
  // toast exists.
  const regionStart = html.search(/<div\b[^>]*\bdata-slot="toast-region"/);

  assert.ok(regionStart >= 0, "the server HTML has the toast region");

  const serverRegion = html.slice(regionStart, html.indexOf("</section>", regionStart));
  const liveRegion = /<section\b[^>]*>/.exec(serverRegion)[0];
  const toastList = /<ol\b[^>]*>/.exec(serverRegion)[0];

  assert.match(liveRegion, /\brole="region"/);
  assert.match(liveRegion, /\baria-live="polite"/);
  assert.match(liveRegion, /\baria-label="Notifications"/);
  assert.match(toastList, /\brole="list"/);
  assert.match(toastList, /\bdata-slot="toast-list"/);
  assert.doesNotMatch(serverRegion, /<li\b/, "no toast in the server HTML");

  const toastRegion = "[data-slot=toast-region]";
  const toastCard = "[data-slot=toast]";
  const toastEvidence = join(app, "toast-evidence");

  await mkdir(toastEvidence, { recursive: true });

  // Per card: layout and painted geometry, the transition, the content's opacity and each
  // button's box and inset from the card's inline end. Per focused control: the same samples
  // the focus checks read, with the card's inner clip in viewport pixels.
  const installToastProbes = () =>
    page.evaluate(() => {
      const box = (element) => {
        const rect = element.getBoundingClientRect();

        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        };
      };

      window.deckMetrics = () => {
        const region = document.querySelector("[data-slot=toast-region]");

        return {
          hover: region.matches(":hover"),
          focusWithin: region.matches(":focus-within"),
          regionWidth: region.offsetWidth,
          region: box(region),
          viewport: {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          },
          cards: [...region.querySelectorAll("[data-slot=toast]")].map((card) => {
            const style = getComputedStyle(card);
            const cardRight = card.getBoundingClientRect().right;

            return {
              title: card.querySelector("[data-slot=toast-title]").textContent.trim(),
              leaving: card.hasAttribute("data-leaving"),
              offsetWidth: card.offsetWidth,
              offsetHeight: card.offsetHeight,
              scrollHeight: card.scrollHeight,
              clientHeight: card.clientHeight,
              rect: box(card),
              scale: style.scale,
              overflow: style.overflow,
              transitionProperty: style.transitionProperty,
              bodyOpacity: getComputedStyle(card.querySelector(":scope > div")).opacity,
              children: [...card.children].map((child) => {
                const look = getComputedStyle(child);

                return { opacity: look.opacity, visibility: look.visibility };
              }),
              controls: [...card.querySelectorAll("button")].map((button) => ({
                text: button.textContent.trim(),
                label: button.getAttribute("aria-label"),
                rect: box(button),
                inlineEndInset: cardRight - button.getBoundingClientRect().right,
                scrollWidth: button.scrollWidth,
                clientWidth: button.clientWidth,
              })),
            };
          }),
        };
      };

      window.focusMetrics = () => {
        const control = document.activeElement;
        const card = control.closest("[data-slot=toast]");

        if (!card) {
          return { outside: control.outerHTML };
        }

        const look = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const scaleX = cardRect.width / card.offsetWidth;
        const scaleY = cardRect.height / card.offsetHeight;
        const clip = {
          left: cardRect.left + card.clientLeft * scaleX,
          top: cardRect.top + card.clientTop * scaleY,
          right: cardRect.left + (card.clientLeft + card.clientWidth) * scaleX,
          bottom: cardRect.top + (card.clientTop + card.clientHeight) * scaleY,
        };
        const ring = parseFloat(look.outlineWidth) + parseFloat(look.outlineOffset);
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);

        const list = card.parentElement;
        const listRect = list.getBoundingClientRect();

        return {
          title: card.querySelector("[data-slot=toast-title]").textContent.trim(),
          text: control.textContent.trim(),
          label: control.getAttribute("aria-label"),
          rect: box(control),
          ring,
          // The list's scrollport, in viewport pixels.
          list: {
            scrollTop: list.scrollTop,
            scrollHeight: list.scrollHeight,
            clientHeight: list.clientHeight,
            clip: {
              left: listRect.left + list.clientLeft,
              top: listRect.top + list.clientTop,
              right: listRect.left + list.clientLeft + list.clientWidth,
              bottom: listRect.top + list.clientTop + list.clientHeight,
            },
          },
          ownOpacity: look.opacity,
          bodyOpacity: getComputedStyle(card.querySelector(":scope > div")).opacity,
          transitionProperty: getComputedStyle(card).transitionProperty,
          offsetHeight: card.offsetHeight,
          scrollHeight: card.scrollHeight,
          clientHeight: card.clientHeight,
          ringInsideClip:
            rect.left - ring >= clip.left &&
            rect.top - ring >= clip.top &&
            rect.right + ring <= clip.right &&
            rect.bottom + ring <= clip.bottom,
          hitIsControl: hit?.closest("button") === control,
          focusVisible: control.matches(":focus-visible"),
          outline: {
            style: look.outlineStyle,
            width: look.outlineWidth,
            offset: look.outlineOffset,
            color: look.outlineColor,
          },
          deck: window.deckMetrics(),
        };
      };
    });
  const deckMetrics = () => page.evaluate(() => window.deckMetrics());
  const toastCount = () =>
    page.evaluate(() => document.querySelectorAll("[data-slot=toast]").length);
  // A fresh page with the fixtures' toasts, the pointer away from the region and focus just
  // before it.
  const freshDeck = async (...fixtures) => {
    await fresh();
    await installToastProbes();

    for (const fixture of fixtures) {
      await page.click(`#${fixture}`);
    }

    await page.mouse.move(10, 10);
    await page.focus("#before-region");
    await page.waitForTimeout(250);
  };
  const scaleOf = (card) => parseFloat(card.scale);

  // Collapsed, three title-only toasts: every card is the region's layout width and the one-line
  // height, painted scaled around its top centre and lifted 8px per card behind the front one.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDeck("toast-successes");

  const collapsedDeck = await deckMetrics();

  assert.equal(collapsedDeck.regionWidth, 384);
  assert.deepEqual(
    collapsedDeck.cards.map((card) => card.title),
    ["Release notes saved", "Task updated", "Checklist saved"],
    "newest first",
  );
  collapsedDeck.cards.forEach((card, index) => {
    assert.equal(card.offsetWidth, collapsedDeck.regionWidth, `card ${index} layout width`);
    assert.equal(card.offsetHeight, 58, `card ${index} layout height`);
    near(scaleOf(card), 1 - 0.035 * index, 1e-6, `card ${index} scale`);
    near(card.rect.width, card.offsetWidth * scaleOf(card), 0.02, `card ${index} painted width`);
    near(card.rect.height, 58 * scaleOf(card), 0.02, `card ${index} painted height`);
    near(card.rect.top, collapsedDeck.cards[0].rect.top - 8 * index, 0.02, `card ${index} peek`);
  });
  near(collapsedDeck.viewport.width - collapsedDeck.region.right, 20, 0.5, "the region's end");
  near(collapsedDeck.viewport.height - collapsedDeck.region.bottom, 20, 0.5, "the region's bottom");

  // A tall front card keeps 8px peeks: the fourth toast takes the limit's oldest away at once,
  // since reduced motion has no exit animation.
  await freshDeck("toast-successes", "toast-tall");

  const tallDeck = await deckMetrics();

  assert.equal(tallDeck.cards.length, 3);
  assert.equal(tallDeck.cards[0].title, "Release is ready for review");
  assert.ok(tallDeck.cards[0].offsetHeight > 58, "the front card is taller than one line");
  for (const index of [1, 2]) {
    assert.equal(tallDeck.cards[index].offsetHeight, 58);
    near(tallDeck.cards[index].rect.top, tallDeck.cards[0].rect.top - 8 * index, 0.02, "tall peek");
  }

  // Accessibility: while collapsed, the back cards' text and buttons stay in the tree, a list of
  // three items; only their content is transparent.
  await freshDeck("toast-successes");

  const deckTree = await page.locator(`${toastRegion} > section`).ariaSnapshot();

  assert.match(deckTree, /^- region "Notifications":/);
  assert.match(deckTree, /^ {2}- list:/m);
  assert.equal(deckTree.match(/- listitem:/g)?.length, 3, deckTree);
  for (const title of ["Checklist saved", "Task updated", "Release notes saved"]) {
    assert.ok(deckTree.includes(title), `${title} in the tree`);
  }
  assert.equal(deckTree.match(/- button "Close"/g)?.length, 3, deckTree);
  for (const card of (await deckMetrics()).cards.slice(1)) {
    for (const child of card.children) {
      assert.deepEqual(child, { opacity: "0", visibility: "visible" });
    }
  }

  // Two toasts added in one handler both render, newest first, in the tree.
  await freshDeck("toast-pair");

  const pairTree = await page.locator(`${toastRegion} > section`).ariaSnapshot();

  assert.ok(
    pairTree.indexOf("Second in handler") >= 0 &&
      pairTree.indexOf("First in handler") > pairTree.indexOf("Second in handler"),
    pairTree,
  );

  // Hover fans the deck out into a column, newest at the bottom: every card keeps the region's
  // layout width and paints unscaled, the newest card's controls stay exactly where they were,
  // and an older card's Close sits 13px in from its inline end (12px padding and the border).
  const expansion = async (fixtures, front) => {
    await freshDeck(...fixtures);

    const collapsed = await deckMetrics();

    await page.hover(toastRegion);
    await rendered();

    const expanded = await deckMetrics();

    assert.equal(expanded.hover, true);
    assert.equal(collapsed.cards[0].title, front);
    for (const state of [collapsed, expanded]) {
      for (const card of state.cards) {
        assert.equal(card.offsetWidth, state.regionWidth, `${card.title} layout width`);
      }
    }
    collapsed.cards.forEach((card, index) => {
      near(card.rect.width, card.offsetWidth * (1 - 0.035 * index), 0.02, `${card.title} painted`);

      if (index > 0) {
        assert.equal(card.offsetHeight, 58, `${card.title} collapsed height`);
      }
    });
    expanded.cards.forEach((card, index) => {
      assert.equal(card.scale, "1", `${card.title} expanded scale`);
      near(card.rect.width, card.offsetWidth, 0.02, `${card.title} expanded width`);

      if (index > 0) {
        near(card.controls.at(-1).inlineEndInset, 13, 0.02, `${card.title} Close inset`);
        assert.equal(card.overflow, "hidden");
        assert.equal(card.clientHeight, card.scrollHeight, `${card.title} unclipped`);
      }
    });
    assert.deepEqual(
      expanded.cards[0].controls.map((control) => control.rect),
      collapsed.cards[0].controls.map((control) => control.rect),
      "the newest card's controls stay put",
    );

    return expanded;
  };

  await expansion(["toast-successes"], "Release notes saved");

  const reloadDeck = await expansion(
    ["toast-successes", "toast-reload"],
    "A new version is available",
  );

  assert.deepEqual(
    reloadDeck.cards[0].controls.map((control) => control.text || control.label),
    ["Reload", "Close"],
  );
  await page.click(`${toastCard}:first-child button:text-is("Reload")`);
  await untilText("toast-status", "Reloaded");
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("[data-slot=toast-title]")].some(
        (title) => title.textContent.trim() === "A new version is available",
      ),
  );
  assert.equal(await toastCount(), 2);

  // Keyboard focus into any card, by Tab, Shift+Tab or focus(), shows the control at once: on the
  // focus event's task and the first frame, the deck is already expanded with no transition,
  // nothing is clipped, and the control and its ring are inside its card and on top.
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const focusTrial = async (name, drive) => {
    await freshDeck("toast-actions");
    // A real Tab and Shift+Tab outside the region, so focus() counts as keyboard focus too.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    assert.equal(await activeId(), "before-region");

    if (name === "reverse") {
      await page.focus("#after-region");
    }

    await page.evaluate(() => {
      window.toastFocusFrame = null;
      document.querySelector("[data-slot=toast-region]").addEventListener(
        "focusin",
        () => {
          window.toastFocusTask = window.focusMetrics();
          requestAnimationFrame(() => {
            window.toastFocusFrame = window.focusMetrics();
          });
        },
        { once: true },
      );
    });
    await drive();
    await page.waitForFunction(() => window.toastFocusFrame !== null);

    const { task, frame } = await page.evaluate(() => ({
      task: window.toastFocusTask,
      frame: window.toastFocusFrame,
    }));

    await page.screenshot({ path: join(toastEvidence, `toast-focus-${name}-first.png`) });
    await page.waitForTimeout(250);

    const settledFocus = await page.evaluate(() => window.focusMetrics());

    await page.screenshot({ path: join(toastEvidence, `toast-focus-${name}-settled.png`) });

    for (const [sample, metrics] of [
      ["task", task],
      ["frame", frame],
      ["settled", settledFocus],
    ]) {
      const label = `${name} ${sample}`;

      assert.equal(metrics.ownOpacity, "1", label);
      assert.equal(metrics.bodyOpacity, "1", label);
      assert.equal(metrics.transitionProperty, "none", label);
      assert.equal(metrics.clientHeight, metrics.scrollHeight, `${label} unclipped`);
      assert.equal(metrics.ringInsideClip, true, `${label} ring inside the card`);
      assert.equal(metrics.hitIsControl, true, `${label} on top`);
      assert.equal(metrics.focusVisible, true, label);
      assert.deepEqual(metrics.outline, ringOutline(darkRing), label);
      assert.equal(metrics.deck.hover, false, `${label} pointer away`);
      assert.equal(metrics.deck.focusWithin, true, label);
      metrics.deck.cards.forEach((card, index) => {
        assert.equal(card.scale, "1", `${label} ${card.title} scale`);
        assert.equal(card.offsetWidth, metrics.deck.regionWidth, `${label} ${card.title} width`);

        if (index > 0) {
          assert.equal(card.overflow, "hidden", `${label} ${card.title} overflow`);
        }
      });
    }

    assert.equal(frame.offsetHeight, settledFocus.offsetHeight, `${name} final height at once`);

    return frame;
  };
  const focusCard = (index, button) => () =>
    page
      .locator(toastCard)
      .nth(index)
      .locator("button")
      .nth(button)
      .evaluate((control) => control.focus());

  const toastForward = await focusTrial("forward", () => page.keyboard.press("Tab"));

  assert.deepEqual([toastForward.title, toastForward.text], ["Newest card", "Newest action"]);

  const reverse = await focusTrial("reverse", () => page.keyboard.press("Shift+Tab"));

  assert.deepEqual([reverse.title, reverse.label], ["Oldest card", "Close"]);
  await focusTrial("newest-close", focusCard(0, 1));
  await focusTrial("middle-action", focusCard(1, 0));
  await focusTrial("middle-close", focusCard(1, 1));
  await focusTrial("oldest-action", focusCard(2, 0));

  const oldestClose = await focusTrial("oldest-close", focusCard(2, 1));

  assert.deepEqual([oldestClose.title, oldestClose.label], ["Oldest card", "Close"]);

  // Focus leaving collapses the deck again, with its transition back.
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "after-region");
  await page.waitForTimeout(250);

  const refolded = await deckMetrics();

  for (const card of refolded.cards.slice(1)) {
    assert.equal(card.offsetHeight, 58, `${card.title} collapsed again`);
    assert.equal(card.bodyOpacity, "0");
    assert.equal(card.transitionProperty, "height, translate, scale");
  }

  // The pointer: no point of a peek strip hits a back card's button, and clicking a peek as the
  // pointer arrives or 100ms into the fan-out runs no action and closes no toast.
  await freshDeck("toast-actions");

  const strips = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-slot=toast]")];
    const front = cards[0].getBoundingClientRect();
    const hits = [];
    const centres = [];

    cards.slice(1).forEach((card, offset) => {
      const rect = card.getBoundingClientRect();
      const bottom = front.top - 8 * offset;

      centres.push({ x: rect.left + rect.width / 2, y: (rect.top + bottom) / 2 });

      for (let y = rect.top; y < bottom; y += 2) {
        for (let x = rect.left; x <= rect.right; x += 2) {
          const button = document.elementFromPoint(x, y)?.closest("button");

          if (button && cards.slice(1).some((back) => back.contains(button))) {
            hits.push({ x, y, button: button.textContent.trim() });
          }
        }
      }
    });

    return { hits, centres };
  });

  assert.deepEqual(strips.hits, [], "a peek strip hits a back card's button");
  assert.equal(strips.centres.length, 2);
  for (const [index, centre] of strips.centres.entries()) {
    for (const delay of [0, 100]) {
      await freshDeck("toast-actions");
      await page.mouse.move(centre.x, centre.y);
      await page.waitForTimeout(delay);
      await page.mouse.down();
      await page.mouse.up();
      await rendered();
      assert.equal(await textOf("toast-status"), "", `peek ${index + 1} after ${delay}ms`);
      assert.equal(
        await page.evaluate(
          () => document.querySelectorAll("[data-slot=toast]:not([data-leaving])").length,
        ),
        3,
        `peek ${index + 1} after ${delay}ms`,
      );
    }
  }

  // Close by keyboard: with others open, focus goes to the region and the card leaves; the last
  // toast gives focus back to what had it before the region.
  const regionFocused = () =>
    page.evaluate(
      () => document.activeElement === document.querySelector("[data-slot=toast-region] > section"),
    );
  const untilGone = (title) =>
    page.waitForFunction(
      (title) =>
        ![...document.querySelectorAll("[data-slot=toast-title]")].some(
          (element) => element.textContent.trim() === title,
        ),
      title,
    );

  await freshDeck("toast-actions");
  await focusCard(1, 1)();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-slot=toast]:nth-child(2)");

    return card?.hasAttribute("data-leaving") && card.hasAttribute("inert");
  });
  assert.equal(await regionFocused(), true, "focus on the region");
  await untilGone("Middle card");
  assert.equal(await toastCount(), 2);

  await freshDeck("toast-reload");
  await focusCard(0, 1)();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.id === "before-region");
  await untilGone("A new version is available");

  // The shadow box under the expanded deck shows only while a card is: closing the last toast by
  // pointer, with nothing focused before, leaves focus on the empty region and no shadow.
  await freshDeck("toast-reload");
  await page.evaluate(() => document.activeElement.blur());
  const blank = await page.locator("#toasts").boundingBox();

  await page.mouse.click(blank.x + 2, blank.y + 2);
  await page.locator("[data-slot=toast-close]").click();
  await untilGone("A new version is available");
  assert.equal(await regionFocused(), true, "focus falls back to the empty region");
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.querySelector("[data-slot=toast-region]"), "::after").display,
    ),
    "none",
    "no shadow box once the last toast is gone",
  );

  // The kind icons' tints, in both themes.
  const kindColors = () =>
    page.evaluate(() => {
      const token = (name) => {
        const probe = document.createElement("span");

        probe.style.color = `var(--${name})`;
        document.body.append(probe);

        const color = getComputedStyle(probe).color;

        probe.remove();

        return color;
      };
      const icon = (kind) =>
        getComputedStyle(document.querySelector(`[data-kind=${kind}] > [data-slot=toast-icon]`))
          .color;

      return {
        icons: { success: icon("success"), warning: icon("warning"), error: icon("error") },
        tokens: {
          success: token("success"),
          warning: token("warning"),
          error: token("destructive-text"),
        },
      };
    });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDeck("toast-pair", "toast-error");

  const darkKinds = await kindColors();

  assert.deepEqual(darkKinds.icons, darkKinds.tokens, "dark");
  await page.evaluate(() => document.documentElement.classList.add("light"));

  const lightKinds = await kindColors();

  assert.deepEqual(lightKinds.icons, lightKinds.tokens, "light");
  assert.notDeepEqual(lightKinds.icons, darkKinds.icons);

  const infoColor = () =>
    page.evaluate(() => {
      const probe = document.createElement("span");

      probe.style.color = "var(--muted-foreground)";
      document.body.append(probe);

      const token = getComputedStyle(probe).color;

      probe.remove();

      return {
        icon: getComputedStyle(document.querySelector("[data-kind=info] > [data-slot=toast-icon]"))
          .color,
        token,
      };
    });

  await freshDeck("toast-reload");

  const darkInfo = await infoColor();

  assert.equal(darkInfo.icon, darkInfo.token);
  await page.evaluate(() => document.documentElement.classList.add("light"));

  const lightInfo = await infoColor();

  assert.equal(lightInfo.icon, lightInfo.token);
  assert.notEqual(lightInfo.icon, darkInfo.icon);
  await page.evaluate(() => document.documentElement.classList.remove("light"));

  // The limit: a fourth toast closes the oldest, with its exit.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await freshDeck("toast-successes");
  await page.click("#toast-error");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-slot=toast][data-leaving] [data-slot=toast-title]")].some(
      (title) => title.textContent.trim() === "Checklist saved",
    ),
  );
  await untilGone("Checklist saved");
  assert.deepEqual(
    (await deckMetrics()).cards.map((card) => card.title),
    ["Couldn't save your changes", "Release notes saved", "Task updated"],
  );

  // The timer: with the pointer and focus away from the region, a default toast starts leaving
  // within 6s (5s and scheduling jitter) and is removed after its exit.
  await fresh();
  await page.mouse.move(10, 10);
  await page.focus("#toast-timed");

  // When the toast's element is added and when it gets data-leaving, in page time.
  await page.evaluate(() => {
    const list = document.querySelector("[data-slot=toast-list]");

    window.timedToast = {};
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.addedNodes.length > 0 && window.timedToast.added === undefined) {
          window.timedToast.added = performance.now();
        }

        if (record.attributeName === "data-leaving" && window.timedToast.leaving === undefined) {
          window.timedToast.leaving = performance.now();
        }
      }
    }).observe(list, { childList: true, subtree: true, attributeFilter: ["data-leaving"] });
  });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.timedToast.leaving !== undefined, null, {
    timeout: 7000,
  });
  await untilGone("Saved with the default duration");

  const timed = await page.evaluate(() => window.timedToast);
  const timedFor = timed.leaving - timed.added;

  assert.ok(timedFor > 4900 && timedFor <= 6000, `the timed toast left after ${timedFor}ms`);

  // A narrow viewport keeps 20px on each side.
  await page.setViewportSize({ width: 390, height: 720 });
  assert.equal(
    await page.evaluate(() => document.querySelector("[data-slot=toast-region]").offsetWidth),
    350,
  );

  // A short viewport: the expanded deck scrolls within it, less the region's 20px insets. Hover
  // opens it with the newest card at the bottom and the pointer leaving folds it again; Tab
  // reaches every control, each scrolled into view with its ring by the first frame.
  const inside = (rect, ring, bounds, label) =>
    assert.ok(
      rect.left - ring >= bounds.left - 0.5 &&
        rect.top - ring >= bounds.top - 0.5 &&
        rect.right + ring <= bounds.right + 0.5 &&
        rect.bottom + ring <= bounds.bottom + 0.5,
      `${label}: ${JSON.stringify(rect)} ± ${ring} isn't inside ${JSON.stringify(bounds)}`,
    );
  const viewportBounds = ({ width, height }) => ({ left: 0, top: 0, right: width, bottom: height });

  await page.setViewportSize({ width: 1280, height: 720 });
  await freshDeck("toast-actions");
  await page.setViewportSize({ width: 320, height: 240 });
  await page.hover(toastRegion);
  await page.waitForTimeout(250);

  const shortOpen = await page.evaluate(() => {
    const list = document.querySelector("[data-slot=toast-list]");

    return {
      deck: window.deckMetrics(),
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
    };
  });

  assert.equal(shortOpen.deck.hover, true);
  assert.ok(shortOpen.scrollHeight > shortOpen.clientHeight, "the short deck overflows");
  assert.equal(shortOpen.scrollTop, 0, "opens at its end");
  near(shortOpen.deck.cards[0].rect.bottom, 240 - 20, 0.5, "the newest card at the bottom");
  inside(shortOpen.deck.cards[0].rect, 0, viewportBounds(shortOpen.deck.viewport), "newest card");

  // Scrolled to either end or between, a card running into the region's 20px insets is clipped
  // there: no point of the top or bottom 20px rows hits a toast.
  for (const [position, scrollTop] of [
    ["end", 0],
    ["middle", -60],
    ["start", -10_000],
  ]) {
    const insets = await page.evaluate((scrollTop) => {
      const list = document.querySelector("[data-slot=toast-list]");

      list.scrollTop = scrollTop;

      const height = document.documentElement.clientHeight;
      const width = document.documentElement.clientWidth;
      const hits = [];

      for (const y of [
        ...Array(20).keys(),
        ...Array.from({ length: 20 }, (_, i) => height - 20 + i),
      ]) {
        for (let x = 0; x < width; x += 4) {
          if (document.elementFromPoint(x, y)?.closest("[data-slot=toast]")) {
            hits.push([x, y]);
          }
        }
      }

      const cards = [...list.children].map((card) => card.getBoundingClientRect());

      return {
        hits,
        overTop: cards.some((card) => card.top < 20 && card.bottom > 0),
        overBottom: cards.some((card) => card.bottom > height - 20 && card.top < height),
      };
    }, scrollTop);

    assert.deepEqual(insets.hits, [], `scrolled to the ${position}, no toast in the insets`);
    assert.ok(
      insets.overTop || insets.overBottom,
      `scrolled to the ${position}, a card is clipped`,
    );
  }

  await page.evaluate(() => (document.querySelector("[data-slot=toast-list]").scrollTop = 0));
  await page.mouse.move(10, 10);
  await page.waitForTimeout(250);
  assert.equal((await deckMetrics()).hover, false, "the pointer leaves the expanded deck");

  await page.focus("#before-region");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "before-region");

  const shortStops = [];

  for (let stop = 0; stop < 6; stop += 1) {
    // Sampled on the first frame after focus and once settled.
    await page.evaluate(() => {
      window.toastFocusFrame = null;
      document
        .querySelector("[data-slot=toast-region]")
        .addEventListener(
          "focusin",
          () => requestAnimationFrame(() => (window.toastFocusFrame = window.focusMetrics())),
          { once: true },
        );
    });
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => window.toastFocusFrame !== null);

    const frame = await page.evaluate(() => window.toastFocusFrame);

    await page.waitForTimeout(250);

    const settled = await page.evaluate(() => window.focusMetrics());

    for (const [sample, metrics] of [
      ["frame", frame],
      ["settled", settled],
    ]) {
      const label = `short stop ${stop} ${sample}`;

      inside(metrics.rect, metrics.ring, viewportBounds(metrics.deck.viewport), label);
      inside(metrics.rect, metrics.ring, metrics.list.clip, `${label} in the list`);
      assert.equal(metrics.ringInsideClip, true, `${label} ring inside the card`);
      assert.equal(metrics.hitIsControl, true, `${label} on top`);
      assert.equal(metrics.focusVisible, true, label);
      assert.equal(metrics.transitionProperty, "none", label);
    }

    shortStops.push([settled.title, settled.text || settled.label, settled.list.scrollTop]);
  }

  await page.screenshot({ path: join(toastEvidence, "toast-short-oldest-close.png") });
  assert.deepEqual(
    shortStops.map(([title, control]) => [title, control]),
    [
      ["Newest card", "Newest action"],
      ["Newest card", "Close"],
      ["Middle card", "Middle action"],
      ["Middle card", "Close"],
      ["Oldest card", "Oldest action"],
      ["Oldest card", "Close"],
    ],
  );
  assert.ok(shortStops.at(-1)[2] < 0, "the list scrolled to the oldest card");

  // A long action label wraps inside the card at 320px: the card, the action and Close stay
  // inside the region and the viewport, collapsed and expanded.
  await page.setViewportSize({ width: 1280, height: 720 });
  await freshDeck("toast-long-action");
  await page.setViewportSize({ width: 320, height: 640 });
  await rendered();
  await page.screenshot({ path: join(toastEvidence, "toast-long-action.png") });

  for (const state of ["collapsed", "expanded"]) {
    if (state === "expanded") {
      await page.hover(toastRegion);
      await page.waitForTimeout(250);
    }

    const deck = await deckMetrics();
    const [card] = deck.cards;
    const [action, close] = card.controls;

    assert.equal(deck.regionWidth, 280);
    assert.equal(card.offsetWidth, 280, `${state} card width`);
    assert.equal(action.text, "Download the updated version of the application");
    assert.ok(action.rect.height > 28, `${state} the action wraps`);
    assert.ok(action.scrollWidth <= action.clientWidth, `${state} the action's label fits`);

    for (const [name, rect] of [
      ["card", card.rect],
      ["action", action.rect],
      ["Close", close.rect],
    ]) {
      inside(rect, 0, deck.region, `${state} ${name} in the region`);
      inside(rect, 0, viewportBounds(deck.viewport), `${state} ${name} in the viewport`);
    }
  }

  // A deck that fits doesn't keep the wheel: over the open toast, it scrolls the page.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => window.scrollY > 0, null, { timeout: 2000 });
  assert.equal(
    await page.evaluate(() => document.querySelector("[data-slot=toast-list]").scrollTop),
    0,
  );

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // Decodes one of Chromium's 8-bit RGB or RGBA screenshots into rows of [r, g, b]. The Calendar
  // and date entry blocks read pixels with it.
  const decodePng = (png) => {
    const data = [];
    let offset = 8;
    let width = 0;
    let height = 0;
    let channels = 0;

    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.toString("ascii", offset + 4, offset + 8);
      const body = png.subarray(offset + 8, offset + 8 + length);

      if (type === "IHDR") {
        width = body.readUInt32BE(0);
        height = body.readUInt32BE(4);
        assert.equal(body[8], 8, "8-bit PNG");
        assert.equal(body[12], 0, "non-interlaced PNG");
        assert.ok(body[9] === 2 || body[9] === 6, "RGB or RGBA PNG");
        channels = body[9] === 6 ? 4 : 3;
      }

      if (type === "IDAT") {
        data.push(body);
      }

      offset += length + 12;
    }

    const raw = inflateSync(Buffer.concat(data));
    const stride = width * channels;
    const pixels = Buffer.alloc(height * stride);

    for (let y = 0; y < height; y += 1) {
      const filter = raw[y * (stride + 1)];

      for (let x = 0; x < stride; x += 1) {
        const value = raw[y * (stride + 1) + 1 + x];
        const left = x >= channels ? pixels[y * stride + x - channels] : 0;
        const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
        const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
        let predictor = 0;

        if (filter === 1) {
          predictor = left;
        } else if (filter === 2) {
          predictor = up;
        } else if (filter === 3) {
          predictor = Math.floor((left + up) / 2);
        } else if (filter === 4) {
          const estimate = left + up - upLeft;
          const toLeft = Math.abs(estimate - left);
          const toUp = Math.abs(estimate - up);
          const toUpLeft = Math.abs(estimate - upLeft);

          if (toLeft <= toUp && toLeft <= toUpLeft) {
            predictor = left;
          } else if (toUp <= toUpLeft) {
            predictor = up;
          } else {
            predictor = upLeft;
          }
        }

        pixels[y * stride + x] = (value + predictor) & 0xff;
      }
    }

    return (x, y) => {
      const index = y * stride + x * channels;

      return [pixels[index], pixels[index + 1], pixels[index + 2]];
    };
  };
  // The viewport's pixels at whole CSS (DPR 1) coordinates, from one screenshot. Points are
  // offsets from layout edges, which can be fractional; Chromium paints boxes and outlines at
  // edges rounded to the nearest pixel, so the point is rounded the same way.
  const screenPixels = async (points) => {
    await rendered();

    const read = decodePng(await page.screenshot({ animations: "disabled" }));

    return points.map(([x, y]) => read(Math.round(x), Math.round(y)));
  };
  // The same, with the pointer out of the way.
  const pixelsAt = async (points) => {
    await page.mouse.move(0, 0);

    return screenPixels(points);
  };
  const channels = (color) => color.match(/[\d.]+/g).map(Number);
  // `color` painted over the opaque `ground`, as the compositor rounds it.
  const over = (color, ground) => {
    const [red, green, blue, alpha = 1] = channels(color);
    const under = Array.isArray(ground) ? ground : channels(ground);

    return [red, green, blue].map((value, index) =>
      Math.round(value * alpha + under[index] * (1 - alpha)),
    );
  };

  // Calendar, in its own block. Exact geometry and pixels are DPR-1 values. Every day root pins
  // today to 27 October 2026 and the Monday week start: October's rows are 28 September–4
  // October, 5–11, 12–18, 19–25 and 26 October–1 November.
  {
    const dayLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const day = (id, date) =>
      `#${id} td[aria-label="${dayLabel.format(new Date(`${date}T00:00:00Z`))}"]`;
    const chip = (id, date) => `${day(id, date)} > [data-slot=calendar-cell-label]`;
    const grid = (id) => `#${id} > [data-slot=calendar-grid]`;
    const slot = (id, name) => `#${id} [data-slot=calendar-${name}]`;
    const october = (from, to) => {
      const dates = [];

      for (let date = from; date <= to; date += 1) {
        dates.push(`2026-10-${String(date).padStart(2, "0")}`);
      }

      return dates;
    };
    const rect = (selector) =>
      page.evaluate((selector) => {
        const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();

        return { x, y, width, height };
      }, selector);
    const pseudo = (selector, which, properties) =>
      page.evaluate(
        ([selector, which, properties]) => {
          const style = getComputedStyle(document.querySelector(selector), which);

          return Object.fromEntries(properties.map((property) => [property, style[property]]));
        },
        [selector, which, properties],
      );
    // The band's computed color inside an element's subtree, so it follows a `.light` ancestor:
    // what `bg-foreground/8` computes to.
    const bandIn = (selector) =>
      page.evaluate((selector) => {
        const probe = document.createElement("span");

        probe.style.backgroundColor = "color-mix(in oklab, var(--foreground) 8%, transparent)";
        document.querySelector(selector).append(probe);

        const color = getComputedStyle(probe).backgroundColor;

        probe.remove();

        return color;
      }, selector);
    const pending = (id) =>
      page.evaluate((selector) => {
        const table = document.querySelector(selector);

        return {
          has: table.hasAttribute("data-pending"),
          value: table.getAttribute("data-pending"),
        };
      }, grid(id));
    const anyPending = () =>
      page.evaluate(() => document.querySelectorAll("[data-pending], [data-anchor]").length);
    const previewDays = (id) =>
      page.evaluate(
        (id) =>
          [...document.querySelectorAll(`#${id} td[data-preview]`)].map((cell) =>
            cell.getAttribute("aria-label"),
          ),
        id,
      );
    const radii = (selector) =>
      styleOf(selector, [
        "borderTopLeftRadius",
        "borderTopRightRadius",
        "borderBottomRightRadius",
        "borderBottomLeftRadius",
      ]);
    const square = {
      borderTopLeftRadius: "0px",
      borderTopRightRadius: "0px",
      borderBottomRightRadius: "0px",
      borderBottomLeftRadius: "0px",
    };
    const startRounded = { ...square, borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px" };
    const endRounded = { ...square, borderTopRightRadius: "8px", borderBottomRightRadius: "8px" };
    const writes = async () => Number(await textOf("cal-stay-writes"));
    const transparent = "rgba(0, 0, 0, 0)";
    const dark = {
      foreground: "rgb(237, 237, 235)",
      background: "rgb(20, 20, 20)",
      muted: "rgb(163, 163, 160)",
      input: "rgb(107, 107, 104)",
      ring: "rgb(76, 196, 111)",
      orange: "rgb(224, 144, 111)",
    };
    const light = { foreground: "rgb(27, 27, 27)", background: "rgb(233, 233, 231)" };

    // Focuses a cell the way a keyboard user does, so it matches :focus-visible.
    const focusCell = async (selector) => {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.keyboard.press("Shift");
      await page.focus(selector);
      await rendered();
      assert.ok(
        await page.evaluate(
          (selector) => document.querySelector(selector).matches(":focus-visible"),
          selector,
        ),
        `${selector} has :focus-visible`,
      );
    };

    // Server HTML, parsed by a page without scripts: the attributes are on the elements, and fold's
    // presence attributes are on none (their names appear only inside the cells' class lists).
    const calendarsPrerendered = await browser.newPage({ javaScriptEnabled: false });

    await calendarsPrerendered.goto(base);

    const calendarServer = await calendarsPrerendered.evaluate(() => {
      const root = (id) => document.getElementById(id);
      const gridOf = (id) => root(id).querySelector(":scope > [data-slot=calendar-grid]");
      const dueGrid = gridOf("cal-due");
      const label = dueGrid.getAttribute("aria-labelledby");
      const heading = root("cal-due").querySelector("[data-slot=calendar-heading]");
      const sibling = root("cal-due").nextElementSibling;
      const rootSlots = [];

      for (const id of [
        "cal-due",
        "cal-holidays",
        "cal-stay",
        "cal-billing",
        "cal-readonly",
        "cal-disabled",
        "cal-range-readonly",
        "cal-range-disabled",
        "cal-rtl",
        "cal-light",
        "cal-el",
        "cal-seed",
      ]) {
        rootSlots.push(root(id).dataset.slot);
      }

      return {
        rootSlots,
        role: dueGrid.getAttribute("role"),
        dueCells: dueGrid.querySelectorAll("tbody > tr > td[role=gridcell]").length,
        holidayCells: gridOf("cal-holidays").querySelectorAll("td[role=gridcell]").length,
        sections: [...dueGrid.children].map((child) => child.localName),
        weekday: dueGrid.querySelector("th").getAttribute("abbr"),
        today: dueGrid.querySelector("td[data-today]")?.getAttribute("aria-label"),
        labelledBy: label,
        headingId: heading.id,
        heading: heading.textContent.trim(),
        stayStart: gridOf("cal-stay")
          .querySelector("td[data-range-start]")
          ?.getAttribute("aria-label"),
        prompt: root("cal-stay").querySelector("[data-slot=calendar-prompt]").textContent.trim(),
        sibling: {
          name: sibling.localName,
          hidden: sibling.hidden,
          text: sibling.textContent,
        },
        presence: document.querySelectorAll("[data-pending], [data-anchor]").length,
        gridsWithFalse: [...document.querySelectorAll("[data-slot=calendar-grid]")].filter(
          (table) => table.getAttribute("data-pending") === "false",
        ).length,
        seed: root("cal-seed").getAttribute("data-today"),
        seedHeading: root("cal-seed")
          .querySelector("[data-slot=calendar-heading]")
          .textContent.trim(),
        seedToday: gridOf("cal-seed").querySelector("td[data-today]")?.getAttribute("aria-label"),
      };
    });

    await calendarsPrerendered.close();
    assert.deepEqual(calendarServer.rootSlots, Array(12).fill("calendar"));
    assert.equal(calendarServer.role, "grid");
    assert.equal(calendarServer.dueCells, 35, "October 2026 from Monday is 5 weeks");
    assert.equal(calendarServer.holidayCells, 42, "fixedWeeks renders 6 weeks");
    assert.deepEqual(calendarServer.sections, ["thead", "tbody"]);
    assert.equal(calendarServer.weekday, "Monday");
    assert.equal(calendarServer.today, "Tuesday, October 27, 2026");
    assert.equal(calendarServer.labelledBy, `cal-due-label ${calendarServer.headingId}`);
    assert.equal(calendarServer.heading, "October 2026");
    assert.equal(calendarServer.stayStart, "Wednesday, October 14, 2026");
    assert.equal(calendarServer.prompt, "Choose the first day");
    assert.deepEqual(calendarServer.sibling, { name: "span", hidden: true, text: "selected" });
    assert.equal(
      calendarServer.presence,
      0,
      "no data-pending or data-anchor attribute on the server",
    );
    assert.equal(calendarServer.gridsWithFalse, 0);
    assert.match(calendarServer.seed, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(calendarServer.seedToday, "the server marks its today");

    // Hydration with the browser's clock 45 days past the server's: the seeded Calendar keeps the
    // server's month and today.
    const seedContext = await browser.newContext({ deviceScaleFactor: 1 });
    const seedPage = await seedContext.newPage();
    const seedErrors = [];
    const browserToday = new Date(`${calendarServer.seed}T12:00:00Z`);

    browserToday.setUTCDate(browserToday.getUTCDate() + 45);
    seedPage.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        seedErrors.push(message.text());
      }
    });
    seedPage.on("pageerror", (error) => seedErrors.push(String(error)));
    await seedPage.clock.setFixedTime(browserToday);
    await seedPage.goto(base, { waitUntil: "networkidle" });
    await seedPage.waitForFunction(
      () => document.querySelector("app-root") && !document.querySelector("[ngh]"),
    );
    assert.equal(
      await seedPage.evaluate(() => new Date().toISOString().slice(0, 10)),
      browserToday.toISOString().slice(0, 10),
    );
    assert.deepEqual(
      await seedPage.evaluate(() => {
        const root = document.getElementById("cal-seed");

        return {
          seed: root.getAttribute("data-today"),
          heading: root.querySelector("[data-slot=calendar-heading]").textContent.trim(),
          today: root.querySelector("td[data-today]")?.getAttribute("aria-label"),
        };
      }),
      {
        seed: calendarServer.seed,
        heading: calendarServer.seedHeading,
        today: calendarServer.seedToday,
      },
    );
    assert.deepEqual(seedErrors, [], "Calendar hydration errors or warnings");
    await seedContext.close();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await fresh();
    assert.equal(await anyPending(), 0, "no presence attribute after hydration");

    // Geometry: 32px day cells holding 28px chips 2px inside, chosen neighbours 4px apart, a
    // 224px grid in a 250px box under a 32px header; 48px month cells holding 36px chips 6px
    // inside.
    const dueCell = await rect(day("cal-due", "2026-10-14"));
    const dueChip = await rect(chip("cal-due", "2026-10-14"));
    const seventh = await rect(chip("cal-holidays", "2026-10-07"));
    const eighth = await rect(chip("cal-holidays", "2026-10-08"));
    const monthCell = await rect(`#cal-billing td[aria-label="April 2026"]`);
    const monthChip = await rect(`#cal-billing td[aria-label="April 2026"] > span`);

    assert.deepEqual([dueCell.width, dueCell.height], [32, 32]);
    assert.deepEqual([dueChip.width, dueChip.height], [28, 28]);
    assert.deepEqual([dueChip.x - dueCell.x, dueChip.y - dueCell.y], [2, 2]);
    assert.equal(eighth.x - (seventh.x + seventh.width), 4, "chosen neighbours are 4px apart");
    assert.equal((await rect(grid("cal-due"))).width, 224);
    assert.equal((await rect("#cal-due")).width, 250);
    assert.equal((await rect(slot("cal-due", "header"))).height, 32);
    assert.equal(monthCell.height, 48);
    assert.equal(monthChip.height, 36);

    for (const inset of [
      monthChip.x - monthCell.x,
      monthChip.y - monthCell.y,
      monthCell.x + monthCell.width - monthChip.x - monthChip.width,
    ]) {
      assert.ok(Math.abs(inset - 6) < 0.05, `month chip inset ${inset}`);
    }

    // Colors and type per state, dark.
    const band = await bandIn("#cal-stay");

    assert.deepEqual(
      await styleOf(chip("cal-stay", "2026-10-14"), ["backgroundColor", "color", "fontWeight"]),
      {
        backgroundColor: dark.foreground,
        color: dark.background,
        fontWeight: "600",
      },
    );
    assert.equal(
      (await styleOf(day("cal-stay", "2026-10-20"), ["backgroundColor"])).backgroundColor,
      band,
    );
    assert.equal(
      (await styleOf(chip("cal-stay", "2026-10-20"), ["backgroundColor"])).backgroundColor,
      transparent,
    );
    assert.deepEqual(await radii(day("cal-stay", "2026-10-14")), startRounded);
    assert.deepEqual(await radii(day("cal-stay", "2026-10-18")), endRounded);
    assert.deepEqual(await radii(day("cal-stay", "2026-10-19")), startRounded);
    assert.deepEqual(await radii(day("cal-stay", "2026-10-23")), endRounded);
    assert.deepEqual(await radii(day("cal-stay", "2026-10-20")), square);
    // A chosen day is filled; so is one outside the month (3 November), which isn't muted.
    for (const date of ["2026-10-08", "2026-11-03"]) {
      assert.deepEqual(
        await styleOf(chip("cal-holidays", date), ["backgroundColor", "color"]),
        {
          backgroundColor: dark.foreground,
          color: dark.background,
        },
        `chosen ${date}`,
      );
    }
    assert.equal(
      (await pseudo(chip("cal-due", "2026-10-27"), "::after", ["backgroundColor"])).backgroundColor,
      dark.ring,
    );
    assert.deepEqual(await pseudo(chip("cal-due", "2026-10-27"), "::after", ["width", "bottom"]), {
      width: "4px",
      bottom: "2px",
    });
    assert.equal((await styleOf(chip("cal-due", "2026-09-28"), ["color"])).color, dark.muted);
    assert.deepEqual(
      await styleOf(chip("cal-due", "2026-10-17"), ["opacity", "textDecorationLine"]),
      {
        opacity: "0.5",
        textDecorationLine: "line-through",
      },
    );
    assert.deepEqual(
      await styleOf(`#cal-billing td[aria-label="October 2026"] > span`, [
        "backgroundColor",
        "color",
      ]),
      {
        backgroundColor: dark.foreground,
        color: dark.background,
      },
    );
    assert.deepEqual(
      await styleOf(`${slot("cal-due", "weekday")}`, ["fontSize", "fontWeight", "color"]),
      {
        fontSize: "12px",
        fontWeight: "600",
        color: dark.muted,
      },
    );

    // Light: the same states in the light tokens.
    const lightBand = await bandIn("#cal-light");

    assert.notEqual(lightBand, band);
    assert.deepEqual(await styleOf(chip("cal-light", "2026-10-23"), ["backgroundColor", "color"]), {
      backgroundColor: light.foreground,
      color: light.background,
    });
    assert.equal(
      (await styleOf(day("cal-light", "2026-10-20"), ["backgroundColor"])).backgroundColor,
      lightBand,
    );

    // The view switch: its exact name per view, the cycle days → months → years → days keeping
    // focus, and Previous and Next named per view.
    const viewSwitch = slot("cal-due", "view-switch");
    const names = async (id) => ({
      previous: await page.getAttribute(`#${id} [data-slot=calendar-previous]`, "aria-label"),
      view: await page.getAttribute(`#${id} [data-slot=calendar-view-switch]`, "aria-label"),
      next: await page.getAttribute(`#${id} [data-slot=calendar-next]`, "aria-label"),
    });

    assert.deepEqual(await names("cal-due"), {
      previous: "Previous month",
      view: "October 2026, show the months",
      next: "Next month",
    });
    assert.equal(
      await page
        .locator("#cal-due")
        .getByRole("button", { name: "October 2026, show the months", exact: true })
        .count(),
      1,
    );
    await page.click(viewSwitch);
    await page.waitForFunction(
      (selector) => document.querySelector(selector).querySelectorAll("td").length === 12,
      grid("cal-due"),
    );
    assert.equal(
      await page.evaluate(
        (selector) => document.activeElement === document.querySelector(selector),
        viewSwitch,
      ),
      true,
    );
    assert.deepEqual(await names("cal-due"), {
      previous: "Previous year",
      view: "2026, show the years",
      next: "Next year",
    });
    await page.keyboard.press("Enter");
    await rendered();
    assert.deepEqual(await names("cal-due"), {
      previous: "Previous 12 years",
      view: "2016 – 2027, show the days",
      next: "Next 12 years",
    });
    assert.equal((await styleOf(`${viewSwitch} > svg`, ["rotate"])).rotate, "180deg");
    await page.keyboard.press("Enter");
    await rendered();
    assert.equal(
      await page.getAttribute(viewSwitch, "aria-label"),
      "October 2026, show the months",
    );
    assert.equal(
      await page.evaluate(
        (selector) => document.activeElement === document.querySelector(selector),
        viewSwitch,
      ),
      true,
    );
    assert.equal(
      await page.getAttribute(slot("cal-billing", "view-switch"), "aria-label"),
      "2026, show the years",
    );
    await page.click(slot("cal-billing", "view-switch"));
    await rendered();
    assert.equal(
      await page.getAttribute(slot("cal-billing", "view-switch"), "aria-label"),
      "2016 – 2027, show the months",
    );

    const greekHeading = (await page.textContent(slot("cal-el", "heading"))).trim();

    assert.equal(greekHeading, "Σεπτέμβριος 2026");
    assert.deepEqual(await names("cal-el"), {
      previous: "Προηγούμενος μήνας",
      view: "Σεπτέμβριος 2026, εμφάνιση μηνών",
      next: "Επόμενος μήνας",
    });

    // Touch and the Field, from a fresh page, since the clicks above left cal-due and touched it:
    // Tab and Shift+Tab between the header and the grid don't touch the required field; leaving
    // the Calendar does, and the error shows with an orange border.
    await fresh();
    assert.equal(await page.locator("#cal-due-error").count(), 0);
    await page.focus(slot("cal-due", "next"));
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "Tuesday, October 27, 2026",
    );
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await rendered();
    assert.equal(
      await page.locator("#cal-due-error").count(),
      0,
      "moves inside the Calendar don't touch it",
    );
    await page.keyboard.press("Tab");
    await page.waitForSelector("#cal-due-error");
    assert.equal(await textOf("cal-due-error"), "Choose an appeal date.");
    assert.equal(await page.getAttribute(grid("cal-due"), "aria-invalid"), "true");
    assert.equal((await styleOf("#cal-due", ["borderTopColor"])).borderTopColor, dark.orange);

    // Keys: back into the grid on its tab stop, arrows and PageDown move across months, Enter
    // chooses.
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "Tuesday, October 27, 2026",
    );
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.getAttribute("aria-selected") === "true",
      day("cal-due", "2026-10-26"),
    );
    await page.keyboard.press("PageDown");
    await rendered();
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "Thursday, November 26, 2026",
    );
    assert.equal((await page.textContent(slot("cal-due", "heading"))).trim(), "November 2026");
    await page.keyboard.press("PageUp");
    await rendered();
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "Monday, October 26, 2026",
    );
    await page.keyboard.press("ArrowDown");
    await rendered();
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "Monday, November 2, 2026",
    );
    assert.equal(await page.locator("#cal-due-error").count(), 0, "a chosen day clears the error");

    // A range by pointer over the committed 14–23: no presence attribute before the first click;
    // the first click marks the anchor and the grid, and hovering 26 previews 12–26 as square
    // cells, the committed band, ends and rounding stepping back with no seam at 13|14 and 23|24;
    // nothing is written until the second click. Escape restores the committed range.
    await fresh();
    assert.deepEqual(await pending("cal-stay"), { has: false, value: null });
    await page.locator("#cal-stay").scrollIntoViewIfNeeded();
    await page.click(day("cal-stay", "2026-10-12"));
    await page.hover(day("cal-stay", "2026-10-26"));
    await rendered();
    assert.deepEqual(await pending("cal-stay"), { has: true, value: "" });
    const anchorAttribute = await page.getAttribute(day("cal-stay", "2026-10-12"), "data-anchor");

    assert.equal(anchorAttribute, "");
    assert.equal(
      (await page.textContent(slot("cal-stay", "prompt"))).trim(),
      "Choose the last day",
    );

    for (const id of ["cal-due", "cal-holidays", "cal-billing", "cal-rtl"]) {
      assert.equal((await pending(id)).has, false, `${id} isn't pending`);
    }

    const overlap = october(12, 26);

    assert.deepEqual(
      await previewDays("cal-stay"),
      overlap.map((date) => dayLabel.format(new Date(`${date}T00:00:00Z`))),
    );

    for (const date of overlap) {
      assert.deepEqual(
        await radii(day("cal-stay", date)),
        square,
        `${date} is square while pending`,
      );
      assert.equal(
        (await styleOf(day("cal-stay", date), ["backgroundColor"])).backgroundColor,
        band,
        date,
      );
    }

    for (const date of ["2026-10-14", "2026-10-23"]) {
      assert.deepEqual(await styleOf(chip("cal-stay", date), ["backgroundColor", "fontWeight"]), {
        backgroundColor: transparent,
        fontWeight: "400",
      });
    }

    assert.equal(
      (await styleOf(chip("cal-stay", "2026-10-12"), ["backgroundColor"])).backgroundColor,
      dark.foreground,
    );
    // The far end isn't filled; under the pointer it has the hover tint.
    assert.equal(
      (await styleOf(chip("cal-stay", "2026-10-26"), ["backgroundColor"])).backgroundColor,
      band,
    );

    const seams = [];

    for (const [before, after] of [
      ["2026-10-13", "2026-10-14"],
      ["2026-10-23", "2026-10-24"],
    ]) {
      const left = await rect(day("cal-stay", before));
      const right = await rect(day("cal-stay", after));
      const y = left.y + 1;

      seams.push(
        [left.x + left.width - 2, y],
        [left.x + left.width - 1, y],
        [right.x, y],
        [right.x + 1, y],
      );
    }

    // Corners of 14's and 23's cells, 1px inside: the band, not the box.
    for (const date of ["2026-10-14", "2026-10-23"]) {
      const cell = await rect(day("cal-stay", date));

      seams.push(
        [cell.x + 1, cell.y + 1],
        [cell.x + cell.width - 2, cell.y + 1],
        [cell.x + 1, cell.y + cell.height - 2],
        [cell.x + cell.width - 2, cell.y + cell.height - 2],
      );
    }

    // Read with the pointer still on 26: without it, the preview shrinks to the focused 12.
    const seamPixels = await screenPixels(seams);

    for (const pixel of seamPixels) {
      assert.deepEqual(pixel, seamPixels[0], "the preview band has no seam or rounded corner");
    }

    assert.equal(await writes(), 0);
    await page.keyboard.press("Escape");
    await rendered();
    assert.deepEqual(await pending("cal-stay"), { has: false, value: null });
    assert.equal(await anyPending(), 0);
    assert.deepEqual(await previewDays("cal-stay"), []);
    assert.deepEqual(await radii(day("cal-stay", "2026-10-14")), startRounded);
    assert.deepEqual(await radii(day("cal-stay", "2026-10-18")), endRounded);
    assert.deepEqual(await radii(day("cal-stay", "2026-10-19")), startRounded);
    assert.deepEqual(await radii(day("cal-stay", "2026-10-23")), endRounded);
    assert.equal(
      (await styleOf(chip("cal-stay", "2026-10-14"), ["backgroundColor"])).backgroundColor,
      dark.foreground,
    );
    assert.equal(await writes(), 0);
    assert.equal(
      (await page.textContent(slot("cal-stay", "prompt"))).trim(),
      "Choose the first day",
    );

    // The second click writes 12–26 once and clears the pending state.
    await page.click(day("cal-stay", "2026-10-12"));
    await page.click(day("cal-stay", "2026-10-26"));
    await rendered();
    assert.equal(await writes(), 1);
    assert.deepEqual(await pending("cal-stay"), { has: false, value: null });
    assert.equal(await page.getAttribute(day("cal-stay", "2026-10-12"), "data-range-start"), "");
    assert.equal(await page.getAttribute(day("cal-stay", "2026-10-26"), "data-range-end"), "");

    // By keys: Enter on 26 sets the anchor, two ArrowRights preview, Enter writes 26–28. The
    // pointer leaves first, since a hovered day wins over the focused one.
    await page.mouse.move(0, 0);
    await page.keyboard.press("Enter");
    await rendered();
    assert.deepEqual(await pending("cal-stay"), { has: true, value: "" });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await rendered();
    assert.equal((await previewDays("cal-stay")).length, 3);
    await page.keyboard.press("Enter");
    await rendered();
    assert.equal(await writes(), 2);
    assert.equal(await page.getAttribute(day("cal-stay", "2026-10-28"), "data-range-end"), "");
    assert.deepEqual(await pending("cal-stay"), { has: false, value: null });

    // Across months: with the anchor in October and November shown, nothing in view is previewed
    // and the committed band stays hidden; Escape from Next clears the anchor and the band returns.
    await page.mouse.move(0, 0);
    await page.click(day("cal-stay", "2026-10-05"));
    await page.click(slot("cal-stay", "next"));
    await rendered();
    assert.equal((await page.textContent(slot("cal-stay", "heading"))).trim(), "November 2026");
    assert.deepEqual(await pending("cal-stay"), { has: true, value: "" });
    assert.deepEqual(await previewDays("cal-stay"), []);

    for (const date of ["2026-10-26", "2026-10-27", "2026-10-28"]) {
      assert.equal(
        (await styleOf(day("cal-stay", date), ["backgroundColor"])).backgroundColor,
        transparent,
        `${date} band while pending`,
      );
    }

    assert.equal(
      (await page.textContent(slot("cal-stay", "prompt"))).trim(),
      "Choose the last day",
    );
    await page.keyboard.press("Escape");
    await rendered();
    assert.deepEqual(await pending("cal-stay"), { has: false, value: null });
    assert.equal(
      (await styleOf(day("cal-stay", "2026-10-27"), ["backgroundColor"])).backgroundColor,
      band,
    );
    // November's leading October days: the range's interior stays muted, its filled end doesn't.
    assert.equal((await styleOf(chip("cal-stay", "2026-10-27"), ["color"])).color, dark.muted);
    assert.equal((await styleOf(chip("cal-stay", "2026-10-28"), ["color"])).color, dark.background);
    assert.equal(await writes(), 2);

    // The focus ring: 2px, the ring color, on a day cell's edge and 4px inside a month cell, on
    // the raised cell; drawn whole beside a chosen neighbour's chip (8 October between 7 and 9).
    await fresh();
    await focusCell(day("cal-holidays", "2026-10-08"));
    assert.deepEqual(await outline(day("cal-holidays", "2026-10-08")), {
      style: "solid",
      width: "2px",
      offset: "0px",
      color: dark.ring,
    });
    assert.deepEqual(await styleOf(day("cal-holidays", "2026-10-08"), ["position", "zIndex"]), {
      position: "relative",
      zIndex: "1",
    });

    const focused = await rect(day("cal-holidays", "2026-10-08"));
    const middleX = focused.x + focused.width / 2;
    const middleY = focused.y + focused.height / 2;
    const ringPixels = await pixelsAt([
      [middleX, focused.y - 2],
      [middleX, focused.y - 1],
      [focused.x + focused.width, middleY],
      [focused.x + focused.width + 1, middleY],
      [middleX, focused.y + focused.height],
      [middleX, focused.y + focused.height + 1],
      [focused.x - 2, middleY],
      [focused.x - 1, middleY],
    ]);

    ringPixels.forEach((pixel, index) => {
      assert.deepEqual(
        pixel,
        channels(dark.ring),
        `the ring is whole beside chosen neighbours: sample ${index} of the cell at ${JSON.stringify(focused)}`,
      );
    });

    await focusCell(`#cal-billing td[aria-label="April 2026"]`);
    assert.deepEqual(await outline(`#cal-billing td[aria-label="April 2026"]`), {
      style: "solid",
      width: "2px",
      offset: "-4px",
      color: dark.ring,
    });

    // The coarser views: the month holding a day root's value is tinted and, when displayed,
    // outlined, without the chosen fill.
    await page.click(slot("cal-holidays", "view-switch"));
    await rendered();
    assert.deepEqual(
      await styleOf(`#cal-holidays td[aria-label="October 2026"] > span`, [
        "backgroundColor",
        "borderTopWidth",
        "borderTopColor",
        "fontWeight",
      ]),
      {
        backgroundColor: band,
        borderTopWidth: "1px",
        borderTopColor: dark.input,
        fontWeight: "600",
      },
    );

    // Readonly and disabled Fields; the range prompt hides while readonly or disabled.
    assert.deepEqual(await styleOf("#cal-readonly", ["borderTopStyle", "backgroundColor"]), {
      borderTopStyle: "dashed",
      backgroundColor: transparent,
    });
    assert.equal((await styleOf("#cal-disabled", ["opacity"])).opacity, "0.5");
    assert.equal(
      (await styleOf(slot("cal-range-readonly", "prompt"), ["display"])).display,
      "none",
    );
    assert.equal(
      (await styleOf(slot("cal-range-disabled", "prompt"), ["display"])).display,
      "none",
    );
    assert.equal((await styleOf(slot("cal-stay", "prompt"), ["display"])).display, "block");

    // Right to left: the chevrons point to the inline start and end, and the band rounds on the
    // physical right at its start.
    assert.equal(
      (await styleOf(`${slot("cal-rtl", "previous")} > svg`, ["rotate"])).rotate,
      "180deg",
    );
    assert.equal(
      (await styleOf(`${slot("cal-stay", "previous")} > svg`, ["rotate"])).rotate,
      "none",
    );
    // A left-to-right Calendar inside a right-to-left page follows its own direction.
    for (const part of ["previous", "next"]) {
      assert.equal(
        (await styleOf(`${slot("cal-ltr-in-rtl", part)} > svg`, ["rotate"])).rotate,
        "none",
        `ltr-in-rtl ${part}`,
      );
    }
    assert.deepEqual(await radii(day("cal-rtl", "2026-10-14")), endRounded);
    assert.deepEqual(await radii(day("cal-rtl", "2026-10-23")), startRounded);

    // Forced colors: the chips' system colors, the Highlight rail across a range's interior,
    // uncapped while pending and capped at the committed ends again after Escape; the focused
    // interior cell's ring stays whole where its neighbours' rails cross it.
    await page.emulateMedia({ forcedColors: "active" });
    await fresh();

    const forcedColors = await page.evaluate(() => {
      const probe = document.createElement("span");
      const read = (value) => {
        probe.style.cssText = `position: fixed; forced-color-adjust: none; color: ${value}`;

        return getComputedStyle(probe).color;
      };

      document.body.append(probe);

      const result = {
        canvas: read("Canvas"),
        canvasText: read("CanvasText"),
        highlight: read("Highlight"),
        highlightText: read("HighlightText"),
        grayText: read("GrayText"),
      };

      probe.remove();

      return result;
    });
    const rail = (date) =>
      pseudo(chip("cal-stay", date), "::before", [
        "content",
        "left",
        "right",
        "borderTopWidth",
        "borderTopColor",
      ]);

    assert.deepEqual(await styleOf(chip("cal-stay", "2026-10-14"), ["backgroundColor", "color"]), {
      backgroundColor: forcedColors.highlight,
      color: forcedColors.highlightText,
    });
    assert.deepEqual(await rail("2026-10-20"), {
      content: '""',
      left: "-2px",
      right: "-2px",
      borderTopWidth: "1px",
      borderTopColor: forcedColors.highlight,
    });
    assert.equal((await rail("2026-10-14")).left, "0px");
    assert.equal((await rail("2026-10-23")).right, "0px");
    assert.equal((await rail("2026-10-26")).content, "none");
    assert.equal(
      (await styleOf(chip("cal-stay", "2026-10-20"), ["color"])).color,
      forcedColors.canvasText,
    );
    // An outside day is CanvasText while choosable, and GrayText when it's also disabled (by
    // cal-due's minDate).
    assert.equal(
      await page.locator(day("cal-holidays", "2026-09-28")).getAttribute("data-disabled"),
      null,
    );
    assert.equal(
      (await styleOf(chip("cal-holidays", "2026-09-28"), ["color"])).color,
      forcedColors.canvasText,
    );
    assert.equal(
      await page.locator(day("cal-due", "2026-09-28")).getAttribute("data-disabled"),
      "",
    );
    assert.equal(
      (await styleOf(chip("cal-due", "2026-09-28"), ["color"])).color,
      forcedColors.grayText,
    );
    assert.equal(
      (await styleOf(chip("cal-due", "2026-10-17"), ["color"])).color,
      forcedColors.grayText,
    );
    assert.equal(
      (await pseudo(chip("cal-due", "2026-10-27"), "::after", ["backgroundColor"])).backgroundColor,
      forcedColors.canvasText,
    );
    for (const date of ["2026-10-08", "2026-11-03"]) {
      assert.deepEqual(
        await styleOf(chip("cal-holidays", date), ["backgroundColor", "color"]),
        {
          backgroundColor: forcedColors.highlight,
          color: forcedColors.highlightText,
        },
        `forced chosen ${date}`,
      );
    }

    // The interior cell's ring where the rails of 19 and 21 cross it: the outline painted over the
    // rail, and the rail itself over Canvas.
    await focusCell(day("cal-stay", "2026-10-20"));

    const forcedRing = await outline(day("cal-stay", "2026-10-20"));
    const interior = await rect(day("cal-stay", "2026-10-20"));
    const interiorChip = await rect(chip("cal-stay", "2026-10-20"));
    const railColor = over(forcedColors.highlight, forcedColors.canvas);
    const crossings = [];

    assert.equal(forcedRing.style, "solid");
    assert.equal(forcedRing.width, "2px");

    for (const x of [interior.x - 2, interior.x - 1, interior.x + 32, interior.x + 33]) {
      for (const y of [interiorChip.y, interiorChip.y + interiorChip.height - 1]) {
        crossings.push([x, y]);
      }
    }

    const crossingPixels = await pixelsAt([
      ...crossings,
      [interiorChip.x + interiorChip.width / 2, interiorChip.y],
      [interiorChip.x + interiorChip.width / 2, interiorChip.y + interiorChip.height - 1],
    ]);

    for (const pixel of crossingPixels.slice(0, crossings.length)) {
      assert.deepEqual(pixel, over(forcedRing.color, railColor), "the ring paints over the rails");
    }

    for (const pixel of crossingPixels.slice(crossings.length)) {
      assert.deepEqual(pixel, railColor, "the rail is drawn");
    }

    // Pending, forward over the committed range: every preview chip's rail reaches 2px past it on
    // both sides, the old ends and the anchor included; Escape restores the caps.
    await page.keyboard.press("Escape");
    await page.mouse.move(0, 0);
    await page.click(day("cal-stay", "2026-10-12"));
    await page.hover(day("cal-stay", "2026-10-26"));
    await rendered();

    for (const date of overlap) {
      const { content, left, right } = await rail(date);

      assert.deepEqual(
        { content, left, right },
        { content: '""', left: "-2px", right: "-2px" },
        date,
      );
    }

    assert.equal(
      (await styleOf(chip("cal-stay", "2026-10-12"), ["backgroundColor"])).backgroundColor,
      forcedColors.highlight,
    );
    assert.equal(
      (await styleOf(chip("cal-stay", "2026-10-14"), ["backgroundColor"])).backgroundColor,
      transparent,
    );
    assert.equal(
      (await styleOf(chip("cal-stay", "2026-10-23"), ["backgroundColor"])).backgroundColor,
      transparent,
    );
    await page.keyboard.press("Escape");
    await rendered();
    assert.equal((await rail("2026-10-14")).left, "0px");
    assert.equal((await rail("2026-10-23")).right, "0px");
    assert.equal(await writes(), 0);

    // In the months view, the displayed month holding the value keeps a CanvasText border and gets
    // a 2px Highlight ring inside the chip.
    await page.click(slot("cal-holidays", "view-switch"));
    await rendered();

    const forcedMonth = await styleOf(`#cal-holidays td[aria-label="October 2026"] > span`, [
      "borderTopColor",
      "boxShadow",
      "backgroundColor",
    ]);

    assert.equal(forcedMonth.borderTopColor, forcedColors.canvasText);
    assert.equal(forcedMonth.backgroundColor, transparent);
    assert.ok(
      forcedMonth.boxShadow.includes("inset") &&
        forcedMonth.boxShadow.includes(forcedColors.highlight),
      `forced month ring ${forcedMonth.boxShadow}`,
    );
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  }

  // Date entry, in its own block: DateField, TimeField, DateTimeField and the single DatePicker in
  // both shapes. Exact geometry and pixels are DPR-1 values; every Calendar pins today to 27
  // October 2026.
  {
    const box = (id) => `#${id} [data-slot=date-field-input]`;
    const row = (id) => `${box(id)} > [data-slot=date-field-segments]`;
    // Every specimen's units alternate with literals, starting with a unit, so unit `index` is
    // the row's child 2 × index + 1.
    const segment = (id, index) =>
      `${row(id)} > :nth-child(${2 * index + 1}) > [data-slot=date-field-segment]`;
    const trigger = (id) => `#${id} [data-slot=date-picker-trigger]`;
    const content = (id) => `#${id} [data-slot=date-picker-content]`;
    const rect = (selector) =>
      page.evaluate((selector) => {
        const { left, top, right, bottom, width, height } = document
          .querySelector(selector)
          .getBoundingClientRect();

        return { left, top, right, bottom, width, height };
      }, selector);
    const segmentTexts = (id) =>
      page.evaluate(
        (id) =>
          [...document.querySelectorAll(`#${id} [data-slot=date-field-segment]`)].map(
            (element) => element.textContent,
          ),
        id,
      );
    // A theme token's computed color inside an element's subtree, so it follows a `.light`
    // ancestor.
    const tokenIn = (selector, token) =>
      page.evaluate(
        ([selector, token]) => {
          const probe = document.createElement("span");

          probe.style.color = `var(--${token})`;
          document.querySelector(selector).append(probe);

          const color = getComputedStyle(probe).color;

          probe.remove();

          return color;
        },
        [selector, token],
      );
    const keyboardFocus = async (selector) => {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.keyboard.press("Shift");
      await page.focus(selector);
      await rendered();
    };
    const blur = async () => {
      await page.evaluate(() => document.activeElement?.blur());
      await rendered();
    };
    const isOpen = (id) =>
      page.evaluate(
        (selector) => document.querySelector(selector).matches(":popover-open"),
        content(id),
      );
    const opened = (id) =>
      page.waitForFunction((selector) => {
        const element = document.querySelector(selector);

        return element.matches(":popover-open") && getComputedStyle(element).opacity === "1";
      }, content(id));
    const closed = (id) =>
      page.waitForFunction(
        (selector) => !document.querySelector(selector).matches(":popover-open"),
        content(id),
      );
    const dayCell = (id, label) => `${content(id)} td[aria-label="${label}"]`;
    const ring = (color) => ({ style: "solid", width: "2px", offset: "2px", color });
    const dark = {
      foreground: "rgb(237, 237, 235)",
      background: "rgb(20, 20, 20)",
      muted: "rgb(163, 163, 160)",
      input: "rgb(107, 107, 104)",
      ring: "rgb(76, 196, 111)",
      orange: "rgb(224, 144, 111)",
    };

    // Each cell and literal of a box's row, its x and width at 0.5px, and the text gaps on either
    // side of every literal between two units, from the text's own Range rects.
    const boxGeometry = (id) =>
      page.evaluate((selector) => {
        const round = (value) => Math.round(value * 2) / 2;
        const textRect = (element) => {
          const range = document.createRange();

          range.selectNodeContents(element);

          return range.getBoundingClientRect();
        };
        const children = [...document.querySelector(selector).children].filter((child) =>
          ["date-field-cell", "date-field-literal"].includes(child.dataset.slot),
        );
        const parts = [];
        const literals = [];
        const cells = [];

        for (const child of children) {
          const { x, width } = child.getBoundingClientRect();

          parts.push({ slot: child.dataset.slot, x: round(x), width: round(width) });
        }

        for (const child of children) {
          if (child.dataset.slot !== "date-field-cell") {
            continue;
          }

          const segment = child.querySelector("[data-slot=date-field-segment]");
          const cell = child.getBoundingClientRect();
          const text = textRect(segment);

          cells.push({
            left: cell.left,
            width: cell.width,
            segmentLeft: segment.getBoundingClientRect().left,
            textWidth: text.width,
          });
        }

        for (let index = 1; index < children.length - 1; index += 1) {
          const literal = children[index];

          if (literal.dataset.slot !== "date-field-literal") {
            continue;
          }

          const before = textRect(
            children[index - 1].querySelector("[data-slot=date-field-segment]"),
          );
          const after = textRect(
            children[index + 1].querySelector("[data-slot=date-field-segment]"),
          );
          const own = textRect(literal);

          literals.push({
            text: literal.textContent,
            gapBefore: round(own.left - before.right),
            gapAfter: round(after.left - own.right),
            textToText: after.left - before.right,
            width: own.width,
          });
        }

        return { parts, cells, literals };
      }, row(id));

    // Server HTML, parsed by a page without scripts: the boxes, their cells and sizer lines, the
    // placeholder tokens, the closed pickers with no Calendar, and fold's two trigger markers.
    const datesPrerendered = await browser.newPage({ javaScriptEnabled: false });

    await datesPrerendered.goto(base);

    const dateServer = await datesPrerendered.evaluate(() => {
      const root = (id) => document.getElementById(id);
      const boxOf = (id) => root(id).querySelector("[data-slot=date-field-input]");
      const units = {};
      const sizers = {};
      const tokens = {};

      for (const id of ["df-birth", "df-en-us", "df-el", "tf-12", "tf-24s", "dtf", "dp-field"]) {
        units[id] = boxOf(id).querySelectorAll("[role=spinbutton]").length;
        sizers[id] = [...boxOf(id).querySelectorAll("[data-slot=date-field-cell]")].map((cell) =>
          [...cell.querySelectorAll(":scope > [aria-hidden=true]")].map((line) => line.textContent),
        );
        tokens[id] = [...boxOf(id).querySelectorAll("[data-slot=date-field-segment]")].map(
          (segment) => [segment.textContent, segment.getAttribute("data-placeholder")],
        );
      }

      const rowTabIndexes = [];

      for (const element of document.querySelectorAll("[data-slot=date-field-segments]")) {
        rowTabIndexes.push(element.getAttribute("tabindex"));
      }

      const triggers = {};

      for (const element of document.querySelectorAll("[data-slot=date-picker-trigger]")) {
        triggers[element.closest("[data-slot=date-picker]").id] = {
          placeholder: element.getAttribute("data-placeholder"),
          readonly: element.getAttribute("data-readonly"),
        };
      }

      const dueContent = root("dp-field").querySelector("[data-slot=date-picker-content]");
      const dueTrigger = root("dp-field").querySelector("[data-slot=date-picker-trigger]");

      return {
        roles: ["df-birth", "tf-12", "dtf", "dp-field"].map((id) => boxOf(id).getAttribute("role")),
        layouts: ["df-birth", "tf-12", "dtf"].map((id) => root(id).hasAttribute("data-layout")),
        literals: [...boxOf("dtf").querySelectorAll("[data-slot=date-field-literal]")].map(
          (literal) => [literal.textContent, literal.getAttribute("aria-hidden")],
        ),
        units,
        sizers,
        tokens,
        boxes: document.querySelectorAll("[data-slot=date-field-input]").length,
        rowTabIndexes,
        triggers,
        haspopup: dueTrigger.getAttribute("aria-haspopup"),
        expanded: dueTrigger.getAttribute("aria-expanded"),
        contentRole: dueContent.getAttribute("role"),
        contentInert: dueContent.hasAttribute("inert"),
        calendars: document.querySelectorAll("[data-slot=date-picker-content] [data-slot=calendar]")
          .length,
      };
    });

    await datesPrerendered.close();

    const enDate = [
      ["dd", "mm", "00"],
      ["dd", "mm", "00"],
      ["dd00", "mm00", "yyyy", "0000"],
    ];

    assert.deepEqual(dateServer.roles, ["group", "group", "group", "group"]);
    assert.deepEqual(dateServer.layouts, [true, true, true]);
    // Every box's scrolling row is out of the Tab order from the server on.
    assert.ok(dateServer.boxes > 0, "the server HTML has date field boxes");
    assert.deepEqual(dateServer.rowTabIndexes, Array(dateServer.boxes).fill("-1"));
    assert.deepEqual(dateServer.units, {
      "df-birth": 3,
      "df-en-us": 3,
      "df-el": 3,
      "tf-12": 3,
      "tf-24s": 3,
      dtf: 5,
      "dp-field": 3,
    });
    // B's sizer lines: every two-digit unit is sized by the field's two-digit tokens and 00, the
    // year by each of them followed by two digits, its own token and 0000, the day period by its
    // token.
    assert.deepEqual(dateServer.sizers["df-birth"], enDate);
    assert.deepEqual(dateServer.sizers["df-en-us"], [
      ["mm", "dd", "00"],
      ["mm", "dd", "00"],
      ["mm00", "dd00", "yyyy", "0000"],
    ]);
    assert.deepEqual(dateServer.sizers["df-el"], [
      ["ηη", "μμ", "00"],
      ["ηη", "μμ", "00"],
      ["ηη00", "μμ00", "εεεε", "0000"],
    ]);
    assert.deepEqual(dateServer.sizers["tf-12"], [
      ["hh", "mm", "00"],
      ["hh", "mm", "00"],
      ["AM/PM"],
    ]);
    assert.deepEqual(dateServer.sizers["tf-24s"], Array(3).fill(["hh", "mm", "ss", "00"]));
    assert.deepEqual(dateServer.sizers.dtf, [
      ["dd", "mm", "hh", "00"],
      ["dd", "mm", "hh", "00"],
      ["dd00", "mm00", "hh00", "yyyy", "0000"],
      ["dd", "mm", "hh", "00"],
      ["dd", "mm", "hh", "00"],
    ]);
    assert.deepEqual(dateServer.sizers["dp-field"], enDate);
    assert.deepEqual(dateServer.tokens["df-birth"], [
      ["dd", ""],
      ["mm", ""],
      ["yyyy", ""],
    ]);
    assert.deepEqual(dateServer.tokens["df-el"], [
      ["ηη", ""],
      ["μμ", ""],
      ["εεεε", ""],
    ]);
    assert.deepEqual(dateServer.tokens["tf-12"], [
      ["hh", ""],
      ["mm", ""],
      ["AM/PM", ""],
    ]);
    assert.deepEqual(dateServer.tokens["dp-field"], [
      ["27", null],
      ["10", null],
      ["2026", null],
    ]);
    assert.deepEqual(dateServer.literals, [
      ["/", "true"],
      ["/", "true"],
      [", ", "true"],
      [":", "true"],
    ]);
    assert.equal(dateServer.haspopup, "dialog");
    assert.equal(dateServer.expanded, "false");
    assert.equal(dateServer.contentRole, "dialog");
    assert.equal(dateServer.contentInert, true);
    assert.equal(dateServer.calendars, 0, "no Calendar renders inside a closed, gated Content");

    // fold's markers: data-placeholder on a button-shape trigger while its value is null,
    // data-readonly while its picker is readonly by any route, both "" or absent, and neither on
    // the field shape.
    const readonlyButtons = [
      "dp-button-readonly-direct",
      "dp-button-readonly-disabled",
      "dp-button-readonly-disabled-focusable",
      "dp-button-readonly-schema",
    ];
    const emptyButtons = ["dp-button-empty", "dp-dialog-button", "dp-light-button"];

    for (const [id, markers] of Object.entries(dateServer.triggers)) {
      let placeholder = null;
      let readonly = null;

      if (emptyButtons.includes(id)) {
        placeholder = "";
      }

      if (readonlyButtons.includes(id)) {
        readonly = "";
      }

      assert.deepEqual(markers, { placeholder, readonly }, `${id}'s trigger markers`);
    }

    assert.equal(Object.keys(dateServer.triggers).length, 17);

    // Without transitions, colors read settled.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fresh();
    await page.evaluate(() => document.fonts.ready);

    // Geometry: Input's 32px box and 10px radius; the field-shape trigger a 28px square 2px inside
    // the box's end; h-class sizes follow.
    const birthBox = await styleOf(box("df-birth"), [
      "height",
      "borderTopLeftRadius",
      "borderTopWidth",
      "paddingLeft",
      "cursor",
    ]);

    assert.deepEqual(birthBox, {
      height: "32px",
      borderTopLeftRadius: "10px",
      borderTopWidth: "1px",
      paddingLeft: "10px",
      cursor: "auto",
    });
    assert.equal((await styleOf(segment("df-birth", 0), ["cursor"])).cursor, "text");

    const dueBox = await rect(box("dp-field"));
    const dueTrigger = await rect(trigger("dp-field"));

    assert.equal((await styleOf(trigger("dp-field"), ["cursor"])).cursor, "pointer");
    assert.equal(dueTrigger.width, 28);
    assert.equal(dueTrigger.height, 28);
    assert.equal(dueBox.right - dueTrigger.right, 2);
    assert.equal(dueTrigger.top - dueBox.top, 2);

    const rtlBox = await rect(box("dp-rtl"));
    const rtlTrigger = await rect(trigger("dp-rtl"));

    assert.equal(rtlTrigger.left - rtlBox.left, 2, "in RTL the trigger sits at the box's left end");

    // Typing moves nothing (D11-B): every cell and literal keeps its x and width through each key,
    // and once filled the text sits evenly round every literal between two digit units. At the
    // literal before the day period, the minute's spare width S makes the gap wider by S/2.
    const typeAndWatch = async (id, keys) => {
      await keyboardFocus(segment(id, 0));

      const before = (await boxGeometry(id)).parts;

      for (const key of keys.split("")) {
        await page.keyboard.press(key);
        await rendered();
        assert.deepEqual((await boxGeometry(id)).parts, before, `${id} moved after typing ${key}`);
      }

      return boxGeometry(id);
    };
    const filledBirth = await typeAndWatch("df-birth", "27102026");

    assert.deepEqual(await segmentTexts("df-birth"), ["27", "10", "2026"]);

    // A focused digit unit's chip hugs its text with 2px each side, centred in its cell, so it
    // stays clear of both separators; focusing it moves nothing.
    for (let index = 0; index < 3; index += 1) {
      await keyboardFocus(segment("df-birth", index));

      const chip = await page.evaluate(
        (selector) => {
          const element = document.querySelector(selector);
          const range = document.createRange();

          range.selectNodeContents(element);

          const own = element.getBoundingClientRect();
          const cell = element.parentElement.getBoundingClientRect();
          const text = range.getBoundingClientRect();

          return {
            width: own.width,
            textWidth: text.width,
            before: own.left - cell.left,
            after: cell.right - own.right,
          };
        },
        segment("df-birth", index),
      );

      assert.ok(Math.abs(chip.width - chip.textWidth - 4) <= 0.5, `df-birth ${index} chip width`);
      assert.ok(
        Math.abs(chip.before - chip.after) <= 0.5,
        `df-birth ${index} chip off centre: ${chip.before}/${chip.after}`,
      );
      assert.ok(chip.before >= 3, `df-birth ${index} chip ${chip.before}px from its cell's start`);
      assert.deepEqual((await boxGeometry("df-birth")).parts, filledBirth.parts);
    }

    for (const literal of filledBirth.literals) {
      assert.ok(
        Math.abs(literal.gapBefore - literal.gapAfter) <= 1,
        `df-birth's "${literal.text}" gaps ${literal.gapBefore}/${literal.gapAfter}`,
      );
    }

    const filledTime = await typeAndWatch("tf-12", "0930p");

    assert.deepEqual(await segmentTexts("tf-12"), ["09", "30", "PM"]);
    assert.equal(await textOf("tf-12-value"), "21:30");

    const [hourToMinute, minuteToPeriod] = filledTime.literals;
    const minute = filledTime.cells[1];
    const period = filledTime.cells[2];
    const spare = minute.width - 4 - minute.textWidth;

    assert.ok(
      Math.abs(hourToMinute.gapBefore - hourToMinute.gapAfter) <= 1,
      `tf-12's ":" gaps ${hourToMinute.gapBefore}/${hourToMinute.gapAfter}`,
    );
    assert.ok(
      minuteToPeriod.textToText <= minuteToPeriod.width + 4 + spare / 2 + 1,
      `tf-12's minute to PM ${minuteToPeriod.textToText}px, S ${spare}px`,
    );
    assert.ok(Math.abs(period.segmentLeft - period.left) <= 0.5, "PM starts at its cell's start");

    // Backspace empties each unit without moving anything.
    await keyboardFocus(segment("df-birth", 2));

    const filledParts = filledBirth.parts;

    for (let count = 0; count < 4; count += 1) {
      await page.keyboard.press("Backspace");
      await rendered();
      assert.deepEqual((await boxGeometry("df-birth")).parts, filledParts);
    }

    assert.deepEqual(await segmentTexts("df-birth"), ["27", "10", "yyyy"]);

    // Field: a half-typed date shows the incomplete message once focus leaves; completing it
    // clears it; emptying a required one shows the rule's message.
    await blur();
    assert.equal(await textOf("df-birth-error"), "Enter a complete date");
    assert.equal(await attribute("df-birth-input", "aria-labelledby"), "df-birth-label");
    await keyboardFocus(segment("df-birth", 2));
    await page.keyboard.type("2026");
    await blur();
    assert.equal(await page.locator("#df-birth-error").count(), 0);

    // Looks, dark: muted placeholders, the focused segment an inverse chip with no outline or
    // caret; the box draws the ring while a segment has focus.
    await keyboardFocus(segment("df-en-us", 1));
    assert.deepEqual(
      await styleOf(segment("df-en-us", 1), [
        "backgroundColor",
        "color",
        "outlineStyle",
        "caretColor",
      ]),
      {
        backgroundColor: dark.foreground,
        color: dark.background,
        outlineStyle: "none",
        caretColor: "rgba(0, 0, 0, 0)",
      },
    );
    assert.equal((await styleOf(segment("df-en-us", 0), ["color"])).color, dark.muted);
    assert.equal((await styleOf(box("df-en-us"), ["borderTopColor"])).borderTopColor, dark.ring);
    assert.deepEqual(await outline(box("df-en-us")), ring(dark.ring));

    // The field-shape trigger's ring is inset; the box has none while the trigger has focus.
    await keyboardFocus(trigger("dp-field"));
    assert.deepEqual(await outline(trigger("dp-field")), {
      style: "solid",
      width: "2px",
      offset: "-2px",
      color: dark.ring,
    });
    assert.equal((await outline(box("dp-field"))).style, "none");
    await blur();

    // Invalid: the border turns orange once errors show, and stays orange under the ring while a
    // segment has focus (fold Input's intersection).
    await keyboardFocus(segment("df-invalid", 0));
    await blur();
    assert.equal(await textOf("df-invalid-error"), "Enter a date from 1900.");
    assert.equal(
      (await styleOf(box("df-invalid"), ["borderTopColor"])).borderTopColor,
      dark.orange,
    );
    await keyboardFocus(segment("df-invalid", 0));
    assert.equal(
      (await styleOf(box("df-invalid"), ["borderTopColor"])).borderTopColor,
      dark.orange,
    );
    assert.deepEqual(await outline(box("df-invalid")), ring(dark.ring));
    await blur();

    // Readonly dashes the box and drops its fill; disabled dims it once.
    assert.deepEqual(
      await styleOf(box("df-readonly"), ["borderTopStyle", "backgroundColor", "opacity"]),
      { borderTopStyle: "dashed", backgroundColor: "rgba(0, 0, 0, 0)", opacity: "1" },
    );
    assert.deepEqual(await styleOf(box("df-disabled"), ["opacity", "cursor", "borderTopColor"]), {
      opacity: "0.5",
      cursor: "not-allowed",
      borderTopColor: dark.input,
    });

    // The field shape's disabled cases: a disabled root dims the box, not the trigger again; a
    // trigger disabled on its own dims itself. A focusable disabled trigger doesn't open.
    const opacities = async (id) => [
      (await styleOf(box(id), ["opacity"])).opacity,
      (await styleOf(trigger(id), ["opacity"])).opacity,
    ];

    assert.deepEqual(await opacities("dp-field-disabled"), ["0.5", "1"]);
    assert.deepEqual(await opacities("dp-field-disabled-focusable"), ["0.5", "1"]);
    assert.deepEqual(await opacities("dp-field-trigger-disabled"), ["1", "0.5"]);
    await keyboardFocus(trigger("dp-field-disabled-focusable"));
    await page.keyboard.press("Enter");
    await rendered();
    assert.equal(await isOpen("dp-field-disabled-focusable"), false);
    await blur();

    // Button shape: Select's trigger look; muted while empty; readonly by either route dashed,
    // unfilled, shadowless and with the default cursor.
    assert.deepEqual(
      await styleOf(trigger("dp-button"), ["height", "borderTopLeftRadius", "color", "cursor"]),
      { height: "32px", borderTopLeftRadius: "10px", color: dark.foreground, cursor: "pointer" },
    );
    assert.equal((await styleOf(trigger("dp-button-empty"), ["color"])).color, dark.muted);
    assert.equal(await textOf("dp-button-trigger"), "27 Oct 2026");

    for (const id of ["dp-button-readonly-direct", "dp-button-readonly-schema"]) {
      const look = await styleOf(trigger(id), [
        "borderTopStyle",
        "backgroundColor",
        "boxShadow",
        "cursor",
        "opacity",
      ]);

      assert.equal(look.borderTopStyle, "dashed", id);
      assert.ok(transparent(look.backgroundColor), `${id} background ${look.backgroundColor}`);
      assert.ok(shadowless(look.boxShadow), `${id} shadow ${look.boxShadow}`);
      assert.equal(look.cursor, "default", id);
      assert.equal(look.opacity, "1", id);
    }

    // Readonly and disabled together: both markers, the disabled cursor and one dim, with the
    // dashed readonly border and no painted shadow. Neither opens, by click or keys.
    for (const id of ["dp-button-readonly-disabled", "dp-button-readonly-disabled-focusable"]) {
      const look = await styleOf(trigger(id), [
        "borderTopStyle",
        "backgroundColor",
        "boxShadow",
        "cursor",
        "opacity",
      ]);

      assert.equal(await page.getAttribute(trigger(id), "data-readonly"), "");
      assert.equal(await page.getAttribute(trigger(id), "data-disabled"), "");
      assert.equal(look.cursor, "not-allowed", id);
      assert.equal(look.borderTopStyle, "dashed", id);
      assert.ok(transparent(look.backgroundColor), `${id} background ${look.backgroundColor}`);
      assert.ok(shadowless(look.boxShadow), `${id} shadow ${look.boxShadow}`);
      assert.equal(look.opacity, "0.5", id);
      assert.equal((await styleOf(`#${id}`, ["opacity"])).opacity, "1", `${id} root`);
      await page.click(trigger(id), { force: true });
      await rendered();
      assert.equal(await page.getAttribute(trigger(id), "aria-expanded"), "false", id);
    }

    await keyboardFocus(trigger("dp-button-readonly-disabled-focusable"));

    for (const key of ["Enter", " "]) {
      await page.keyboard.press(key);
      await rendered();
      assert.equal(
        await page.getAttribute(trigger("dp-button-readonly-disabled-focusable"), "aria-expanded"),
        "false",
      );
    }

    await blur();
    assert.equal(await textOf("dp-policy-writes"), "0");
    assert.deepEqual(await styleOf(trigger("dp-button-disabled"), ["cursor", "borderTopStyle"]), {
      cursor: "not-allowed",
      borderTopStyle: "solid",
    });

    // The field-shape popup: 4px below the trigger, its end lined up with the trigger's, 2px
    // inside the box (D13-A); the Calendar inside has no frame of its own. Choosing closes it,
    // writes the value and returns focus to the trigger.
    await page.click(trigger("dp-field"));
    await opened("dp-field");

    const dueContent = await rect(content("dp-field"));
    const dueOpenTrigger = await rect(trigger("dp-field"));
    const dueOpenBox = await rect(box("dp-field"));

    assert.equal(dueContent.width, 250);
    assert.ok(Math.abs(dueContent.right - dueOpenTrigger.right) <= 1, "popup end at the trigger's");
    assert.equal(dueContent.top - dueOpenTrigger.bottom, 4);
    assert.equal(dueOpenBox.right - dueContent.right, 2);
    assert.deepEqual(
      await styleOf(`#dp-field-calendar`, [
        "borderTopWidth",
        "backgroundColor",
        "paddingTop",
        "borderTopLeftRadius",
      ]),
      {
        borderTopWidth: "0px",
        backgroundColor: "rgba(0, 0, 0, 0)",
        paddingTop: "0px",
        borderTopLeftRadius: "0px",
      },
    );
    assert.equal(await page.getAttribute(trigger("dp-field"), "aria-expanded"), "true");
    assert.equal(await page.getAttribute(content("dp-field"), "aria-label"), "Choose due date");
    await page.click(dayCell("dp-field", "Wednesday, October 28, 2026"));
    await closed("dp-field");
    assert.deepEqual(await segmentTexts("dp-field"), ["28", "10", "2026"]);
    assert.equal(await activeId(), "dp-field-trigger");

    // The button shape: Enter opens on the chosen day, the arrows move and Enter chooses; the
    // trigger's text follows and its placeholder marker goes.
    await keyboardFocus(trigger("dp-button-empty"));
    await page.keyboard.press("Enter");
    await opened("dp-button-empty");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await closed("dp-button-empty");
    assert.equal(await textOf("dp-button-empty-trigger"), "28 Oct 2026");
    assert.equal(await page.getAttribute(trigger("dp-button-empty"), "data-placeholder"), null);
    assert.equal(await activeId(), "dp-button-empty-trigger");
    assert.equal(
      await page.getAttribute(content("dp-button"), "aria-labelledby"),
      "dp-button-label",
    );

    // A readonly picker opens and browses but doesn't choose.
    await page.click(trigger("dp-button-readonly-direct"));
    await opened("dp-button-readonly-direct");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await rendered();
    assert.equal(await textOf("dp-policy-writes"), "0");
    await page.keyboard.press("Escape");
    await closed("dp-button-readonly-direct");

    // clear() discards the value: every segment shows its token again.
    await page.click("#df-clear-button");
    await rendered();
    assert.deepEqual(await segmentTexts("df-clear"), ["dd", "mm", "yyyy"]);

    // In a Dialog: Escape closes the picker first, then the Dialog.
    await page.click("#dp-dialog-trigger");
    await page.waitForFunction(() => document.getElementById("dp-dialog-content").open);

    for (const id of ["dp-dialog", "dp-dialog-button"]) {
      await page.click(trigger(id));
      await opened(id);
      await page.keyboard.press("Escape");
      await closed(id);
      assert.equal(
        await page.evaluate(() => document.getElementById("dp-dialog-content").open),
        true,
        `the first Escape closes only ${id}'s popup`,
      );
      assert.equal(
        await page.evaluate(
          (selector) => document.activeElement === document.querySelector(selector),
          trigger(id),
        ),
        true,
      );
    }

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("dp-dialog-content").open);

    // Light: the box and the button trigger take the subtree's tokens.
    assert.equal(
      (await styleOf(box("dp-light"), ["backgroundColor"])).backgroundColor,
      await tokenIn("#dp-light", "surface"),
    );
    assert.equal(
      (await styleOf(trigger("dp-light-button"), ["color"])).color,
      await tokenIn("#dp-light-button", "muted-foreground"),
    );
    assert.notEqual(
      (await styleOf(box("dp-light"), ["backgroundColor"])).backgroundColor,
      (await styleOf(box("dp-field"), ["backgroundColor"])).backgroundColor,
    );

    await keyboardFocus(segment("dp-light", 0));
    assert.deepEqual(await styleOf(segment("dp-light", 0), ["backgroundColor", "color"]), {
      backgroundColor: await tokenIn("#dp-light", "foreground"),
      color: await tokenIn("#dp-light", "background"),
    });
    await blur();

    // Light, per state: the same specimens under a light ancestor take the light tokens.
    // Invalid keeps its orange border under the light ring; readonly dashes and drops the fill;
    // disabled dims once over the input border; both readonly ∩ disabled buttons keep the
    // disabled cursor and one dim over the dashed, unfilled, shadowless readonly look.
    await page.evaluate(() => document.getElementById("date-entries").classList.add("light"));

    const light = {
      muted: await tokenIn("#date-entries", "muted-foreground"),
      input: await tokenIn("#date-entries", "input"),
      ring: await tokenIn("#date-entries", "ring"),
      orange: await tokenIn("#date-entries", "destructive-text"),
    };

    assert.notEqual(light.orange, dark.orange, "the light tokens apply");
    assert.equal((await styleOf(segment("df-en-us", 0), ["color"])).color, light.muted);
    assert.equal(await textOf("df-invalid-error"), "Enter a date from 1900.");
    assert.deepEqual(await styleOf(box("df-invalid"), ["borderTopColor", "outlineStyle"]), {
      borderTopColor: light.orange,
      outlineStyle: "none",
    });
    await keyboardFocus(segment("df-invalid", 0));
    assert.equal(
      (await styleOf(box("df-invalid"), ["borderTopColor"])).borderTopColor,
      light.orange,
    );
    assert.deepEqual(await outline(box("df-invalid")), ring(light.ring));
    await blur();
    assert.deepEqual(
      await styleOf(box("df-readonly"), [
        "borderTopStyle",
        "borderTopColor",
        "backgroundColor",
        "opacity",
      ]),
      {
        borderTopStyle: "dashed",
        borderTopColor: light.input,
        backgroundColor: "rgba(0, 0, 0, 0)",
        opacity: "1",
      },
    );
    assert.deepEqual(await styleOf(box("df-disabled"), ["opacity", "cursor", "borderTopColor"]), {
      opacity: "0.5",
      cursor: "not-allowed",
      borderTopColor: light.input,
    });

    for (const id of ["dp-button-readonly-disabled", "dp-button-readonly-disabled-focusable"]) {
      const look = await styleOf(trigger(id), [
        "borderTopStyle",
        "borderTopColor",
        "backgroundColor",
        "boxShadow",
        "cursor",
        "opacity",
      ]);

      assert.equal(look.borderTopStyle, "dashed", `light ${id}`);
      assert.equal(look.borderTopColor, light.input, `light ${id}`);
      assert.ok(
        transparent(look.backgroundColor),
        `light ${id} background ${look.backgroundColor}`,
      );
      assert.ok(shadowless(look.boxShadow), `light ${id} shadow ${look.boxShadow}`);
      assert.equal(look.cursor, "not-allowed", `light ${id}`);
      assert.equal(look.opacity, "0.5", `light ${id}`);
      assert.equal((await styleOf(`#${id}`, ["opacity"])).opacity, "1", `light ${id} root`);
    }

    await page.evaluate(() => document.getElementById("date-entries").classList.remove("light"));

    // The sizers are hidden from the accessibility tree: an empty field reads only its units'
    // tokens.
    const usTree = await page.locator(box("df-en-us")).ariaSnapshot();

    assert.equal((usTree.match(/spinbutton/g) ?? []).length, 3, usTree);
    assert.doesNotMatch(usTree, /00/, usTree);

    // Waits until a scroller's position has held for 400ms, so a smooth or snapping wheel scroll
    // has ended.
    const scrollSettled = (selector) =>
      page.evaluate(
        (selector) =>
          new Promise((done) => {
            const element = document.querySelector(selector);
            let last = `${element.scrollLeft},${element.scrollTop}`;
            let stable = 0;
            let ticks = 0;
            const timer = setInterval(() => {
              const now = `${element.scrollLeft},${element.scrollTop}`;

              ticks += 1;
              stable = now === last ? stable + 1 : 0;
              last = now;

              if (stable >= 8 || ticks > 80) {
                clearInterval(timer);
                done();
              }
            }, 50);
          }),
        selector,
      );
    // The pointer over an element's middle, at whole pixels.
    const pointAt = async (selector) => {
      const { left, top, width, height } = await rect(selector);

      await page.mouse.move(Math.round(left + width / 2), Math.round(top + height / 2));
    };

    // Short viewports, with motion: Origami focuses the chosen day before the popup's height
    // settles, so the popup's snap scrolls it into view. After the opening animation the day
    // is wholly inside the popup's visible box and the page hasn't scrolled. Then a wheel over
    // the popup reaches the header and the last row and rests there, with focus on the same day:
    // the header and the rows are snap points too, so the focused day doesn't pull it back.
    // At 844×460 the whole overflow is 50px, inside the snap's proximity.
    await page.emulateMedia({ reducedMotion: "no-preference" });

    for (const height of [390, 460]) {
      await page.setViewportSize({ width: 844, height });
      await fresh();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(
        (selector) => document.querySelector(selector).scrollIntoView({ block: "center" }),
        trigger("dp-field"),
      );
      await keyboardFocus(trigger("dp-field"));

      const pageBeforeOpen = await page.evaluate(() => [scrollX, scrollY]);

      await page.keyboard.press("Enter");
      await opened("dp-field");
      await page.waitForFunction(
        (selector) =>
          document.querySelector(selector).getAnimations({ subtree: true }).length === 0,
        content("dp-field"),
      );
      await rendered();

      // The popup's visible box and the focused day, the ‹ button and the last row in it.
      const popupView = () =>
        page.evaluate((selector) => {
          const popup = document.querySelector(selector);
          const outer = popup.getBoundingClientRect();
          const top = outer.top + popup.clientTop;
          const left = outer.left + popup.clientLeft;
          const pick = (element) => {
            const { left, top, right, bottom } = element.getBoundingClientRect();

            return { left, top, right, bottom };
          };
          const rows = popup.querySelectorAll("tr");

          return {
            label: document.activeElement.getAttribute("aria-label"),
            day: pick(document.activeElement),
            previous: pick(popup.querySelector("[data-slot=calendar-previous]")),
            lastRow: pick(rows[rows.length - 1]),
            visible: {
              left,
              top,
              right: left + popup.clientWidth,
              bottom: top + popup.clientHeight,
            },
            scrollTop: popup.scrollTop,
            max: popup.scrollHeight - popup.clientHeight,
            page: [scrollX, scrollY],
          };
        }, content("dp-field"));
      const shortOpen = await popupView();

      assert.equal(shortOpen.label, "Tuesday, October 27, 2026", `${height}px`);
      assert.ok(shortOpen.max > 0, `the ${height}px popup scrolls`);
      inside(shortOpen.day, 0, shortOpen.visible, `the focused day in the ${height}px popup`);
      assert.deepEqual(shortOpen.page, pageBeforeOpen, `the page didn't scroll at ${height}px`);

      await pointAt(content("dp-field"));
      await page.mouse.wheel(0, -100);
      await scrollSettled(content("dp-field"));

      const wheeledUp = await popupView();

      assert.equal(wheeledUp.scrollTop, 0, `a wheel up the ${height}px popup reaches its top`);
      inside(
        wheeledUp.previous,
        0,
        wheeledUp.visible,
        `the ‹ button after a wheel up at ${height}px`,
      );
      assert.equal(wheeledUp.label, shortOpen.label, `the wheel moved focus at ${height}px`);

      await page.mouse.wheel(0, 100);
      await scrollSettled(content("dp-field"));
      await page.mouse.wheel(0, 100);
      await scrollSettled(content("dp-field"));

      const wheeledDown = await popupView();

      assert.equal(
        wheeledDown.scrollTop,
        wheeledDown.max,
        `a wheel down the ${height}px popup reaches its end`,
      );
      inside(
        wheeledDown.lastRow,
        0,
        wheeledDown.visible,
        `the last row after a wheel down at ${height}px`,
      );
      await page.keyboard.press("Escape");
      await closed("dp-field");
    }

    await page.emulateMedia({ reducedMotion: "reduce" });

    // 375px wide: after a click on the DateTimeField's first segment, a wheel over its row
    // reaches the row's end, its last segment wholly shown, and back, without moving focus. The
    // row snaps to every cell's start and its own end, not to the focused segment, so nothing
    // pulls it back to that segment; its whole 27px overflow would be inside a proximity snap's
    // reach.
    await page.setViewportSize({ width: 375, height: 720 });
    await fresh();
    await page.evaluate(() => document.fonts.ready);
    await page.locator(box("dtf")).scrollIntoViewIfNeeded();
    await pointAt(segment("dtf", 0));
    await page.mouse.down();
    await page.mouse.up();
    await rendered();

    const rowView = () =>
      page.evaluate((selector) => {
        const row = document.querySelector(selector);
        const segments = [...row.querySelectorAll("[data-slot=date-field-segment]")];
        const pick = (element) => {
          const { left, top, right, bottom } = element.getBoundingClientRect();

          return { left, top, right, bottom };
        };

        return {
          scrollLeft: row.scrollLeft,
          max: row.scrollWidth - row.clientWidth,
          first: pick(segments[0]),
          last: pick(segments.at(-1)),
          visible: pick(row),
          focused: segments.indexOf(document.activeElement),
        };
      }, row("dtf"));
    const clicked = await rowView();

    assert.equal(clicked.focused, 0, "the click focuses dtf's first segment");
    assert.ok(clicked.max > 0, "dtf's row overflows at 375px");
    await pointAt(row("dtf"));
    await page.mouse.wheel(100, 0);
    await scrollSettled(row("dtf"));

    const wheeledRight = await rowView();

    assert.equal(wheeledRight.scrollLeft, wheeledRight.max, "a wheel right reaches the row's end");
    inside(wheeledRight.last, 0, wheeledRight.visible, "dtf's last segment after a wheel right");
    assert.equal(wheeledRight.focused, 0, "the wheel right moved focus");
    await page.mouse.wheel(-100, 0);
    await scrollSettled(row("dtf"));

    const wheeledLeft = await rowView();

    assert.equal(wheeledLeft.scrollLeft, 0, "a wheel left reaches the row's start");
    inside(wheeledLeft.first, 0, wheeledLeft.visible, "dtf's first segment after a wheel left");
    assert.equal(wheeledLeft.focused, 0, "the wheel left moved focus");
    await blur();

    // 280px wide, two columns: the field-shape pickers' rows are 69px. Focus the month, wheel the
    // row right to 28px, then move to the year by ArrowRight or Tab: the year is wholly shown,
    // readonly and editable. Browsers leave a partly shown segment where it is when focus
    // reaches it, so a row resting at 28px, with the year's last pixel clipped, wouldn't reveal
    // it; the row's snap doesn't rest there. Nothing scrolls the row between the wheel and the key.
    await page.setViewportSize({ width: 280, height: 720 });

    for (const id of ["dp-field-readonly", "dp-field"]) {
      for (const key of ["ArrowRight", "Tab"]) {
        await fresh();
        await page.evaluate(() => document.fonts.ready);
        await keyboardFocus(segment(id, 1));
        await pointAt(row(id));

        const focusedAt = await page.evaluate(
          (selector) => document.querySelector(selector).scrollLeft,
          row(id),
        );

        await page.mouse.wheel(28 - focusedAt, 0);
        await scrollSettled(row(id));
        await page.keyboard.press(key);
        await scrollSettled(row(id));

        const year = await page.evaluate((selector) => {
          const row = document.querySelector(selector);
          const segments = [...row.querySelectorAll("[data-slot=date-field-segment]")];
          const pick = (element) => {
            const { left, top, right, bottom } = element.getBoundingClientRect();

            return { left, top, right, bottom };
          };

          return {
            focused: segments.indexOf(document.activeElement),
            text: document.activeElement.textContent,
            chip: pick(document.activeElement),
            visible: pick(row),
            max: row.scrollWidth - row.clientWidth,
          };
        }, row(id));

        assert.ok(year.max > 0, `${id}'s row overflows at 280px`);
        assert.equal(year.focused, 2, `${key} after a wheel moves ${id}'s focus to the year`);
        assert.equal(year.text, "2026", `${id}'s year`);
        inside(year.chip, 0, year.visible, `${id}'s year after a wheel and ${key}`);
      }
    }

    await blur();

    // 320px wide, two columns: the DateTimeField's and the field-shape picker's boxes stay in
    // their columns, the picker's trigger inside its box and outside the scrolling row. Moving
    // through the segments, by Tab and the arrows each way, shows every one wholly inside the
    // box and whatever clips it, and never scrolls the page sideways.
    await page.setViewportSize({ width: 320, height: 720 });
    await fresh();
    await page.evaluate(() => document.fonts.ready);

    // The focused element's rect, and the box's inner rect cut by every clipping ancestor
    // between them.
    const shownIn = (selector) =>
      page.evaluate((selector) => {
        const box = document.querySelector(selector);
        const focused = document.activeElement;
        const { left, top, right, bottom } = focused.getBoundingClientRect();
        const outer = box.getBoundingClientRect();
        const visible = {
          left: outer.left + box.clientLeft,
          top: outer.top + box.clientTop,
          right: outer.right - box.clientLeft,
          bottom: outer.bottom - box.clientTop,
        };

        for (
          let element = focused.parentElement;
          element !== box;
          element = element.parentElement
        ) {
          if (getComputedStyle(element).overflowX === "visible") {
            continue;
          }

          const clip = element.getBoundingClientRect();

          visible.left = Math.max(visible.left, clip.left);
          visible.top = Math.max(visible.top, clip.top);
          visible.right = Math.min(visible.right, clip.right);
          visible.bottom = Math.min(visible.bottom, clip.bottom);
        }

        return {
          index: [...box.querySelectorAll("[data-slot=date-field-segment]")].indexOf(focused),
          text: focused.textContent,
          rect: { left, top, right, bottom },
          visible,
          pageX: scrollX,
        };
      }, selector);
    const narrow = [
      ["dtf", "Tab", "ArrowLeft", 5],
      ["dp-field", "ArrowRight", "ArrowLeft", 3],
    ];

    for (const [id, forward, backward, count] of narrow) {
      const column = await rect(`#${id}-field`);
      const narrowBox = await rect(box(id));

      assert.ok(
        narrowBox.left >= column.left - 0.5 && narrowBox.right <= column.right + 0.5,
        `${id}'s box ${JSON.stringify(narrowBox)} leaves its column ${JSON.stringify(column)}`,
      );

      // The first unit, found without the row, so a box without it fails on what it shows.
      await keyboardFocus(
        `#${id} [data-slot=date-field-cell]:first-child > [data-slot=date-field-segment]`,
      );

      const keys = [];
      const expected = [0];

      for (let index = 1; index < count; index += 1) {
        keys.push(forward);
        expected.push(index);
      }

      for (let index = count - 2; index >= 0; index -= 1) {
        keys.push(backward);
        expected.push(index);
      }

      const seen = [await shownIn(box(id))];

      for (const key of keys) {
        await page.keyboard.press(key);
        await rendered();
        seen.push(await shownIn(box(id)));
      }

      const visited = [];

      for (const shown of seen) {
        visited.push(shown.index);
        inside(shown.rect, 0, shown.visible, `${id}'s focused "${shown.text}"`);
        assert.equal(shown.pageX, 0, `the page scrolled sideways at ${id}'s "${shown.text}"`);
      }

      assert.deepEqual(visited, expected, `${id}'s segments by ${forward} and ${backward}`);
    }

    const pickerBox = await rect(box("dp-field"));
    const pickerTrigger = await rect(trigger("dp-field"));
    const pickerRow = await rect(row("dp-field"));

    inside(
      pickerTrigger,
      0,
      {
        left: pickerBox.left + 1,
        top: pickerBox.top + 1,
        right: pickerBox.right - 1,
        bottom: pickerBox.bottom - 1,
      },
      "the narrow picker's trigger",
    );
    assert.ok(pickerTrigger.left >= pickerRow.right - 0.5, "the trigger sits after the row");
    await keyboardFocus(segment("dp-field", 2));
    await page.keyboard.press("Tab");
    assert.equal(await activeId(), "dp-field-trigger");
    assert.equal(await page.evaluate(() => scrollX), 0);

    // The scrolling row is never a Tab stop of its own, which an overflowing scroller would be
    // (Chromium's keyboard-focusable scrollers, Gecko's scroll frames): Tab from the control
    // before an overflowing box lands on its first segment and Shift+Tab leaves it for that
    // control, and Tab passes over overflowing root-disabled boxes whole.
    const overflows = (id) =>
      page.evaluate((selector) => {
        const element = document.querySelector(selector);

        return element.scrollWidth > element.clientWidth;
      }, row(id));
    // The focused element's root, slot and segment index in that root.
    const focusedPart = () =>
      page.evaluate(() => {
        const focused = document.activeElement;
        const root = focused.closest("[data-slot=date-field], [data-slot=date-picker]");

        return {
          root: root?.id,
          slot: focused.dataset.slot,
          index: [...(root?.querySelectorAll("[data-slot=date-field-segment]") ?? [])].indexOf(
            focused,
          ),
        };
      });
    const tabs = [
      [segment("tf-24s", 2), { root: "tf-24s", slot: "date-field-segment", index: 2 }],
      [
        trigger("dp-field-readonly"),
        { root: "dp-field-readonly", slot: "date-picker-trigger", index: -1 },
      ],
    ];
    const nexts = [
      { root: "dtf", slot: "date-field-segment", index: 0 },
      { root: "dp-field-disabled-focusable", slot: "date-picker-trigger", index: -1 },
    ];

    for (const id of ["dtf", "dp-field-disabled", "dp-field-disabled-focusable"]) {
      assert.ok(await overflows(id), `${id}'s row overflows at 320px`);
    }

    for (const [index, [from, start]] of tabs.entries()) {
      await keyboardFocus(from);
      assert.deepEqual(await focusedPart(), start);
      await page.keyboard.press("Tab");
      await rendered();
      assert.deepEqual(await focusedPart(), nexts[index], `Tab from ${start.root}`);
      await page.keyboard.press("Shift+Tab");
      await rendered();
      assert.deepEqual(await focusedPart(), start, `Shift+Tab back to ${start.root}`);
    }

    await blur();
    await page.setViewportSize({ width: 1280, height: 720 });

    // Forced colors, split by region: a focused segment is Highlight over its chip, its text's
    // width and 2px each side, and the field's ground over the rest of its cell, on both sides of
    // a centred digit chip and after the day period's; unfocused filled, placeholder and disabled
    // cells paint the ground. A painted sizer would break one of these.
    await page.emulateMedia({ forcedColors: "active" });
    await fresh();
    await page.evaluate(() => document.fonts.ready);

    const systemColors = await page.evaluate(() => {
      const probe = document.createElement("span");
      const read = (value) => {
        probe.style.cssText = `position: fixed; forced-color-adjust: none; color: ${value}`;

        return getComputedStyle(probe).color;
      };

      document.body.append(probe);

      const result = {
        highlight: read("Highlight"),
        highlightText: read("HighlightText"),
        canvasText: read("CanvasText"),
        grayText: read("GrayText"),
      };

      probe.remove();

      return result;
    });
    // Points 1px or more from the segment's glyphs, along each cell's middle row, by region.
    const regionPoints = (id) =>
      page.evaluate((selector) => {
        const element = document.querySelector(selector);
        const outer = element.getBoundingClientRect();
        const result = { ground: [outer.left + 5, (outer.top + outer.bottom) / 2], regions: [] };

        for (const cell of element.querySelectorAll("[data-slot=date-field-cell]")) {
          const segment = cell.querySelector("[data-slot=date-field-segment]");
          const range = document.createRange();

          range.selectNodeContents(segment);

          const glyphs = range.getBoundingClientRect();
          const area = cell.getBoundingClientRect();
          const chip = segment.getBoundingClientRect();
          const y = Math.round((area.top + area.bottom) / 2);
          const focused = segment === document.activeElement;
          const radius = parseFloat(getComputedStyle(segment).borderTopLeftRadius);
          // Along the middle row beside the glyphs, and along a row below them, clear of the
          // chip's rounded corners. Chromium paints boxes at rounded edges, so a pixel whose
          // centre is a quarter pixel inside an edge is painted.
          const pointsIn = (left, right) => {
            const points = [];

            for (let x = Math.floor(left); x < Math.ceil(right); x += 1) {
              const centre = x + 0.5;

              if (centre < left + 0.25 || centre > right - 0.25) {
                continue;
              }

              if (centre > glyphs.left - 1 && centre < glyphs.right + 1) {
                continue;
              }

              points.push([x, y]);
            }

            const below = Math.floor((glyphs.bottom + area.bottom) / 2);

            if (below + 0.5 >= glyphs.bottom + 1 && below + 0.5 <= area.bottom - 1) {
              for (let x = Math.ceil(left + radius); x < Math.floor(right - radius); x += 1) {
                points.push([x, below]);
              }
            }

            return points;
          };

          if (focused && chip.width < area.width - 1) {
            result.regions.push({ name: "chip", points: pointsIn(chip.left, chip.right) });
            result.regions.push({
              name: "remainder",
              points: [...pointsIn(area.left, chip.left), ...pointsIn(chip.right, area.right)],
            });
          } else if (focused) {
            result.regions.push({ name: "chip", points: pointsIn(area.left, area.right) });
          } else {
            result.regions.push({ name: "ground", points: pointsIn(area.left, area.right) });
          }
        }

        return result;
      }, box(id));
    const checkRegions = async (id, focusIndex) => {
      await page.locator(box(id)).scrollIntoViewIfNeeded();

      if (focusIndex === null) {
        await blur();
      } else {
        await keyboardFocus(segment(id, focusIndex));
      }

      await page.mouse.move(0, 0);

      const layout = await regionPoints(id);
      const points = [layout.ground];

      for (const region of layout.regions) {
        points.push(...region.points);
      }

      const colors = await screenPixels(points);
      const ground = colors[0];
      let index = 1;
      const counts = {};

      for (const region of layout.regions) {
        let expected = ground;

        // Chromium's emulated Highlight is translucent, composited over the field's ground.
        if (region.name === "chip") {
          expected = over(systemColors.highlight, ground);
        }

        counts[region.name] = (counts[region.name] ?? 0) + region.points.length;

        for (const point of region.points) {
          const color = colors[index];

          index += 1;
          assert.ok(
            color.every((value, channel) => Math.abs(value - expected[channel]) <= 2),
            `${id} ${region.name} at ${point}: ${color} ≠ ${expected}`,
          );
        }
      }

      return counts;
    };

    await keyboardFocus(segment("tf-12", 0));
    await page.keyboard.type("0930p");

    const digitCounts = await checkRegions("df-clear", 0);
    const yearCounts = await checkRegions("df-clear", 2);
    const periodCounts = await checkRegions("tf-12", 2);
    const unfocused = [
      await checkRegions("df-clear", null),
      await checkRegions("df-en-us", null),
      await checkRegions("df-disabled", null),
    ];

    for (const counts of [digitCounts, yearCounts]) {
      assert.ok(
        counts.chip > 0 && counts.remainder > 0,
        `a digit's regions sampled: ${JSON.stringify(counts)}`,
      );
    }

    assert.ok(
      periodCounts.chip > 0 && periodCounts.remainder > 0,
      `the period's regions sampled: ${JSON.stringify(periodCounts)}`,
    );

    for (const counts of unfocused) {
      assert.ok(counts.ground > 0, "unfocused cells sampled");
    }

    assert.equal((await styleOf(segment("df-en-us", 0), ["color"])).color, systemColors.grayText);
    assert.equal(
      (await styleOf(segment("df-disabled", 0), ["color"])).color,
      systemColors.grayText,
    );

    // The focused segment's text, apart from the pixel regions above, which sample beside the
    // glyphs: HighlightText on Highlight for a filled digit, the day period and a placeholder.
    for (const [id, index, placeholder] of [
      ["df-clear", 0, null],
      ["tf-12", 2, null],
      ["df-en-us", 0, ""],
    ]) {
      await keyboardFocus(segment(id, index));
      assert.equal(await page.getAttribute(segment(id, index), "data-placeholder"), placeholder);
      assert.deepEqual(
        await styleOf(segment(id, index), ["color", "backgroundColor"]),
        { color: systemColors.highlightText, backgroundColor: systemColors.highlight },
        `forced focused ${id} ${index}`,
      );
    }

    assert.equal((await outline(box("df-en-us"))).style, "solid");
    await blur();

    // Readonly ∩ disabled buttons keep the disabled cursor and one dim over the dashed, unfilled,
    // shadowless readonly look.
    for (const id of ["dp-button-readonly-disabled", "dp-button-readonly-disabled-focusable"]) {
      const look = await styleOf(trigger(id), [
        "borderTopStyle",
        "backgroundColor",
        "boxShadow",
        "cursor",
        "opacity",
      ]);

      assert.equal(look.borderTopStyle, "dashed", `forced ${id}`);
      assert.ok(
        transparent(look.backgroundColor),
        `forced ${id} background ${look.backgroundColor}`,
      );
      assert.ok(shadowless(look.boxShadow), `forced ${id} shadow ${look.boxShadow}`);
      assert.equal(look.cursor, "not-allowed", `forced ${id}`);
      assert.equal(look.opacity, "0.5", `forced ${id}`);
      assert.equal((await styleOf(`#${id}`, ["opacity"])).opacity, "1", `forced ${id} root`);
      // Natively disabled or only focusable-disabled, the text is GrayText, like a TabsTrigger.
      assert.equal(
        (await styleOf(trigger(id), ["color"])).color,
        systemColors.grayText,
        `forced ${id} text`,
      );
    }

    // A disabled field-shape trigger's icon is GrayText, by a disabled root, a focusable one or
    // its own disabled; an enabled one's is CanvasText.
    const iconStroke = async (id) =>
      (await styleOf(`${trigger(id)} > [data-slot=date-picker-icon]`, ["stroke"])).stroke;

    for (const id of [
      "dp-field-disabled",
      "dp-field-disabled-focusable",
      "dp-field-trigger-disabled",
    ]) {
      assert.equal(await iconStroke(id), systemColors.grayText, `forced ${id} icon`);
    }

    assert.equal(await iconStroke("dp-field"), systemColors.canvasText);
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  }

  assert.deepEqual(errors, [], "console errors or warnings");
  console.log("Chromium smoke passed:", JSON.stringify(geometry));
} finally {
  await browser?.close();
  server.kill();
}
