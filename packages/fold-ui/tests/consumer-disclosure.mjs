// Accordion's and Collapsible's motion in one engine, against the consumer check's production build
// (consumer.mjs): panels grow and fade in, shrink and fade out, reverse from where they are, settle
// to the right `hidden` with no phase left behind, snap under reduced motion; native find-in-page
// reveals (ID and text fragments) open the right item; the form recipe opens the section with
// errors and focuses its first control; Tab during motion is logged. Each scenario starts from a
// fresh hydrated page, and any page or hydration error fails the run. Expectations derive from the
// engine's capabilities and the approved entrance option (D3).
//
// Usage: node tests/consumer-disclosure.mjs <app directory> <chromium|firefox|webkit>
import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";
import { webkitLaunchOptions } from "../../origami-ui/tests/acceptance/webkit-launch.ts";
import { openPage } from "./consumer-scrolling.mjs";
import { startServer } from "./consumer-server.mjs";

// The approved entrance: every entering panel starts from `@starting-style` ("broad"), not only
// opted-out ones ("scoped"). components/disclosure/disclosure.ts encodes it.
const D3 = "broad";
const VIEWPORT = { width: 1184, height: 768 };
// Long enough for a 180 ms transition, Presence's settle and a reversal after 60 ms.
const TRACE = 700;
const SETTLE_DEADLINE = 400;
const REVERSE_AFTER = 60;
// How far a panel's share of its open height may sit outside its opacity around one frame.
const LOCKSTEP = 0.05;

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

// Installed in the page before the action. Samples every watched panel on each frame for `TRACE`
// ms, records the action's time (the first trusted or scripted click or keydown) and, when asked,
// clicks `reverse` on the first frame at or after `REVERSE_AFTER` ms from the action at which the
// first panel is mid-motion. Each sample also lists the panel's running opacity transitions with
// their start and end values, which frame sampling can miss. After a reversal click, the first
// panel's height is also read where its `data-expanded` flips: the read forces the style change
// that starts the new transitions, so it's the track's start (`boundary`). Its keyframes can't
// give that start: Chromium reports the current value in both.
function armTrace({ ids, duration, reverse, reverseAfter }) {
  const trace = {
    frames: [],
    actionAt: null,
    reversedAt: null,
    boundary: null,
    done: false,
    focus: [],
  };
  const start = performance.now();
  const fadeIds = new WeakMap();
  let nextFade = 0;
  const markAction = () => {
    if (trace.actionAt === null) {
      trace.actionAt = performance.now() - start;
    }
  };

  document.addEventListener("click", markAction, { capture: true });
  document.addEventListener("keydown", markAction, { capture: true });
  document.addEventListener(
    "focusin",
    (event) => {
      const panel = document.getElementById(ids[0]);
      let phase = null;

      if (panel) {
        phase = phaseOf(panel);
      }

      trace.focus.push({
        at: performance.now() - start,
        id: event.target.id || event.target.tagName,
        phase,
      });
    },
    { capture: true },
  );

  function phaseOf(panel) {
    for (const marker of ["entering", "leaving", "present"]) {
      if (panel.hasAttribute(`data-${marker}`)) {
        return marker;
      }
    }

    return "none";
  }

  function fadesOf(panel) {
    const fades = [];

    for (const animation of panel.getAnimations()) {
      if (animation.transitionProperty !== "opacity") {
        continue;
      }

      if (!fadeIds.has(animation)) {
        nextFade++;
        fadeIds.set(animation, nextFade);
      }

      const keyframes = animation.effect.getKeyframes();

      fades.push({
        id: fadeIds.get(animation),
        from: parseFloat(keyframes[0].opacity),
        to: parseFloat(keyframes[keyframes.length - 1].opacity),
      });
    }

    return fades;
  }

  const sample = () => {
    const now = performance.now() - start;
    const frame = { at: now, panels: {} };

    for (const id of ids) {
      const panel = document.getElementById(id);

      if (!panel) {
        frame.panels[id] = null;
        continue;
      }

      frame.panels[id] = {
        height: panel.getBoundingClientRect().height,
        opacity: parseFloat(getComputedStyle(panel).opacity),
        hidden: panel.getAttribute("hidden"),
        expanded: panel.hasAttribute("data-expanded"),
        phase: phaseOf(panel),
        animations: panel.getAnimations().length,
        fades: fadesOf(panel),
      };
    }

    trace.frames.push(frame);

    if (reverse && trace.actionAt !== null && trace.reversedAt === null) {
      // Mid-motion: a stalled engine can reach 60 ms before the panel has moved at all.
      const moving = frame.panels[ids[0]];
      const midMotion =
        moving !== null &&
        moving.phase !== "present" &&
        moving.phase !== "none" &&
        moving.opacity > 0.01 &&
        moving.opacity < 0.99;

      if (now - trace.actionAt >= reverseAfter && midMotion) {
        const panel = document.getElementById(ids[0]);
        const flip = new MutationObserver(() => {
          flip.disconnect();
          trace.boundary = {
            at: performance.now() - start,
            height: panel.getBoundingClientRect().height,
          };
        });

        flip.observe(panel, { attributeFilter: ["data-expanded"] });
        trace.reversedAt = now;
        document.querySelector(reverse).click();
      }
    }

    if (now < duration) {
      requestAnimationFrame(sample);
    } else {
      trace.done = true;
    }
  };

  window.__disclosureTrace = trace;
  requestAnimationFrame(sample);
}

async function traced(page, { ids, duration = TRACE, reverse = null }, action) {
  await page.evaluate(armTrace, { ids, duration, reverse, reverseAfter: REVERSE_AFTER });
  await action();
  await page.waitForFunction(() => window.__disclosureTrace.done, null, { timeout: 5000 });

  return page.evaluate(() => window.__disclosureTrace);
}

/** One panel's samples from the action on, with the frames' times. */
function series(trace, id) {
  const result = [];

  for (const frame of trace.frames) {
    if (frame.at >= trace.actionAt && frame.panels[id]) {
      result.push({ at: frame.at - trace.actionAt, ...frame.panels[id] });
    }
  }

  return result;
}

function describe(samples) {
  const parts = [];

  for (const sample of samples) {
    let part = `${sample.at.toFixed(0)}ms ${sample.height.toFixed(1)}px o${sample.opacity.toFixed(2)} ${sample.phase}`;

    if (sample.hidden !== null) {
      part += ` hidden=${sample.hidden}`;
    }

    parts.push(part);
  }

  return parts.join(" | ");
}

/** Every opacity transition the samples saw, once each. */
function fadesIn(samples) {
  const fades = new Map();

  for (const sample of samples) {
    for (const fade of sample.fades) {
      fades.set(fade.id, fade);
    }
  }

  return [...fades.values()];
}

/**
 * A fade between the closed and open opacity: one opacity transition from `from` to `to`, sampled
 * at a strictly intermediate value, with opacity moving only toward `to`.
 */
function assertFade(samples, from, to, evidence) {
  const fades = fadesIn(samples);

  assert.equal(fades.length, 1, `${evidence} (opacity transitions ${JSON.stringify(fades)})`);
  assert.ok(Math.abs(fades[0].from - from) < 0.01, `${evidence} (fade starts at ${fades[0].from})`);
  assert.equal(fades[0].to, to, `${evidence} (fade ends at ${fades[0].to})`);
  assert.ok(
    samples.some((sample) => sample.opacity > 0.01 && sample.opacity < 0.99),
    `${evidence} (no intermediate opacity)`,
  );

  for (let index = 1; index < samples.length; index++) {
    const step = samples[index].opacity - samples[index - 1].opacity;

    if (to > from) {
      assert.ok(step >= -0.005, `${evidence} (faded back)`);
    } else {
      assert.ok(step <= 0.005, `${evidence} (faded back)`);
    }
  }
}

/**
 * Opened and interpolated: heights rise monotonically through a strictly intermediate value to
 * the settled height, opacity fades from 0 to 1, the host animated, and it ends present with no
 * phase marker left.
 */
function assertAnimatedOpen(samples, label) {
  const last = samples[samples.length - 1];
  const evidence = `${label}: ${describe(samples)}`;

  assert.ok(last.height > 1, `${evidence} (no settled height)`);
  assert.equal(last.hidden, null, evidence);
  assert.equal(last.phase, "present", evidence);
  assert.equal(last.opacity, 1, evidence);
  assert.ok(
    samples.some((sample) => sample.height > 0.5 && sample.height < last.height - 0.5),
    `${evidence} (no intermediate height)`,
  );
  assertFade(samples, 0, 1, evidence);
  assert.ok(
    samples.some((sample) => sample.animations > 0),
    `${evidence} (no host animation)`,
  );

  for (let index = 1; index < samples.length; index++) {
    assert.ok(samples[index].height >= samples[index - 1].height - 0.5, `${evidence} (shrank)`);
  }
}

/** Opened without motion: no effect on any frame, fully opaque whenever it's shown. */
function assertSnapOpen(samples, label) {
  const last = samples[samples.length - 1];
  const evidence = `${label}: ${describe(samples)}`;

  assert.equal(last.phase, "present", evidence);
  assert.equal(last.hidden, null, evidence);
  assert.ok(last.height > 1, `${evidence} (no settled height)`);

  for (const sample of samples) {
    assert.equal(sample.animations, 0, `${evidence} (animated)`);

    if (sample.hidden === null) {
      assert.equal(sample.opacity, 1, `${evidence} (faded)`);
    }
  }
}

/**
 * Closed and interpolated: heights fall monotonically through an intermediate value, opacity
 * fades from 1 to 0, the host animated, and within the deadline the panel is `hidden` as expected,
 * 0 px tall and transparent, with no phase marker.
 */
function assertAnimatedClose(samples, hidden, label) {
  const first = samples[0];
  const evidence = `${label}: ${describe(samples)}`;
  const settled = samples.find((sample) => sample.hidden !== null);

  assert.ok(first.height > 1, `${evidence} (wasn't open)`);
  assert.ok(
    samples.some((sample) => sample.height > 0.5 && sample.height < first.height - 0.5),
    `${evidence} (no intermediate height)`,
  );
  assertFade(samples, 1, 0, evidence);
  assert.ok(
    samples.some((sample) => sample.animations > 0),
    `${evidence} (no host animation)`,
  );
  assertSettledClosed(samples, hidden, label);
  assert.equal(samples[samples.length - 1].opacity, 0, `${evidence} (settled opacity)`);
  assert.ok(settled.at <= SETTLE_DEADLINE, `${evidence} (hidden after ${settled.at} ms)`);

  for (let index = 1; index < samples.length; index++) {
    assert.ok(samples[index].height <= samples[index - 1].height + 0.5, `${evidence} (grew)`);
  }
}

function assertSettledClosed(samples, hidden, label) {
  const last = samples[samples.length - 1];
  const evidence = `${label}: ${describe(samples)}`;

  assert.equal(last.hidden, hidden, evidence);
  assert.equal(last.phase, "none", evidence);
  assert.equal(last.height, 0, evidence);
}

/**
 * How far `key` may still move in the old direction between the last frame before the turn and
 * `at`: the old motion eases out, so it moves no faster than over its last step before the turn,
 * with half again for frame timing.
 */
function oldMotionSlack(before, key, at) {
  const [earlier, last] = before.slice(-2);
  const rate = Math.abs(last[key] - earlier[key]) / (last.at - earlier.at);

  return rate * (at - last.at) * 1.5;
}

/**
 * A reversal turns from where the panel is. Before the turn it never reaches the endpoint it was
 * heading to. The turn is the first frame showing a new fade toward the other endpoint: it starts
 * at an intermediate opacity no further along than the frame before (WebKit's start value can
 * read 0.02 past the sampled one, so that bound allows 0.05), and the panel isn't at the endpoint
 * it turned away from. Up to and including the turn, opacity (the fade's start too) moves back no
 * further than the old motion could in the time since the last frame before the turn, and on
 * every frame height stays in step with opacity, so neither restarts from a point behind where it
 * was. The track's new transition starts where `data-expanded` flips (the trace's boundary): with
 * the same bounds as the fade's start, no further along than the last frame before the turn and
 * back no further than the old motion could go by then, so the track can't jump toward the new
 * endpoint while the fade stays continuous. From the turn on they move only toward the new
 * endpoint. `opening` is the direction after the turn.
 */
function assertReversal(trace, samples, full, opening, label) {
  const turnAt = trace.reversedAt - trace.actionAt;
  const evidence = `${label} (turned at ${turnAt.toFixed(0)} ms): ${describe(samples)}`;
  const before = samples.filter((sample) => sample.at <= turnAt);
  const after = samples.filter((sample) => sample.at > turnAt);

  assert.ok(before.length > 1 && after.length > 0, evidence);

  for (const sample of before) {
    if (opening) {
      assert.ok(sample.height > 0.5, `${evidence} (closed before turning)`);
    } else {
      assert.ok(sample.height < full - 0.5, `${evidence} (fully open before turning)`);
    }
  }

  if (opening) {
    assert.ok(after[0].height < full - 0.5, `${evidence} (snapped open)`);
  } else {
    assert.ok(after[0].height > 0.5, `${evidence} (snapped closed)`);
  }

  const target = opening ? 1 : 0;
  const earlier = new Set();

  for (const fade of fadesIn(before)) {
    earlier.add(fade.id);
  }

  let turnIndex = -1;
  let fade = null;

  for (const [index, sample] of after.entries()) {
    fade = sample.fades.find((candidate) => !earlier.has(candidate.id) && candidate.to === target);

    if (fade) {
      turnIndex = index;
      break;
    }
  }

  assert.ok(fade, `${evidence} (no fade toward ${target} after the turn)`);

  const turn = after[turnIndex];
  const previous = turnIndex === 0 ? before[before.length - 1] : after[turnIndex - 1];
  const turnEvidence = `${evidence} (turn fade ${fade.from} → ${fade.to} at ${turn.at.toFixed(0)} ms, previous o${previous.opacity.toFixed(3)})`;

  assert.ok(fade.from > 0.01 && fade.from < 0.99, `${turnEvidence} (restarted from an endpoint)`);

  if (opening) {
    assert.ok(fade.from <= previous.opacity + 0.05, `${turnEvidence} (jumped ahead)`);
    assert.ok(turn.height > 0.5, `${turnEvidence} (restarted closed)`);
  } else {
    assert.ok(fade.from >= previous.opacity - 0.05, `${turnEvidence} (jumped ahead)`);
    assert.ok(turn.height < full - 0.5, `${turnEvidence} (restarted open)`);
  }

  // The track at the boundary, as a share of the open height. Forward is toward the new endpoint.
  assert.ok(trace.boundary, `${turnEvidence} (no data-expanded flip after the reversal click)`);

  const last = before[before.length - 1];
  const boundaryAt = trace.boundary.at - trace.actionAt;
  const trackStart = trace.boundary.height / full;
  const trackAhead = (trackStart - last.height / full) * (opening ? 1 : -1);
  const trackSlack = oldMotionSlack(before, "height", boundaryAt) / full + 0.01;
  const trackEvidence =
    `${turnEvidence} (track starts at ${trackStart.toFixed(3)} of open at ` +
    `${boundaryAt.toFixed(0)} ms, ${trackAhead.toFixed(3)} ahead of the last frame before the turn`;

  assert.ok(trackAhead <= 0.05, `${trackEvidence}: jumped ahead)`);
  assert.ok(
    -trackAhead <= trackSlack,
    `${trackEvidence}, slack ${trackSlack.toFixed(3)}: jumped back)`,
  );

  // Height rides the same transition timing as opacity (the track eases between 0fr and 1fr), so
  // its share of the open height matches the opacity. Around a turn one can run a frame ahead of
  // the other (Chromium's fade, Firefox's track), so the share must lie within the opacities of
  // this frame and its neighbours. A height that restarts on its own, with the fade continuous,
  // breaks that, whatever the frame spacing.
  let drift = 0;

  for (const [index, sample] of samples.entries()) {
    const share = sample.height / full;
    const near = samples.slice(Math.max(index - 1, 0), index + 2).map((other) => other.opacity);
    const low = Math.min(...near);
    const high = Math.max(...near);
    const apart = Math.max(low - share, share - high, 0);

    assert.ok(
      apart <= LOCKSTEP,
      `${evidence} (at ${sample.at.toFixed(0)} ms height is ${share.toFixed(3)} of open, ` +
        `opacity ${low.toFixed(3)}–${high.toFixed(3)}: moved apart)`,
    );
    drift = Math.max(drift, apart);
  }

  // Back toward the old endpoint is positive: through the turn, opacity and the new fade's start
  // go back no further than the old motion could have gone since the last frame before it.
  const back = (value) => (opening ? last.opacity - value : value - last.opacity);

  for (const sample of after.slice(0, turnIndex + 1)) {
    const slack = oldMotionSlack(before, "opacity", sample.at) + 0.01;

    assert.ok(
      back(sample.opacity) <= slack,
      `${turnEvidence} (at ${sample.at.toFixed(0)} ms opacity ${back(sample.opacity).toFixed(3)} ` +
        `back, slack ${slack.toFixed(3)}: jumped back)`,
    );
  }

  const fadeSlack = oldMotionSlack(before, "opacity", turn.at) + 0.01;

  assert.ok(
    back(fade.from) <= fadeSlack,
    `${turnEvidence} (fade starts ${back(fade.from).toFixed(3)} back, slack ` +
      `${fadeSlack.toFixed(3)}: jumped back)`,
  );

  for (let index = turnIndex + 1; index < after.length; index++) {
    const step = after[index].height - after[index - 1].height;
    const fadeStep = after[index].opacity - after[index - 1].opacity;

    if (opening) {
      assert.ok(step >= -0.5 && fadeStep >= -0.005, `${turnEvidence} (closed again after turning)`);
    } else {
      assert.ok(step <= 0.5 && fadeStep <= 0.005, `${turnEvidence} (opened again after turning)`);
    }
  }

  return (
    `turn at frame ${turnIndex + 1} after the click, height share vs opacity within ` +
    `${drift.toFixed(3)}, fade starts ${back(fade.from).toFixed(3)} back of ${fadeSlack.toFixed(3)}, ` +
    `track starts ${(-trackAhead).toFixed(3)} back of ${trackSlack.toFixed(3)}`
  );
}

async function main() {
  const [app, engine] = process.argv.slice(2);

  assert.ok(app && engine, "Usage: node tests/consumer-disclosure.mjs <app directory> <engine>");

  const { base, server, ready } = await startServer(app);
  let browser;

  try {
    await ready;
    browser = await launch(engine);
    await run(browser, base, engine);
  } finally {
    await browser?.close();
    server.kill();
  }
}

async function run(browser, base, engine) {
  const errors = [];
  const scenario = async (name, setup, body) => {
    const page = await openPage(browser, base, errors, {
      ...VIEWPORT,
      reducedMotion: "no-preference",
      ...setup,
    });

    try {
      await body(page);
    } catch (error) {
      error.message = `${engine} · ${name}: ${error.message}`;
      throw error;
    } finally {
      await page.close();
    }
  };
  const text = (page, id) =>
    page.evaluate((id) => document.getElementById(id).textContent.trim(), id);
  const attribute = (page, id, name) =>
    page.evaluate(([id, name]) => document.getElementById(id).getAttribute(name), [id, name]);
  const settledOpen = (page, id) =>
    page.waitForFunction((id) => {
      const panel = document.getElementById(id);

      return panel.hasAttribute("data-present") && panel.getAnimations().length === 0;
    }, id);
  const keyboardFocus = async (page, id) => {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.keyboard.press("Shift");
    await page.focus(`#${id}`);
  };

  let caps;

  await scenario("capabilities", {}, async (page) => {
    caps = await page.evaluate(() => ({
      reveal: "onbeforematch" in document.getElementById("cancel-panel"),
      textFragment: "fragmentDirective" in document,
      startingStyle: typeof CSSStartingStyleRule !== "undefined",
    }));
    console.log(
      `${engine}: beforematch ${caps.reveal}, text fragments ${caps.textFragment}, ` +
        `@starting-style ${caps.startingStyle}`,
    );
  });

  // Closed enabled panels: until-found where the engine supports it, plain hidden elsewhere.
  let closedHidden = "";

  if (caps.reveal) {
    closedHidden = "until-found";
  }

  // Does opening this panel interpolate? Only panels without a previous box depend on D3, and
  // none animates in an engine without @starting-style.
  const opensAnimated = ({ ordinaryHidden }) => {
    if (!ordinaryHidden) {
      return true;
    }

    return caps.startingStyle && D3 === "broad";
  };
  // A closed panel's box: until-found keeps one (0fr), plain `hidden` doesn't.
  const assertOpen = (samples, { ordinaryHidden }, label) => {
    if (opensAnimated({ ordinaryHidden })) {
      assertAnimatedOpen(samples, label);

      return;
    }

    console.log(`${engine}: ${label}: ordinary-hidden fallback, open snaps`);
    assertSnapOpen(samples, label);
  };

  // Click open and closed, then reversals both ways, in the FAQ (Single), the sidebar Collapsible
  // and "Show more", whose closed panels are until-found where the engine supports it, and in
  // the opted-out Collapsible, whose closed panel is plainly hidden.
  const togglers = [
    { name: "FAQ item", trigger: "cancel-trigger", panel: "cancel-panel", hidden: closedHidden },
    {
      name: "sidebar group",
      trigger: "reports-trigger",
      panel: "reports-panel",
      hidden: closedHidden,
    },
    {
      name: "Show more",
      trigger: "show-more-trigger",
      panel: "show-more-panel",
      hidden: closedHidden,
    },
    {
      name: "opted-out Collapsible",
      trigger: "invoice-filters-trigger",
      panel: "invoice-filters-panel",
      hidden: "",
    },
  ];

  for (const { name, trigger, panel, hidden } of togglers) {
    const shape = { ordinaryHidden: hidden === "" };

    await scenario(`${name} open, close and reversals`, {}, async (page) => {
      assert.equal(await attribute(page, panel, "hidden"), hidden, `${name} closed`);

      const opening = await traced(page, { ids: [panel] }, () => page.click(`#${trigger}`));
      const opened = series(opening, panel);

      assertOpen(opened, shape, `${name} open`);

      const full = opened[opened.length - 1].height;
      const closing = await traced(page, { ids: [panel] }, () => page.click(`#${trigger}`));

      assertAnimatedClose(series(closing, panel), hidden, `${name} close`);

      // Exit, then enter again at the first frame at or after 60 ms: it turns from where it is.
      await page.click(`#${trigger}`);
      await settledOpen(page, panel);

      const exitEnter = await traced(page, { ids: [panel], reverse: `#${trigger}` }, () =>
        page.click(`#${trigger}`),
      );
      const turned = series(exitEnter, panel);
      const last = turned[turned.length - 1];

      assert.ok(exitEnter.reversedAt !== null, `${name} reversed`);
      console.log(
        `${engine}: ${name} exit → enter ${assertReversal(exitEnter, turned, full, true, `${name} exit → enter`)}`,
      );
      assert.deepEqual(
        [last.phase, last.hidden, last.opacity, Math.abs(last.height - full) < 0.5],
        ["present", null, 1, true],
        `${name} exit → enter settled: ${describe(turned)}`,
      );

      // Enter, then exit again: only where the open animated (a snapped open has no entrance).
      await page.click(`#${trigger}`);
      await page.waitForFunction(
        ([id, hidden]) => document.getElementById(id).getAttribute("hidden") === hidden,
        [panel, hidden],
      );

      if (opensAnimated(shape)) {
        const enterExit = await traced(page, { ids: [panel], reverse: `#${trigger}` }, () =>
          page.click(`#${trigger}`),
        );
        const back = series(enterExit, panel);

        assert.ok(enterExit.reversedAt !== null, `${name} reversed back`);
        console.log(
          `${engine}: ${name} enter → exit ${assertReversal(enterExit, back, full, false, `${name} enter → exit`)}`,
        );
        assertSettledClosed(back, hidden, `${name} enter → exit`);
      }
    });
  }

  // Single: switching moves both panels at once; then the locked settings, whose items opt out.
  await scenario("Single switch", {}, async (page) => {
    await page.click("#cancel-trigger");
    await settledOpen(page, "cancel-panel");

    const switching = await traced(page, { ids: ["cancel-panel", "exports-panel"] }, () =>
      page.click("#exports-trigger"),
    );
    const leaving = series(switching, "cancel-panel");
    const entering = series(switching, "exports-panel");
    const enteringShape = { ordinaryHidden: closedHidden === "" };

    assertAnimatedClose(leaving, closedHidden, "Single switch, leaving");
    assertOpen(entering, enteringShape, "Single switch, entering");

    // Both move at once, where the entering one animates at all.
    if (opensAnimated(enteringShape)) {
      let overlap = 0;

      for (const [index, sample] of leaving.entries()) {
        const other = entering[index];

        if (sample.phase === "leaving" && other && other.phase === "entering") {
          overlap++;
        }
      }

      assert.ok(overlap > 0, "both panels move together");
      console.log(`${engine}: Single switch overlap ${overlap} frames`);
    }

    assert.equal(await text(page, "faq-value"), "exports");

    const settings = await traced(page, { ids: ["profile-panel", "notifications-panel"] }, () =>
      page.click("#notifications-trigger"),
    );

    assertAnimatedClose(series(settings, "profile-panel"), "", "opted-out item closing");
    assertOpen(series(settings, "notifications-panel"), { ordinaryHidden: true }, "opted-out item");
  });

  // An app write opens and closes a disabled collapsed Collapsible, plainly hidden.
  await scenario("model write on a disabled Collapsible", {}, async (page) => {
    const opening = await traced(page, { ids: ["locked-more-panel"] }, () =>
      page.click("#locked-more-write"),
    );

    assertOpen(series(opening, "locked-more-panel"), { ordinaryHidden: true }, "model write open");

    const closing = await traced(page, { ids: ["locked-more-panel"] }, () =>
      page.click("#locked-more-write"),
    );

    assertAnimatedClose(series(closing, "locked-more-panel"), "", "model write close");
  });

  // Panels open in the server HTML don't slide in on load, from first paint through hydration:
  // `@starting-style` applies to every element's first style, so only the entering gate keeps it
  // off them. Recorded from before the page's own scripts. The client-inserted panels are the
  // other side of D3: their entrance shows up in the same recorder.
  await scenario(
    "server-rendered open panels on load",
    {
      init: () => {
        const record = { open: null, runs: [] };
        const panels = "[data-slot=accordion-panel], [data-slot=collapsible-panel]";

        window.__loadMotion = record;

        for (const type of ["transitionrun", "animationstart"]) {
          addEventListener(
            type,
            (event) => {
              if (event.target.matches?.(panels)) {
                record.runs.push({
                  id: event.target.id,
                  property: event.propertyName ?? event.animationName,
                  at: Math.round(performance.now()),
                  hydrated: !document.querySelector("[ngh]"),
                });
              }
            },
            { capture: true },
          );
        }

        document.addEventListener("DOMContentLoaded", () => {
          record.open = [];

          for (const panel of document.querySelectorAll(panels)) {
            if (panel.hasAttribute("data-expanded")) {
              record.open.push(panel.id);
            }
          }
        });
      },
    },
    async (page) => {
      const load = await page.evaluate(() => window.__loadMotion);

      for (const id of [
        "profile-panel",
        "applicant-panel",
        "receipts-panel",
        "light-first-panel",
        "invoice-notes-panel",
      ]) {
        assert.ok(load.open.includes(id), `${id} open in the parsed server HTML: ${load.open}`);
      }

      assert.deepEqual(load.runs, [], "panels moved on load");

      await page.click("#late-insert");
      await page.waitForSelector("#late-findable-panel");
      await settledOpen(page, "late-findable-panel");

      const inserted = await page.evaluate(() => window.__loadMotion.runs);
      const insertedIds = new Set(inserted.map((run) => run.id));

      if (caps.startingStyle) {
        assert.ok(
          insertedIds.has("late-findable-panel") && insertedIds.has("late-hidden-panel"),
          `inserted panels' entrance recorded: ${JSON.stringify(inserted)}`,
        );
      }

      console.log(
        `${engine}: ${load.open.length} panels open in the server HTML moved 0 times on load; ` +
          `inserted panels ran ${inserted.length} transitions`,
      );
    },
  );

  // Panels mounted open on the client: under the broad entrance both slide in once, then settle.
  await scenario("inserted open accordion", {}, async (page) => {
    const ids = ["late-findable-panel", "late-hidden-panel"];
    const inserting = await traced(page, { ids }, () => page.click("#late-insert"));

    for (const id of ids) {
      // No box before it mounted, like an ordinary-hidden panel.
      assertOpen(series(inserting, id), { ordinaryHidden: true }, `inserted ${id}`);
    }
  });

  // A nested open panel inside a closed outer one ends present at full height; whether it also
  // grew is the broad entrance's documented cost, logged.
  await scenario("nested open inside a closed outer panel", {}, async (page) => {
    const ids = ["preferences-panel", "receipts-panel"];
    const opening = await traced(page, { ids }, () => page.click("#preferences-trigger"));
    const outer = series(opening, "preferences-panel");
    const inner = series(opening, "receipts-panel");
    const last = inner[inner.length - 1];

    assertOpen(outer, { ordinaryHidden: closedHidden === "" }, "outer");
    assert.deepEqual(
      [last.phase, last.hidden, last.opacity],
      ["present", null, 1],
      describe(inner),
    );
    assert.ok(last.height > 1, describe(inner));
    console.log(
      `${engine}: nested inner panel animated ${inner.some((sample) => sample.animations > 0)}, ` +
        `first height ${inner[0].height.toFixed(1)} px of ${last.height.toFixed(1)}`,
    );
  });

  // Enter and Space on a focused trigger of each primitive.
  await scenario("keys", {}, async (page) => {
    for (const [trigger, panel, hidden] of [
      ["cancel-trigger", "cancel-panel", closedHidden],
      ["reports-trigger", "reports-panel", closedHidden],
    ]) {
      await keyboardFocus(page, trigger);
      await page.keyboard.press("Enter");
      await settledOpen(page, panel);
      await page.keyboard.press("Space");
      await page.waitForFunction(
        ([id, hidden]) => document.getElementById(id).getAttribute("hidden") === hidden,
        [panel, hidden],
      );
    }
  });

  // Reduced motion: no effects, settled on the next frame, closed until-found panels 0 px tall.
  await scenario("reduced motion", { reducedMotion: "reduce" }, async (page) => {
    for (const [trigger, panel, hidden] of [
      ["cancel-trigger", "cancel-panel", closedHidden],
      ["reports-trigger", "reports-panel", closedHidden],
      ["invoice-filters-trigger", "invoice-filters-panel", ""],
    ]) {
      const opening = await traced(page, { ids: [panel], duration: 300 }, () =>
        page.click(`#${trigger}`),
      );
      const opened = series(opening, panel);
      const settledAt = opened.find((sample) => sample.phase === "present");

      assert.ok(
        opened.every((sample) => sample.animations === 0),
        `${panel} animated: ${describe(opened)}`,
      );
      assert.ok(settledAt && settledAt.at < 100, `${panel} settled late: ${describe(opened)}`);
      assertSnapOpen(opened, `${panel} reduced`);

      const closing = await traced(page, { ids: [panel], duration: 300 }, () =>
        page.click(`#${trigger}`),
      );
      const closed = series(closing, panel);

      assert.ok(
        closed.every((sample) => sample.animations === 0),
        describe(closed),
      );
      assertSettledClosed(closed, hidden, `${panel} reduced`);
      assert.ok(closed.find((sample) => sample.hidden !== null).at < 100, describe(closed));
    }
  });

  // Native find-in-page reveals: a trusted beforematch opens the item and its model follows;
  // where the match lands is logged, not asserted (the panel grows after the browser scrolls).
  const reveal = async (page, { link, panel, value, target }) => {
    await page.evaluate(() => {
      window.__matches = [];
      document.addEventListener(
        "beforematch",
        (event) => window.__matches.push({ id: event.target.id, trusted: event.isTrusted }),
        { capture: true },
      );
    });
    await page.click(`#${link}`);
    await settledOpen(page, panel);
    await page.waitForFunction(
      ([id, text]) => document.getElementById(id).textContent.trim() === text,
      value,
    );

    const matches = await page.evaluate(() => window.__matches);
    const place = await page.evaluate((target) => {
      const rect = document.getElementById(target).getBoundingClientRect();

      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), viewport: innerHeight };
    }, target);

    assert.deepEqual(matches, [{ id: panel, trusted: true }], `${link} beforematch`);
    console.log(`${engine}: ${link} revealed ${panel}, match ${JSON.stringify(place)}`);
  };
  const reveals = [
    {
      link: "faq-fragment-link",
      panel: "exports-panel",
      value: ["faq-value", "exports"],
      target: "faq-export-format",
    },
    {
      link: "tax-fragment-link",
      panel: "reports-panel",
      value: ["reports-value", "true"],
      target: "tax-summaries",
    },
  ];

  if (caps.textFragment) {
    reveals.push({
      link: "faq-text-link",
      panel: "exports-panel",
      value: ["faq-value", "exports"],
      target: "faq-export-phrase",
    });
  }

  for (const options of reveals) {
    await scenario(`reveal from ${options.link}`, {}, async (page) => {
      if (caps.reveal) {
        await reveal(page, options);

        return;
      }

      // Without beforematch, ordinary hiding stays authoritative: nothing opens, the value stays.
      const [valueId] = options.value;
      const value = await text(page, valueId);

      assert.equal(await attribute(page, options.panel, "hidden"), "");
      await page.click(`#${options.link}`);
      await page.waitForTimeout(300);
      assert.equal(await text(page, valueId), value, `${options.link} kept the value`);
      assert.equal(await attribute(page, options.panel, "hidden"), "");
      console.log(`${engine}: beforematch unsupported; ordinary hiding stays authoritative`);
    });
  }

  // The form recipe, mounted and deferred: Save opens Billing contact, which holds the first
  // error, and focuses its RadioGroup's tab stop after the opening render. The section's errors
  // show and name their controls.
  for (const [deferred, variant] of [
    [false, "mounted"],
    [true, "deferred"],
  ]) {
    await scenario(`form errors, ${variant}, pointer`, {}, async (page) => {
      if (deferred) {
        await page.click("#billing-defer");
        // Unmounted once Angular renders the switch.
        await page.waitForSelector("#billing-fields", { state: "detached" });
      }

      assert.equal(await attribute(page, "billing-panel", "hidden"), closedHidden);

      const saving = await traced(page, { ids: ["billing-panel"] }, () =>
        page.click("#payment-save"),
      );

      await settledOpen(page, "billing-panel");

      const focused = await page.evaluate(() => {
        const active = document.activeElement;
        const rect = active.getBoundingClientRect();
        const clip = document.querySelector("#billing-panel > [data-slot=accordion-panel-clip]");

        return {
          id: active.id,
          role: active.getAttribute("role"),
          tabIndex: active.tabIndex,
          inPanel: document.getElementById("billing-panel").contains(active),
          inView:
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= innerHeight &&
            rect.right <= innerWidth,
          clip: getComputedStyle(clip).overflow,
        };
      });

      assert.equal(await text(page, "sections-value"), "applicant,billing");
      assert.equal(await text(page, "payment-saves"), "0");
      assert.deepEqual(focused, {
        id: "delivery-email",
        role: "radio",
        tabIndex: 0,
        inPanel: true,
        inView: true,
        clip: "visible",
      });
      assert.equal(await text(page, "delivery-error"), "Choose how we send invoices");
      assert.equal(await text(page, "billing-email-error"), "Enter a billing email");

      for (const [control, label, error] of [
        ["delivery", "delivery-label", "delivery-error"],
        ["billing-email", null, "billing-email-error"],
      ]) {
        assert.equal(await attribute(page, control, "aria-invalid"), "true", control);
        assert.ok((await attribute(page, control, "aria-describedby")).split(" ").includes(error));

        if (label) {
          assert.ok((await attribute(page, control, "aria-labelledby")).split(" ").includes(label));
        }
      }

      const arrival = saving.focus.find((entry) => entry.id === "delivery-email");

      console.log(
        `${engine}: ${variant} Save focused the delivery group at ` +
          `${(arrival.at - saving.actionAt).toFixed(0)} ms, phase ${arrival.phase}`,
      );
    });
  }

  // A keyboard Save: the focused radio shows its ring on the indicator.
  await scenario("form errors, keyboard", {}, async (page) => {
    await keyboardFocus(page, "payment-save");
    await page.keyboard.press("Enter");
    await settledOpen(page, "billing-panel");
    await page.waitForFunction(() => document.activeElement.id === "delivery-email");

    const ring = await page.evaluate(() => {
      const style = getComputedStyle(
        document.querySelector("#delivery-email > [data-slot=radio-group-indicator]"),
      );

      return `${style.outlineStyle} ${style.outlineWidth}`;
    });

    assert.equal(ring, "solid 2px", "the indicator's ring");
  });

  // Tab during motion, logged: Space then Tab at about 40 ms into the entry and the exit of the
  // sidebar group and the FAQ item with a link. On exit, focus inside the leaving panel falls to
  // the page when it hides; the next Tab continues after the panel.
  for (const { name, trigger, panel } of [
    { name: "sidebar group", trigger: "reports-trigger", panel: "reports-panel" },
    { name: "FAQ link item", trigger: "exports-trigger", panel: "exports-panel" },
  ]) {
    await scenario(`Tab during ${name} motion`, {}, async (page) => {
      const tabAt = async (ms) => {
        await page.evaluate(() => {
          window.__keyAt = null;
          document.addEventListener("keyup", () => (window.__keyAt ??= performance.now()), {
            once: true,
            capture: true,
          });
        });
        await page.keyboard.press("Space");
        await page.waitForFunction(
          (ms) => window.__keyAt !== null && performance.now() - window.__keyAt >= ms,
          ms,
        );
        await page.keyboard.press("Tab");
      };
      const focusReport = () =>
        page.evaluate((panelId) => {
          const active = document.activeElement;
          const clipElement = document
            .getElementById(panelId)
            .querySelector(":scope > [data-slot$=panel-clip]");
          const clip = clipElement.getBoundingClientRect();
          const rect = active.getBoundingClientRect();
          const style = getComputedStyle(active);
          let grow = 0;

          if (style.outlineStyle !== "none") {
            grow = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
          }

          // The clip cuts the ring only while it hides overflow, during the motion.
          const clipsOverflow = getComputedStyle(clipElement).overflowY !== "visible";
          const inside = rect.top - grow >= clip.top - 1 && rect.bottom + grow <= clip.bottom + 1;
          let ring = "clipped";

          if (!clipsOverflow || inside) {
            ring = "clear";
          }

          return `${active.id || active.tagName} ring ${ring}`;
        }, panel);

      await keyboardFocus(page, trigger);
      await tabAt(40);
      console.log(`${engine}: ${name} entry Tab → ${await focusReport()}`);
      await settledOpen(page, panel);
      console.log(`${engine}: ${name} entry settled → ${await focusReport()}`);

      await keyboardFocus(page, trigger);
      await tabAt(40);

      const during = await page.evaluate(
        () => document.activeElement.id || document.activeElement.tagName,
      );

      await page.waitForFunction((id) => document.getElementById(id).hasAttribute("hidden"), panel);

      const after = await page.evaluate(
        () => document.activeElement.id || document.activeElement.tagName,
      );

      await page.keyboard.press("Tab");

      const next = await page.evaluate(
        () => document.activeElement.id || document.activeElement.tagName,
      );

      console.log(
        `${engine}: ${name} exit Tab → ${during}, after hiding ${after}, next Tab ${next}`,
      );
    });
  }

  assert.deepEqual(errors, [], "page or hydration errors");
  console.log(`${engine} disclosure check passed.`);
}

if (import.meta.main) {
  await main();
}
