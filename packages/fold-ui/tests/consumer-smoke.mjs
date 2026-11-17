// Chromium smoke of the consumer check's production build (consumer.mjs): the prerendered HTML,
// hydration without errors, the button geometry, colors and type, the AlertDialog's, Dialog's and
// Sheet's focus, dismissal, placement and motion, a Signal Forms Field's wiring, errors and
// control styling, Checkbox's, Switch's and RadioGroup's states, keys, layout, nesting and forced
// colors, and the Number field's and Slider's server state, geometry, typing, stepping, keys,
// pointer and touch, validation, states and forced colors.
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
        "#renew",
        "#renew > [data-slot=switch-thumb]",
        "#cycle-monthly > [data-slot=radio-group-indicator]",
        "#cycle-monthly > [data-slot=radio-group-indicator] > span",
      ].map((selector) => getComputedStyle(document.querySelector(selector)).transitionDuration),
    ),
    ["0s", "0s", "0s", "0s", "0s", "0s"],
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

  assert.deepEqual(errors, [], "console errors or warnings");
  console.log("Chromium smoke passed:", JSON.stringify(geometry));
} finally {
  await browser?.close();
  server.kill();
}
