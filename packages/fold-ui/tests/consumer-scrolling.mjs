// Scrolling in one engine, against the consumer check's production build (consumer.mjs): Select's,
// Combobox's, Menu's and Popover's Content and Dialog's and Sheet's bodies scroll in fold's
// ScrollArea. Their drawn thumbs, Tab out of an open list, menu or Popover, initial focus, the
// active option and the focused control revealed within 100ms of the key, height caps and the
// list scroller's box, the modal page lock and the closed surfaces' display. Each scenario starts
// from a fresh hydrated page with its own viewport and motion, and any page or hydration error
// fails the run.
//
// Usage: node tests/consumer-scrolling.mjs <app directory> <chromium|firefox|webkit>
import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";
import { webkitLaunchOptions } from "../../origami-ui/tests/acceptance/webkit-launch.ts";
import { startServer } from "./consumer-server.mjs";

const VIEWPORT = "[data-slot=scroll-area] > [data-slot=scroll-area-viewport]";
const DEADLINE = 100;
// Two 60Hz frames: a wider hole between the observations around the deadline is a sampling gap.
const GAP = 34;

/** A Content's scroller: the viewport of the ScrollArea fold renders inside it. */
export const contentViewport = (id) => `#${id} > ${VIEWPORT}`;
/** A Dialog's or Sheet's Body scroller. */
export const bodyViewport = (id) =>
  `#${id} :is([data-slot=dialog-body], [data-slot=sheet-body]) > ${VIEWPORT}`;

class RevealFailure extends Error {
  constructor(label, call, evidence) {
    super(
      `${label}: ${call.key} expecting ${JSON.stringify(call.expect)} in ${call.surface}\n` +
        JSON.stringify(evidence, null, 1),
    );
    this.label = label;
  }
}

/** The page never answered: the engine fails without waiting on it. */
export class Stalled extends Error {
  constructor(call) {
    super(`stalled: ${call.key} expecting ${JSON.stringify(call.expect)} in ${call.surface}`);
  }
}

// Installed in the page before the key. It records the matching keydown's time, then observes the
// expected target from frames, from a timer after each frame and from a watchdog, until the target
// is inside the viewport or the deadline has passed.
function armProbe(call) {
  const segments = call.key.split("+");
  const key = segments[segments.length - 1];
  const modifiers = new Set(segments.slice(0, -1));
  const kind = Object.hasOwn(call.expect, "active") ? "active" : "focus";
  const selector = call.expect[kind];
  const surfaceOf = () => document.querySelector(call.surface);
  const viewportOf = () => document.querySelector(call.viewport);
  const targetOf = () => document.querySelector(selector);
  const describe = (element) => {
    if (!element) {
      return null;
    }

    if (element.id) {
      return `#${element.id}`;
    }

    return `${element.tagName.toLowerCase()}[data-slot=${element.dataset.slot ?? ""}]`;
  };

  // Open (in the top layer or a shown <dialog>), laid out, and the target the key must produce.
  const holds = () => {
    const surface = surfaceOf();

    if (!surface) {
      return false;
    }

    const open = surface.matches(":popover-open") || surface.open === true;

    if (!open || getComputedStyle(surface).display === "none") {
      return false;
    }

    const target = targetOf();

    if (!target || !surface.contains(target)) {
      return false;
    }

    if (kind === "active") {
      if (!target.hasAttribute("data-active")) {
        return false;
      }

      if (surface.querySelectorAll("[data-active]").length !== 1) {
        return false;
      }
    } else if (document.activeElement !== target) {
      return false;
    }

    return target.getClientRects().length > 0;
  };

  // The target, grown by its focus ring when asked, inside the viewport's client box within 1px.
  const measure = () => {
    const target = targetOf();
    const viewport = viewportOf();
    const rect = target.getBoundingClientRect();
    let grow = 0;

    if (call.ring) {
      const style = getComputedStyle(target);

      if (style.outlineStyle !== "none") {
        grow = Math.max(0, parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth));
      }
    }

    const outer = viewport.getBoundingClientRect();
    const top = outer.top + viewport.clientTop;
    const left = outer.left + viewport.clientLeft;
    const box = {
      top,
      left,
      bottom: top + viewport.clientHeight,
      right: left + viewport.clientWidth,
    };
    const extent = {
      top: rect.top - grow,
      left: rect.left - grow,
      bottom: rect.bottom + grow,
      right: rect.right + grow,
    };
    const inside =
      extent.top >= box.top - 1 &&
      extent.bottom <= box.bottom + 1 &&
      extent.left >= box.left - 1 &&
      extent.right <= box.right + 1;

    return { inside, rect: extent, box };
  };

  let resolveFinished;
  const probe = {
    preTarget: null,
    keydowns: [],
    observations: [],
    t0: null,
    tDispatch: null,
    error: null,
    done: false,
    scrollEnded: false,
    finished: new Promise((resolve) => {
      resolveFinished = resolve;
    }),
  };

  const finish = () => {
    if (probe.done) {
      return;
    }

    probe.done = true;
    clearTimeout(probe.noKeyTimer);
    clearTimeout(probe.watchdog);
    resolveFinished();
  };

  // State and geometry first, then the time: the stamp can only come after what it measured.
  const observe = (source, frameTime) => {
    const state = holds();
    let geometry = null;

    if (state) {
      geometry = measure();
    }

    const obsTime = performance.now();
    const observation = {
      source,
      obsTime,
      elapsed: obsTime - probe.t0,
      frameTime,
      state,
      inside: geometry?.inside ?? false,
      rect: geometry?.rect ?? null,
      box: geometry?.box ?? null,
    };

    probe.observations.push(observation);

    if ((observation.state && observation.inside) || observation.elapsed > 100) {
      finish();
    }
  };

  const frame = (frameTime) => {
    if (probe.done) {
      return;
    }

    observe("frame", frameTime);

    if (probe.done) {
      return;
    }

    // Angular renders in a frame callback registered after this one: this timer sees that frame.
    setTimeout(() => {
      if (!probe.done) {
        observe("after-frame", null);
      }
    }, 0);
    requestAnimationFrame(frame);
  };

  const onKeydown = (event) => {
    const matches =
      event.key === key &&
      event.shiftKey === modifiers.has("Shift") &&
      event.ctrlKey === modifiers.has("Control") &&
      event.altKey === modifiers.has("Alt") &&
      event.metaKey === modifiers.has("Meta") &&
      !event.repeat;

    probe.keydowns.push({
      sequence: probe.keydowns.length,
      key: event.key,
      shiftKey: event.shiftKey,
      timeStamp: event.timeStamp,
      matched: matches,
    });

    if (!matches) {
      return;
    }

    if (probe.t0 !== null) {
      probe.error ??= "duplicate-key";
      return;
    }

    probe.t0 = event.timeStamp;
    probe.tDispatch = performance.now();
    clearTimeout(probe.noKeyTimer);

    const lag = probe.tDispatch - probe.t0;

    if (!(lag >= 0 && lag < 1000)) {
      probe.error = "clock";
      finish();
      return;
    }

    requestAnimationFrame(frame);
    probe.watchdog = setTimeout(() => {
      if (!probe.done) {
        observe("watchdog", null);
        finish();
      }
    }, 150);
  };

  if (kind === "active") {
    const active = [];

    for (const option of surfaceOf()?.querySelectorAll("[data-active]") ?? []) {
      active.push(describe(option));
    }

    probe.preTarget = active;
  } else {
    probe.preTarget = describe(document.activeElement);
  }

  // The key would prove nothing: its target already holds.
  if (holds()) {
    return { vacuous: true, preTarget: probe.preTarget };
  }

  const viewport = viewportOf();
  const onScrollEnd = () => {
    if (probe.t0 !== null) {
      probe.scrollEnded = true;
    }
  };

  viewport.addEventListener("scrollend", onScrollEnd);
  window.addEventListener("keydown", onKeydown, true);
  probe.noKeyTimer = setTimeout(() => {
    probe.error ??= "no-keydown";
    finish();
  }, 1000);

  probe.result = async () => {
    await probe.finished;

    return {
      error: probe.error,
      t0: probe.t0,
      tDispatch: probe.tDispatch,
      preTarget: probe.preTarget,
      keydowns: probe.keydowns,
      observations: probe.observations,
    };
  };

  // The expected target's state and, while it holds, its geometry, for an opening key's wait.
  probe.check = () => {
    const state = holds();

    if (!state) {
      return { state };
    }

    return { state, ...measure() };
  };

  // After the viewport's scrollend, or 500ms after the key without one: the same target again.
  probe.settled = async () => {
    if (!probe.scrollEnded) {
      const wait = Math.max(0, 500 - (performance.now() - probe.t0));

      await new Promise((resolve) => {
        const timer = setTimeout(resolve, wait);

        viewport.addEventListener(
          "scrollend",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }

    window.removeEventListener("keydown", onKeydown, true);
    viewport.removeEventListener("scrollend", onScrollEnd);

    const state = holds();
    let geometry = null;

    if (state) {
      geometry = measure();
    }

    return { error: probe.error, state, ...geometry };
  };

  window.__foldRevealProbe = probe;

  return { vacuous: false, preTarget: probe.preTarget };
}

function checkObservations(call, result) {
  if (result.error) {
    throw new RevealFailure(result.error, call, { ...result });
  }

  for (const observation of result.observations) {
    if (observation.elapsed < 0) {
      throw new RevealFailure("negative-elapsed", call, { ...result });
    }
  }
}

function classify(call, result) {
  const evidence = { ...result };

  checkObservations(call, result);

  const reached = result.observations.find(
    (observation) => observation.state && observation.inside,
  );

  if (reached && reached.elapsed <= DEADLINE) {
    return;
  }

  // The last observation at or before the deadline (the keydown itself if none) and the next.
  let before = { elapsed: 0, state: false };
  let after = null;

  for (const observation of result.observations) {
    if (observation.elapsed <= DEADLINE) {
      before = observation;
    } else {
      after = observation;
      break;
    }
  }

  if (!after || after.elapsed - before.elapsed > GAP) {
    throw new RevealFailure("sampling-gap", call, evidence);
  }

  if (before.state) {
    throw new RevealFailure("out-of-bounds", call, evidence);
  }

  throw new RevealFailure("not-reached", call, evidence);
}

async function revealSteps(page, call) {
  const armed = await page.evaluate(armProbe, call);

  if (armed.vacuous) {
    throw new RevealFailure("vacuous", call, armed);
  }

  await page.keyboard.press(call.key);

  const result = await page.evaluate(() => window.__foldRevealProbe.result());

  if (call.opens) {
    // An opening key: the list opens and is placed first, so the 100ms bound doesn't apply; the
    // expected option must be inside the placed list within 2s.
    checkObservations(call, result);
    await page
      .waitForFunction(
        () => {
          const check = window.__foldRevealProbe.check();

          return check.state && check.inside;
        },
        null,
        { timeout: 2000 },
      )
      .catch(async () => {
        const check = await page.evaluate(() => window.__foldRevealProbe.check());

        throw new RevealFailure("open-not-revealed", call, { ...result, check });
      });
  } else {
    classify(call, result);
  }

  const settled = await page.evaluate(() => window.__foldRevealProbe.settled());

  if (settled.error) {
    throw new RevealFailure(settled.error, call, { ...result, settled });
  }

  if (!settled.state || !settled.inside) {
    let label = "settled-not-reached";

    if (settled.state) {
      label = "settled-out-of-bounds";
    }

    throw new RevealFailure(label, call, { ...result, settled });
  }
}

/**
 * Presses `call.key` once and requires the target it names (`expect.active`, the surface's only
 * active option, or `expect.focus`, the focused element) inside `call.viewport`, grown by its
 * focus ring with `ring`, within 100ms of the keydown, then again once scrolling settles. With
 * `opens`, the key opens the list, which is placed before it reveals: the target must be inside
 * within 2s instead of 100ms. Every failure throws with its label and observations; nothing is
 * retried. A page that doesn't answer within 5s throws `Stalled`.
 */
export async function revealAfter(page, call) {
  let timer;
  const stalled = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Stalled(call)), 5000);
  });

  try {
    await Promise.race([revealSteps(page, call), stalled]);
  } finally {
    clearTimeout(timer);
  }
}

async function launch(engine) {
  if (engine === "chromium") {
    return chromium.launch();
  }

  if (engine === "firefox") {
    return firefox.launch();
  }

  assert.equal(engine, "webkit", `unknown engine ${engine}`);

  return webkit.launch(webkitLaunchOptions());
}

/** A page of its own for one scenario: the viewport and motion it names, hydrated and idle. */
export async function openPage(browser, base, errors, { width, height, reducedMotion = "reduce" }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion,
  });

  page.on("console", (message) => {
    const text = message.text();

    if (message.type() === "error" || /\bNG0\d+/.test(text)) {
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.querySelector("app-root") && !document.querySelector("[ngh]"),
  );

  return page;
}

async function main() {
  const [app, engine] = process.argv.slice(2);

  assert.ok(app && engine, "Usage: node tests/consumer-scrolling.mjs <app directory> <engine>");

  const { base, server, ready } = await startServer(app);
  let browser;

  try {
    await ready;
    browser = await launch(engine);
    await run(browser, base, engine);
  } catch (error) {
    if (error instanceof Stalled) {
      // Don't wait on the stalled page: end the browser and the server and fail now.
      console.error(error);
      server.kill();
      browser?.close().catch(() => {});
      process.exit(1);
    }

    throw error;
  } finally {
    await browser?.close();
    server.kill();
  }
}

async function run(browser, base, engine) {
  const errors = [];
  const scenario = async (name, setup, body) => {
    const page = await openPage(browser, base, errors, setup);
    let stalled = false;

    try {
      await body(page);
    } catch (error) {
      stalled = error instanceof Stalled;
      error.message = `${engine} · ${name}: ${error.message}`;
      throw error;
    } finally {
      // A stalled page may not answer close either: leave it to main's teardown instead of waiting.
      if (stalled) {
        page.close().catch(() => {});
      } else {
        await page.close();
      }
    }
  };

  // Angular renders by the next animation frame after a change.
  const rendered = (page) =>
    page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
  const activeId = (page) => page.evaluate(() => document.activeElement?.id);
  const isActive = (page, selector) =>
    page.evaluate((selector) => document.activeElement.matches(selector), selector);
  // Open: in the top layer and placed, fully opaque, or a shown <dialog> that's done animating.
  const shown = (page, id) =>
    page.waitForFunction((id) => {
      const surface = document.getElementById(id);

      if (surface instanceof HTMLDialogElement) {
        return surface.open && surface.getAnimations().length === 0;
      }

      return (
        surface.matches(":popover-open") &&
        surface.hasAttribute("data-present") &&
        getComputedStyle(surface).opacity === "1"
      );
    }, id);
  const hidden = (page, id) =>
    page.waitForFunction((id) => {
      const surface = document.getElementById(id);

      if (surface instanceof HTMLDialogElement) {
        return !surface.open;
      }

      return !surface.matches(":popover-open");
    }, id);
  const scrolls = (page, selector) =>
    page.evaluate((selector) => {
      const viewport = document.querySelector(selector);

      return viewport.scrollHeight > viewport.clientHeight;
    }, selector);
  const intoView = (page, id, block) =>
    page.evaluate(
      ([id, block]) => document.getElementById(id).scrollIntoView({ block }),
      [id, block],
    );
  // The Popovers sit near the page's middle, so the page gets room to scroll one to the top.
  const scrollToTop = (page, id) =>
    page.evaluate((id) => {
      document.body.style.paddingBottom = "100vh";
      document.getElementById(id).scrollIntoView({ block: "start" });
    }, id);
  const close = async (page, id) => {
    await page.keyboard.press("Escape");
    await hidden(page, id);
  };
  const countryIds = await (async () => {
    const page = await openPage(browser, base, errors, { width: 1280, height: 720 });
    const ids = await page.evaluate(() => {
      const ids = [];

      for (const option of document.querySelectorAll("#country-content [role=option]")) {
        ids.push(option.id.slice("country-".length));
      }

      return ids;
    });

    await page.close();

    return ids;
  })();

  assert.equal(countryIds.length, 40);
  assert.equal(countryIds[14], "gr");
  assert.equal(countryIds[38], "se");

  // 1. Thumbs: a long surface's ScrollArea overflows and its scrollbar shows while the viewport is
  // hovered; a short one doesn't, and its scrollbar stays hidden.
  const overflowLook = (page, root) =>
    page.evaluate((root) => {
      const area = document.querySelector(root);
      const scrollbar = area.querySelector(":scope > [data-slot=scroll-area-scrollbar]");

      return {
        overflowY: area.hasAttribute("data-overflow-y"),
        visible: scrollbar.hasAttribute("data-visible"),
        visibility: getComputedStyle(scrollbar).visibility,
      };
    }, root);
  const thumbShows = async (page, viewport, label) => {
    const root = viewport.replace(/ > \[data-slot=scroll-area-viewport\]$/, "");

    // Origami marks the overflow once it has measured the opened surface.
    await page.waitForSelector(`${root}[data-overflow-y]`, { timeout: 2000 }).catch(async () => {
      const look = (root) => {
        const area = document.querySelector(root);
        const viewport = area?.querySelector(":scope > [data-slot=scroll-area-viewport]");
        const scrollbar = area?.querySelector(":scope > [data-slot=scroll-area-scrollbar]");
        const thumb = scrollbar?.querySelector("[data-slot=scroll-area-thumb]");

        return {
          attributes: area && [...area.attributes].map((a) => a.name),
          scrollbar: scrollbar && [...scrollbar.attributes].map((a) => `${a.name}=${a.value}`),
          thumbStyle: thumb?.getAttribute("style"),
          scrollHeight: viewport?.scrollHeight,
          clientHeight: viewport?.clientHeight,
          display: viewport && getComputedStyle(viewport).display,
          overflowY: viewport && getComputedStyle(viewport).overflowY,
        };
      };
      const seen = await page.evaluate(look, root);

      // Origami also measures on pointer entry: tell a missing resize measurement from none at all.
      await page.hover(viewport, { position: { x: 20, y: 20 } });
      await page.waitForTimeout(300);

      const hovered = await page.evaluate(look, root);

      assert.fail(`${label} overflows: ${JSON.stringify({ seen, hovered })}`);
    });
    await page.hover(viewport, { position: { x: 20, y: 20 } });
    await page.waitForFunction(
      (root) =>
        document
          .querySelector(root)
          .querySelector(":scope > [data-slot=scroll-area-scrollbar]")
          .hasAttribute("data-visible"),
      root,
    );
  };
  const thumbHidden = async (page, viewport, label) => {
    const root = viewport.replace(/ > \[data-slot=scroll-area-viewport\]$/, "");

    await page.hover(viewport, { position: { x: 20, y: 10 } });
    await rendered(page);
    await page.waitForTimeout(150);

    const look = await overflowLook(page, root);

    assert.equal(look.overflowY, false, `${label} doesn't overflow`);
    assert.equal(look.visible, false, `${label}'s scrollbar isn't shown`);
    assert.equal(look.visibility, "hidden", `${label}'s scrollbar is hidden`);
  };

  await scenario("thumbs, lists and menus", { width: 1280, height: 720 }, async (page) => {
    await page.click("#country-trigger");
    await shown(page, "country-content");
    await thumbShows(page, contentViewport("country-content"), "Country");
    await close(page, "country-content");

    await page.focus("#country-search-input");
    await page.keyboard.press("ArrowDown");
    await shown(page, "country-search-content");
    await thumbShows(page, contentViewport("country-search-content"), "country search");
    await close(page, "country-search-content");

    await intoView(page, "scrolling-planet-input", "center");
    await page.focus("#scrolling-planet-input");
    await page.keyboard.press("ArrowDown");
    await shown(page, "scrolling-planet-content");
    await thumbShows(page, contentViewport("scrolling-planet-content"), "scrolling planet");
    await close(page, "scrolling-planet-content");

    await page.click("#menu-long-trigger");
    await shown(page, "menu-long-content");
    await thumbShows(page, contentViewport("menu-long-content"), "long menu");
    await close(page, "menu-long-content");

    await intoView(page, "status-trigger", "start");
    await page.click("#status-trigger");
    await shown(page, "status-content");
    await thumbHidden(page, contentViewport("status-content"), "Status");
    await close(page, "status-content");

    await intoView(page, "planet-input", "start");
    await page.focus("#planet-input");
    await page.keyboard.press("ArrowDown");
    await shown(page, "planet-content");
    await thumbHidden(page, contentViewport("planet-content"), "planet");
    await close(page, "planet-content");

    await page.click("#menu-row-trigger");
    await shown(page, "menu-row-content");
    await thumbHidden(page, contentViewport("menu-row-content"), "row menu");
    await close(page, "menu-row-content");

    await scrollToTop(page, "filters-trigger");
    await page.click("#filters-trigger");
    await shown(page, "filters-content");
    await thumbHidden(page, contentViewport("filters-content"), "filters Popover");
    await close(page, "filters-content");
  });

  await scenario("thumbs, short modals", { width: 1280, height: 720 }, async (page) => {
    await page.click("#dialog-trigger");
    await shown(page, "dialog-content");
    await thumbHidden(page, bodyViewport("dialog-content"), "edit Dialog");
    await close(page, "dialog-content");

    await page.click("#sheet-trigger");
    await shown(page, "sheet-content");
    await thumbHidden(page, bodyViewport("sheet-content"), "filters Sheet");
    await close(page, "sheet-content");
  });

  await scenario("thumbs, long panels", { width: 1280, height: 400 }, async (page) => {
    await scrollToTop(page, "notes-trigger");
    await page.click("#notes-trigger");
    await shown(page, "notes-content");
    await thumbShows(page, contentViewport("notes-content"), "notes Popover");
    await close(page, "notes-content");

    await scrollToTop(page, "scrollform-trigger");
    await page.click("#scrollform-trigger");
    await shown(page, "scrollform-content");
    await thumbShows(page, contentViewport("scrollform-content"), "scrollform Popover");
    await close(page, "scrollform-content");

    await page.click("#long-dialog-trigger");
    await shown(page, "long-dialog");
    await thumbShows(page, bodyViewport("long-dialog"), "long Dialog");
    await close(page, "long-dialog");

    await page.click("#long-sheet-trigger");
    await shown(page, "long-sheet");
    await thumbShows(page, bodyViewport("long-sheet"), "long Sheet");
    await close(page, "long-sheet");
  });

  // 2. Tab out of an open list or menu lands where it does on main: a scrolling list isn't a Tab
  // stop, so focus reaches the next control and the list closes.
  await scenario("Tab out of lists and menus", { width: 1280, height: 600 }, async (page) => {
    await intoView(page, "country-trigger", "center");
    await page.focus("#country-trigger");
    await page.keyboard.press("ArrowDown");
    await shown(page, "country-content");
    assert.equal(await scrolls(page, contentViewport("country-content")), true);
    await page.keyboard.press("Tab");
    await rendered(page);
    assert.equal(await activeId(page), "picks-save");
    assert.equal(await page.getAttribute("#country-trigger", "aria-expanded"), "false");

    await intoView(page, "scrolling-planet-input", "center");
    await page.focus("#scrolling-planet-input");
    await page.keyboard.press("ArrowDown");
    await shown(page, "scrolling-planet-content");
    assert.equal(await scrolls(page, contentViewport("scrolling-planet-content")), true);
    await page.keyboard.press("Tab");
    await rendered(page);
    assert.equal(await activeId(page), "after-scrolling-planet");

    await intoView(page, "planet-input", "start");
    await page.focus("#planet-input");
    await page.keyboard.press("ArrowDown");
    await shown(page, "planet-content");
    assert.equal(await scrolls(page, contentViewport("planet-content")), false);
    await page.keyboard.press("Tab");
    await rendered(page);
    assert.equal(await activeId(page), "country-trigger");

    await intoView(page, "country-search-input", "center");
    await page.focus("#country-search-input");
    await page.keyboard.press("ArrowDown");
    await shown(page, "country-search-content");
    assert.equal(await scrolls(page, contentViewport("country-search-content")), true);
    await page.keyboard.press("Tab");
    await rendered(page);
    assert.equal(await activeId(page), "after-country-search");

    await intoView(page, "menu-long-trigger", "center");
    await page.focus("#menu-long-trigger");
    await page.keyboard.press("ArrowDown");
    await shown(page, "menu-long-content");
    assert.equal(await scrolls(page, contentViewport("menu-long-content")), true);
    await page.keyboard.press("Tab");
    await rendered(page);
    await hidden(page, "menu-long-content");
    assert.equal(await activeId(page), "after-menu-long");

    await page.focus("#menu-long-trigger");
    await page.keyboard.press("ArrowDown");
    await shown(page, "menu-long-content");
    await page.keyboard.press("Shift+Tab");
    await rendered(page);
    await hidden(page, "menu-long-content");
    assert.equal(await activeId(page), "before-menu-long");
  });

  // 3. Popover Tab: an authored tabindex="0" lands on the text panel's scroller, which shows its
  // inset ring and scrolls from the keyboard; an interactive panel's first field is next after
  // the Trigger, except in Firefox, which stops on its scroller first, as it did on the panel.
  await scenario("Popover Tab, text", { width: 1280, height: 600 }, async (page) => {
    await scrollToTop(page, "notes-trigger");
    await page.click("#notes-trigger");
    await shown(page, "notes-content");

    const notes = await page.evaluate((selector) => {
      const content = document.getElementById("notes-content");
      const viewport = document.querySelector(selector);

      return {
        height: content.getBoundingClientRect().height,
        available: parseFloat(getComputedStyle(content).getPropertyValue("--og-available-height")),
        scrolls: viewport.scrollHeight > viewport.clientHeight,
      };
    }, contentViewport("notes-content"));

    assert.ok(notes.scrolls, "the notes scroll");
    assert.ok(
      notes.height <= notes.available - 8 + 0.5,
      `notes ${notes.height} of ${notes.available}`,
    );
    await page.keyboard.press("Tab");
    assert.ok(await isActive(page, contentViewport("notes-content")), "the notes scroller");
    assert.deepEqual(
      await page.evaluate((selector) => {
        const style = getComputedStyle(document.querySelector(selector));

        return {
          style: style.outlineStyle,
          width: style.outlineWidth,
          offset: style.outlineOffset,
          color: style.outlineColor,
        };
      }, contentViewport("notes-content")),
      { style: "solid", width: "2px", offset: "-2px", color: "rgb(76, 196, 111)" },
    );
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      (selector) => document.querySelector(selector).scrollTop > 0,
      contentViewport("notes-content"),
    );
    await close(page, "notes-content");
  });

  await scenario("Popover Tab, controls", { width: 1280, height: 400 }, async (page) => {
    await scrollToTop(page, "scrollform-trigger");
    await page.click("#scrollform-trigger");
    await shown(page, "scrollform-content");
    assert.equal(await scrolls(page, contentViewport("scrollform-content")), true);
    await page.keyboard.press("Tab");

    if (engine === "firefox") {
      assert.ok(
        await isActive(page, contentViewport("scrollform-content")),
        "Firefox stops on the scroller",
      );
      await page.keyboard.press("Tab");
    }

    assert.equal(await activeId(page), "scrollform-0");
    await close(page, "scrollform-content");
  });

  // 4. Initial focus: a long Body's scroller doesn't take a dialog's initial focus.
  await scenario("initial focus, long", { width: 1280, height: 400 }, async (page) => {
    await page.click("#long-dialog-trigger");
    await shown(page, "long-dialog");
    assert.equal(await activeId(page), "long-dialog-0");
    await close(page, "long-dialog");

    await page.click("#long-sheet-trigger");
    await shown(page, "long-sheet");
    assert.equal(await activeId(page), "long-sheet-0");
    await close(page, "long-sheet");

    await page.click("#steps-trigger");
    await shown(page, "steps-dialog");
    assert.ok(
      await page.evaluate(
        () => document.activeElement === document.querySelector("#steps-body input"),
      ),
      "the steps dialog opens on its first input",
    );
    await close(page, "steps-dialog");
  });

  await scenario("initial focus, autofocus", { width: 1280, height: 720 }, async (page) => {
    await page.click("#dialog-trigger");
    await shown(page, "dialog-content");
    assert.equal(await activeId(page), "dialog-reference");
    await close(page, "dialog-content");
  });

  // 5. List reveal: each key's expected option is the list's only active option and inside its
  // viewport, crossing both edges: within 100ms in the open list, and once placed for the key that
  // opens it.
  await scenario("list reveal", { width: 1280, height: 720 }, async (page) => {
    const select = (index, key, { opens = false } = {}) =>
      revealAfter(page, {
        key,
        opens,
        expect: { active: `#country-${countryIds[index]}` },
        surface: "#country-content",
        viewport: contentViewport("country-content"),
      });

    await intoView(page, "country-trigger", "center");
    await page.focus("#country-trigger");
    await select(14, "ArrowDown", { opens: true });

    for (let index = 15; index <= 26; index += 1) {
      await select(index, "ArrowDown");
    }

    for (let index = 25; index >= 14; index -= 1) {
      await select(index, "ArrowUp");
    }

    await select(39, "End");
    await select(0, "Home");
    await close(page, "country-content");

    const search = (index, key, { opens = false } = {}) =>
      revealAfter(page, {
        key,
        opens,
        expect: { active: `#country-search-${countryIds[index]}` },
        surface: "#country-search-content",
        viewport: contentViewport("country-search-content"),
      });

    await intoView(page, "country-search-input", "center");
    await page.focus("#country-search-input");
    await search(38, "ArrowDown", { opens: true });

    for (const index of [28, 18, 8]) {
      await search(index, "PageUp");
    }

    for (let index = 7; index >= 0; index -= 1) {
      await search(index, "ArrowUp");
    }

    for (let index = 1; index <= 12; index += 1) {
      await search(index, "ArrowDown");
    }

    for (const index of [22, 32]) {
      await search(index, "PageDown");
    }

    await close(page, "country-search-content");
  });

  // 6. Edge focus reveal: each focused control and its ring are inside the scroller within 100ms.
  const walk = async (page, prefix, count, surface, viewport) => {
    for (let index = 1; index < count; index += 1) {
      await revealAfter(page, {
        key: "Tab",
        expect: { focus: `#${prefix}-${index}` },
        surface,
        viewport,
        ring: true,
      });
    }

    for (let index = count - 2; index >= 0; index -= 1) {
      await revealAfter(page, {
        key: "Shift+Tab",
        expect: { focus: `#${prefix}-${index}` },
        surface,
        viewport,
        ring: true,
      });
    }
  };

  await scenario("edge focus reveal, modals", { width: 1280, height: 400 }, async (page) => {
    await page.click("#long-dialog-trigger");
    await shown(page, "long-dialog");
    assert.equal(await activeId(page), "long-dialog-0");
    await walk(page, "long-dialog", 20, "#long-dialog", bodyViewport("long-dialog"));
    await close(page, "long-dialog");

    await page.click("#long-sheet-trigger");
    await shown(page, "long-sheet");
    assert.equal(await activeId(page), "long-sheet-0");
    await walk(page, "long-sheet", 20, "#long-sheet", bodyViewport("long-sheet"));
    await close(page, "long-sheet");
  });

  await scenario("edge focus reveal, Popover", { width: 1280, height: 400 }, async (page) => {
    const viewport = contentViewport("scrollform-content");

    await scrollToTop(page, "scrollform-trigger");
    await page.click("#scrollform-trigger");
    await shown(page, "scrollform-content");

    if (engine === "firefox") {
      await page.keyboard.press("Tab");
      assert.ok(await isActive(page, viewport), "Firefox stops on the scroller");
    }

    await revealAfter(page, {
      key: "Tab",
      expect: { focus: "#scrollform-0" },
      surface: "#scrollform-content",
      viewport,
      ring: true,
    });
    await walk(page, "scrollform", 8, "#scrollform-content", viewport);
    await close(page, "scrollform-content");
  });

  await scenario("edge focus reveal, Menu", { width: 1280, height: 400 }, async (page) => {
    const call = (key, id) => ({
      key,
      expect: { focus: `#${id}` },
      surface: "#menu-long-content",
      viewport: contentViewport("menu-long-content"),
      ring: true,
    });

    await intoView(page, "menu-long-trigger", "center");
    await page.focus("#menu-long-trigger");
    await revealAfter(page, { ...call("ArrowDown", "menu-long-0"), opens: true });
    await revealAfter(page, call("End", "menu-long-39"));
    await revealAfter(page, call("Home", "menu-long-0"));
    await close(page, "menu-long-content");
  });

  // 7. Caps at 844×390: the outer list and Popover heights are main's, and the list's scroller is
  // exactly its padding box.
  await scenario("caps", { width: 844, height: 390 }, async (page) => {
    const listLook = (id) =>
      page.evaluate(
        ([id, selector]) => {
          const content = document.getElementById(id);
          const viewport = document.querySelector(selector);
          const outer = content.getBoundingClientRect();
          const inner = viewport.getBoundingClientRect();
          const padding = {
            top: outer.top + content.clientTop,
            left: outer.left + content.clientLeft,
            width: content.clientWidth,
            height: content.clientHeight,
          };
          const client = {
            top: inner.top + viewport.clientTop,
            left: inner.left + viewport.clientLeft,
            width: viewport.clientWidth,
            height: viewport.clientHeight,
          };

          return {
            height: outer.height,
            available: parseFloat(
              getComputedStyle(content).getPropertyValue("--og-available-height"),
            ),
            scrolls: viewport.scrollHeight > viewport.clientHeight,
            padding,
            client,
            scrollY: window.scrollY,
          };
        },
        [id, contentViewport(id)],
      );
    const listCapped = async (id, label) => {
      const look = await listLook(id);

      assert.ok(look.scrolls, `${label} scrolls`);
      assert.ok(
        Math.abs(look.height - Math.min(320, look.available - 8)) <= 1,
        `${label} height ${look.height} of ${look.available}`,
      );

      for (const edge of ["top", "left", "width", "height"]) {
        assert.ok(
          Math.abs(look.client[edge] - look.padding[edge]) <= 0.5,
          `${label} viewport ${edge} ${look.client[edge]} vs padding box ${look.padding[edge]}`,
        );
      }

      return look;
    };

    await intoView(page, "country-trigger", "center");
    await page.focus("#country-trigger");

    const scrollBefore = await page.evaluate(() => window.scrollY);

    await page.keyboard.press("ArrowDown");
    await shown(page, "country-content");

    const country = await listCapped("country-content", "Country");

    assert.equal(country.scrollY, scrollBefore, "opening Country doesn't scroll the page");
    await close(page, "country-content");

    await intoView(page, "country-search-input", "center");
    await page.focus("#country-search-input");
    await page.keyboard.press("ArrowDown");
    await shown(page, "country-search-content");
    await listCapped("country-search-content", "country search");
    await close(page, "country-search-content");

    await intoView(page, "scrolling-planet-input", "center");
    await page.focus("#scrolling-planet-input");
    await page.keyboard.press("ArrowDown");
    await shown(page, "scrolling-planet-content");
    assert.ok(
      Math.abs((await listLook("scrolling-planet-content")).height - 120) <= 0.5,
      "the scrolling planet's authored 120px cap",
    );
    await close(page, "scrolling-planet-content");

    await scrollToTop(page, "notes-trigger");
    await page.click("#notes-trigger");
    await shown(page, "notes-content");

    const notes = await listLook("notes-content");

    assert.ok(notes.scrolls, "the notes scroll");
    assert.ok(
      Math.abs(notes.height - (notes.available - 8)) <= 1,
      `notes height ${notes.height} of ${notes.available}`,
    );
    await close(page, "notes-content");

    // The host's own class caps the panel, and the scroller fills it: no second cap inside.
    await scrollToTop(page, "capped-notes-trigger");
    await page.click("#capped-notes-trigger");
    await shown(page, "capped-notes-content");

    const capped = await listLook("capped-notes-content");

    assert.ok(capped.scrolls, "the capped notes scroll");
    assert.ok(Math.abs(capped.height - 192) <= 0.5, `capped notes height ${capped.height}`);
    assert.ok(
      Math.abs(capped.client.height - capped.padding.height) <= 0.5,
      `capped notes scroller ${capped.client.height} fills ${capped.padding.height}`,
    );
    await close(page, "capped-notes-content");

    // A host class above the default cap: the panel grows past the room left, and its scroller
    // with it, rather than stopping at a cap of its own.
    await scrollToTop(page, "uncapped-notes-trigger");
    await page.click("#uncapped-notes-trigger");
    await shown(page, "uncapped-notes-content");

    const uncapped = await listLook("uncapped-notes-content");

    assert.ok(
      uncapped.height > uncapped.available,
      `uncapped notes ${uncapped.height} grow past the room left, ${uncapped.available}`,
    );
    assert.ok(
      Math.abs(uncapped.client.height - uncapped.padding.height) <= 0.5,
      `uncapped notes scroller ${uncapped.client.height} fills ${uncapped.padding.height}`,
    );
    assert.equal(uncapped.scrolls, false, "the uncapped notes don't scroll");
    await close(page, "uncapped-notes-content");
  });

  // 8. Modal page lock: wheels over a long Body's rail at its end leave the page where it was.
  await scenario("modal page lock", { width: 1280, height: 400 }, async (page) => {
    const wheelOverRail = async (trigger, id, end, deltaY) => {
      await page.evaluate(() => window.scrollTo(0, 400));
      assert.equal(await page.evaluate(() => window.scrollY), 400);
      // A script click: page.click() would scroll the trigger into view.
      await page.evaluate((trigger) => document.getElementById(trigger).click(), trigger);
      await shown(page, id);

      const viewport = bodyViewport(id);

      await page.evaluate(
        ([selector, end]) => {
          const element = document.querySelector(selector);

          element.scrollTop = end === "bottom" ? element.scrollHeight : 0;
        },
        [viewport, end],
      );
      await page.hover(viewport);

      const root = viewport.replace(/ > \[data-slot=scroll-area-viewport\]$/, "");
      const rail = `${root} > [data-slot=scroll-area-scrollbar]`;

      await page.waitForSelector(`${rail}[data-visible]`);

      const point = await page.evaluate((rail) => {
        const scrollbar = document.querySelector(rail);
        const rect = scrollbar.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        return { x, y, hit: document.elementFromPoint(x, y)?.closest(rail) === scrollbar };
      }, rail);

      assert.ok(point.hit, `${id}'s rail is under the pointer`);
      await page.mouse.move(point.x, point.y);

      for (let wheel = 0; wheel < 3; wheel += 1) {
        await page.mouse.wheel(0, deltaY);
      }

      await page.waitForTimeout(160);
      assert.equal(await page.evaluate(() => window.scrollY), 400, `${id} keeps the page`);
      await close(page, id);
    };

    await wheelOverRail("long-dialog-trigger", "long-dialog", "bottom", 650);
    await wheelOverRail("long-sheet-trigger", "long-sheet", "top", -650);
  });

  // Wide content in a panel: its own horizontal ScrollArea scrolls sideways under a sideways wheel
  // to the table's right edge, while the panel's text still wraps to the panel's width.
  await scenario("wide content", { width: 1280, height: 720 }, async (page) => {
    await scrollToTop(page, "wide-trigger");
    await page.click("#wide-trigger");
    await shown(page, "wide-content");

    const horizontal = "#wide-area > [data-slot=scroll-area-viewport]";
    const look = () =>
      page.evaluate((selector) => {
        const viewport = document.querySelector(selector);
        const box = viewport.getBoundingClientRect();
        const table = document.getElementById("wide-table").getBoundingClientRect();
        const text = document.getElementById("wide-text");
        const panel = document.querySelector(
          "#wide-content > [data-slot=scroll-area] > [data-slot=scroll-area-viewport]",
        );

        return {
          scrollLeft: viewport.scrollLeft,
          maxScrollLeft: viewport.scrollWidth - viewport.clientWidth,
          tableRight: table.right,
          clientRight: box.left + viewport.clientLeft + viewport.clientWidth,
          textWidth: text.getBoundingClientRect().width,
          textScrollWidth: text.scrollWidth,
          panelWidth: panel.clientWidth,
          panelScrollWidth: panel.scrollWidth,
        };
      }, horizontal);

    const before = await look();

    assert.ok(before.maxScrollLeft > 0, `the table overflows sideways: ${JSON.stringify(before)}`);
    assert.ok(before.textScrollWidth <= Math.ceil(before.textWidth), "the text wraps");
    assert.ok(
      before.panelScrollWidth <= before.panelWidth,
      "the panel itself doesn't scroll sideways",
    );

    await page.hover(horizontal, { position: { x: 40, y: 10 } });

    for (let step = 0; step < 20; step += 1) {
      const now = await look();

      if (now.maxScrollLeft - now.scrollLeft <= 0.5) {
        break;
      }

      await page.mouse.wheel(200, 0);
      await rendered(page);
    }

    const after = await look();

    assert.ok(
      after.maxScrollLeft - after.scrollLeft <= 0.5,
      `the wheel reaches the end: ${JSON.stringify(after)}`,
    );
    assert.ok(after.tableRight <= after.clientRight + 0.5, "the table's right edge is in view");
    await close(page, "wide-content");
  });

  // 9. Closed surfaces keep the browser's display: none.
  await scenario("closed surfaces", { width: 1280, height: 720 }, async (page) => {
    const displays = await page.evaluate(() => {
      const result = {};

      for (const id of [
        "status-content",
        "country-content",
        "planet-content",
        "scrolling-planet-content",
        "country-search-content",
        "menu-row-content",
        "menu-long-content",
        "menu-long-sub-content",
        "notes-content",
        "scrollform-content",
        "wide-content",
        "capped-notes-content",
        "uncapped-notes-content",
        "filters-content",
        "long-dialog",
        "long-sheet",
      ]) {
        result[id] = getComputedStyle(document.getElementById(id)).display;
      }

      return result;
    });

    for (const [id, display] of Object.entries(displays)) {
      assert.equal(display, "none", `closed ${id}`);
    }
  });

  assert.deepEqual(errors, [], "page or hydration errors");
  console.log(`${engine} scrolling suite passed.`);
}

if (import.meta.main) {
  await main();
}
