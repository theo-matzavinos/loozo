// Chromium smoke of the consumer check's production build (consumer.mjs): the prerendered HTML,
// hydration without errors, the button geometry, colors and type, the AlertDialog's, Dialog's and
// Sheet's focus, dismissal, placement and motion, a Signal Forms Field's wiring, errors and
// control styling, Checkbox's, Switch's and RadioGroup's states, keys, layout, nesting and forced
// colors, the Number field's and Slider's server state, geometry, typing, stepping, keys,
// pointer and touch, validation, states and forced colors, and Select's and Combobox's server
// state, geometry, pointer and keys, scrolling and placement, Tab order, motion, touch, bound
// values, states, themes and forced colors, and Tabs', Tooltip's and Popover's server state,
// geometry, keys, pointer and hover, guarded unavailable actions, placement and flipping, Tab
// order and scrolling, nesting, motion and forced colors, and the File field's server state,
// geometry, picks and sizes, long names, drag and drop, keyboard focus, validation, clearing,
// states, themes and forced colors.
//
// Usage: node tests/consumer-smoke.mjs <app directory>
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright";

const app = process.argv[2];

assert.ok(app, "Usage: node tests/consumer-smoke.mjs <app directory>");

async function freePort() {
  const server = createServer();

  await new Promise((done) => server.listen(0, "127.0.0.1", done));

  const { port } = server.address();

  await new Promise((done) => server.close(done));

  return port;
}

async function waitForServer(url, server) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    assert.equal(server.exitCode, null, "the SSR server exited");

    try {
      const response = await fetch(url);

      if (response.ok) {
        return response.text();
      }
    } catch {
      // Not listening yet.
    }

    await new Promise((done) => setTimeout(done, 200));
  }

  throw new Error(`${url} didn't respond within 30 s`);
}

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

const port = await freePort();
const base = `http://localhost:${port}/`;
const server = spawn("node", [join(app, "dist/consumer/server/server.mjs")], {
  env: { ...process.env, PORT: String(port), NG_ALLOWED_HOSTS: "localhost" },
  stdio: ["ignore", "inherit", "inherit"],
});

let browser;

try {
  const html = await waitForServer(base, server);

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
  const scrolls = (id) =>
    page.evaluate((id) => {
      const list = document.getElementById(id);

      return list.scrollHeight > list.clientHeight;
    }, id);
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

  // Scrolling and placement, in a 600px viewport: a long list scrolls within the room left less
  // 8px and shows the chosen option without scrolling the page; near the viewport's bottom it
  // opens 4px above; a wide list beside the viewport's end stays inside it.
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.evaluate(() =>
    document.getElementById("country-trigger").scrollIntoView({ block: "center" }),
  );
  await page.focus("#country-trigger");

  const scrollBefore = await page.evaluate(() => window.scrollY);

  await page.keyboard.press("ArrowDown");
  await shown("country-content");

  const country = await page.evaluate(() => {
    const list = document.getElementById("country-content");
    const style = getComputedStyle(list);
    const rect = list.getBoundingClientRect();
    const greece = document.getElementById("country-gr").getBoundingClientRect();

    return {
      scrolls: list.scrollHeight > list.clientHeight,
      maxHeight: parseFloat(style.maxHeight),
      available: parseFloat(style.getPropertyValue("--og-available-height")),
      greeceInside: greece.top >= rect.top && greece.bottom <= rect.bottom,
      scrollY: window.scrollY,
    };
  });

  assert.equal(country.scrolls, true, "the country list scrolls");
  near(country.maxHeight, Math.min(320, country.available - 8), 1, "the list's max height");
  assert.equal(country.greeceInside, true, "the chosen country is in view");
  assert.equal(country.scrollY, scrollBefore, "opening doesn't scroll the page");
  await page.keyboard.press("End");
  await page.waitForSelector("#country-ch[data-active]");
  assert.ok(
    await page.evaluate(() => {
      const list = document.getElementById("country-content").getBoundingClientRect();
      const last = document.getElementById("country-ch").getBoundingClientRect();

      return last.top >= list.top && last.bottom <= list.bottom;
    }),
    "End shows the last country",
  );
  await page.keyboard.press("Escape");
  await hidden("country-content");

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

  // Tab out of an open list, from a fresh page: a scrolling list isn't a Tab stop, so focus
  // reaches the next control and the list closes.
  await fresh();
  await page.evaluate(() =>
    document.getElementById("country-trigger").scrollIntoView({ block: "center" }),
  );
  await page.focus("#country-trigger");
  await page.keyboard.press("ArrowDown");
  await shown("country-content");
  assert.equal(await scrolls("country-content"), true);
  await page.keyboard.press("Tab");
  await rendered();
  assert.equal(await activeId(), "picks-save");
  assert.equal(await attribute("country-trigger", "aria-expanded"), "false");

  await page.evaluate(() =>
    document.getElementById("scrolling-planet-input").scrollIntoView({ block: "center" }),
  );
  await page.focus("#scrolling-planet-input");
  await page.keyboard.press("ArrowDown");
  await shown("scrolling-planet-content");
  assert.equal(await scrolls("scrolling-planet-content"), true);
  await page.keyboard.press("Tab");
  await rendered();
  assert.equal(await activeId(), "after-scrolling-planet");

  await page.evaluate(() =>
    document.getElementById("planet-input").scrollIntoView({ block: "start" }),
  );
  await page.focus("#planet-input");
  await page.keyboard.press("ArrowDown");
  await shown("planet-content");
  assert.equal(await scrolls("planet-content"), false);
  await page.keyboard.press("Tab");
  await rendered();
  assert.equal(await activeId(), "country-trigger");
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
  assert.equal(
    fileButtonValue
      .slice(openingTag(html, "file-button-value").length)
      .replace(/<!--[^]*?-->/g, "")
      .trim(),
    "",
    "no file on the server",
  );

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
    await page.evaluate(() => document.getElementById("file-locked-zone-value").childElementCount),
    0,
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

  // Clearing writes null: the value line goes, leaving no gap, and the Input holds no file.
  await pick("file-primary-input", "logo.png", 1536);
  await untilFileSize("file-primary-value", "1.5 KB");

  const rootWidth = () =>
    page.evaluate(() => ({
      root: document.getElementById("file-primary-root").getBoundingClientRect().width,
      button: document.getElementById("file-primary").getBoundingClientRect().width,
    }));

  assert.ok((await rootWidth()).root > (await rootWidth()).button + 12, "the value is shown");
  await page.click("#file-primary-clear");
  await page.waitForFunction(
    () => document.getElementById("file-primary-value").childElementCount === 0,
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      display: getComputedStyle(document.getElementById("file-primary-value")).display,
      files: document.getElementById("file-primary-input").files.length,
    })),
    { display: "none", files: 0 },
  );
  assert.ok(
    Math.abs((await rootWidth()).root - (await rootWidth()).button) <= 0.5,
    "no gap after clearing",
  );

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
  assert.equal((await styleOf("#file-locked-button-value", ["opacity"])).opacity, "0.5");

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
  assert.match(openingTag(html, "notes-content"), /\btabindex="0"/);
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
      paddingTop: "12px",
      backgroundColor: darkSurface,
      borderTopLeftRadius: "12px",
      borderTopWidth: "1px",
    },
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

  // Long text in a 600px viewport scrolls inside, within the room left less 8px. Its authored
  // tabindex="0" makes it the Tab stop after the Trigger, with the ring, and ArrowDown scrolls it.
  await page.setViewportSize({ width: 1280, height: 600 });
  await scrollToTop("notes-trigger");
  await page.click("#notes-trigger");
  await opened("notes-content");

  const notes = await page.evaluate(() => {
    const content = document.getElementById("notes-content");

    return {
      height: content.getBoundingClientRect().height,
      available: parseFloat(getComputedStyle(content).getPropertyValue("--og-available-height")),
      scrolls: content.scrollHeight > content.clientHeight,
    };
  });

  assert.ok(notes.scrolls, "the notes scroll");
  assert.ok(
    notes.height <= notes.available - 8 + 0.5,
    `notes ${notes.height} of ${notes.available}`,
  );
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "notes-content");
  assert.deepEqual(await outline("#notes-content"), ringOutline("rgb(76, 196, 111)"));
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.getElementById("notes-content").scrollTop > 0);
  await page.keyboard.press("Escape");
  await dismissed("notes-content");

  // Interactive Content taller than a short viewport: Chromium skips the scrolling panel, so Tab
  // from the Trigger reaches the first field.
  await page.setViewportSize({ width: 1280, height: 400 });
  await scrollToTop("scrollform-trigger");
  await page.click("#scrollform-trigger");
  await opened("scrollform-content");
  assert.equal(await scrolls("scrollform-content"), true);
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "scrollform-0");
  await page.keyboard.press("Escape");
  await dismissed("scrollform-content");
  await page.setViewportSize({ width: 1280, height: 720 });

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
  await page.keyboard.press("Tab");
  assert.equal(await activeId(), "notes-content");
  assert.deepEqual(await outline("#notes-content"), ringOutline(systemColors.highlight));
  await page.keyboard.press("Escape");
  await dismissed("notes-content");
  await page.emulateMedia({ forcedColors: "none" });

  assert.deepEqual(errors, [], "console errors or warnings");
  console.log("Chromium smoke passed:", JSON.stringify(geometry));
} finally {
  await browser?.close();
  server.kill();
}
