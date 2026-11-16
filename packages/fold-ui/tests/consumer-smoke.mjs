// Chromium smoke of the consumer check's production build (consumer.mjs): the prerendered HTML,
// hydration without errors, the button geometry, colors and type, the AlertDialog's, Dialog's and
// Sheet's focus, dismissal, placement and motion, a Signal Forms Field's wiring, errors and
// control styling, and Checkbox's, Switch's and RadioGroup's states, keys, layout and nesting.
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

  const page = await browser.newPage();
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

  assert.deepEqual(errors, [], "console errors or warnings");
  console.log("Chromium smoke passed:", JSON.stringify(geometry));
} finally {
  await browser?.close();
  server.kill();
}
