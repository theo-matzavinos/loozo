// The runtime phase's measurements: the router workload's bootstrap and navigations in Chromium,
// and the Launch workload's SSR and RPC requests against its built server. See the Runtime
// section of bench/README.md for what each number means.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { exists } from "../../../tools/bench/process.mjs";
import { packageDirectory } from "./consumer.mjs";

const require = createRequire(join(packageDirectory, "package.json"));
const { chromium } = require("playwright");

// Discarded before sampling: warm round trips (two navigations each) on the warm page, and
// requests per endpoint per server start.
const warmRoundTrips = 3;
const warmupRequests = 20;

// The page the router workload boots at, and the marker its pages and the SSR page carry.
const bootRoute = "g0000/static/l0";
const ssrRoute = "g0000/$id";

export const runtimeConditions = {
  router: `Headless Chromium through Playwright, one browser process per route count; a static loopback server for dist/proof/browser (no-store, index.html for every other path). Bootstrap: a fresh context per sample, goto /${bootRoute}, from performance.mark("bench:bootstrap") just before bootstrapApplication to the first MutationObserver observation of the page's [data-bench-page] marker; router init, the initial navigation and its lazy chunks are in, HTML/JS transfer and parse aren't (kept as documentToBootstrapMs). Cold: the same page clicks the shell's cold link to the last block's static/l1, an unvisited branch. Warm: one more context, ${warmRoundTrips} discarded round trips, then alternating clicks between g0000/static/l0 and static/l1. Navigations run from a capture-phase click listener's performance.now() to the destination marker's first observation: DOM-committed, not painted. A fresh context isn't a cold OS, disk or JIT; the browser process is warm. Chromium coarsens performance.now() to 0.1 ms.`,
  launch: `The built server (dist/proof/server/server.mjs from the example's server.ts: request scope, RPC dispatch and abort handling, plus one pathname comparison and one String.replace on each page's HTML), PORT=0, ready on LAUNCH_READY. Per server start and endpoint, ${warmupRequests} discarded requests, then sequential keep-alive loopback requests at concurrency 1 with x-bench-user: bench, each timed from just before fetch to the body read in full, then asserted. SSR: GET /g0000/1 (200 and the page marker). RPC: POST /_rpc/g0000/read and /_rpc/g0000/write with a JSON envelope and the server's origin. The middleware server runs SSR, query and mutation in that order; then a second, untimed build of the same route count without the block roots' .use(timing) (consumer-bare) runs SSR only. The with/without pair bounds end-to-end latency with and without the middleware chain; it doesn't isolate the middleware's cost.`,
};

// Fails before a long run when the router workload's browser isn't installed.
export async function requireChromium() {
  const installed = await exists(chromium.executablePath());

  if (!installed) {
    throw new Error(
      "Chromium isn't installed for the runtime phase: run pnpm --dir packages/angular-router exec playwright install chromium.",
    );
  }
}

// Serves the built browser files on loopback, falling back to index.html.
async function serveBrowser(directory) {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    let file = join(directory, "index.html");
    let type = "text/html";

    if (path.endsWith(".js")) {
      file = join(directory, path);
      type = "text/javascript";
    } else if (path.endsWith(".css")) {
      file = join(directory, path);
      type = "text/css";
    }

    let body;

    try {
      body = await readFile(file);
    } catch {
      response.writeHead(404).end();

      return;
    }

    response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}

// Runs in the page before its scripts. Timestamps and observations stay in the page, so
// Playwright's round trips are outside every interval.
function observe(bootPage) {
  const state = {
    bootstrapMs: null,
    documentToBootstrapMs: null,
    samples: [],
    start: null,
    target: null,
  };

  window.__bench = state;

  new MutationObserver(() => {
    if (state.bootstrapMs === null) {
      const [mark] = performance.getEntriesByName("bench:bootstrap");
      const booted = document.querySelector(`[data-bench-page="${bootPage}"]`) !== null;

      if (mark !== undefined && booted) {
        state.documentToBootstrapMs = mark.startTime;
        state.bootstrapMs = performance.now() - mark.startTime;
      }
    }

    if (state.start !== null) {
      const arrived = document.querySelector(`[data-bench-page="${state.target}"]`) !== null;

      if (arrived) {
        state.samples.push(performance.now() - state.start);
        state.start = null;
      }
    }
  }).observe(document, { childList: true, subtree: true, attributes: true });

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[data-bench]");

      if (link === null) {
        return;
      }

      state.target = new URL(link.href).pathname.slice(1);
      state.start = performance.now();
    },
    true,
  );
}

// Waits for a condition in the page, failing on a page error or at the timeout.
async function waitInPage(page, failed, description, timeoutMs, predicate, argument) {
  try {
    await Promise.race([page.waitForFunction(predicate, argument, { timeout: timeoutMs }), failed]);
  } catch (error) {
    throw new Error(`${description}: ${error.message}`, { cause: error });
  }
}

// A fresh context booted at the boot route; resolves once its marker was observed.
async function boot(browser, origin, timeoutMs) {
  const context = await browser.newContext();
  let fail;
  const failed = new Promise((resolvePromise, reject) => {
    fail = reject;
  });

  // Seen through waitInPage's race; a page error between waits fails the next one.
  failed.catch(() => {});

  await context.addInitScript(observe, bootRoute);

  const page = await context.newPage();

  page.on("pageerror", (error) => fail(new Error(`The page threw: ${error.message}`)));

  try {
    await page.goto(`${origin}/${bootRoute}`, { timeout: timeoutMs });
    await waitInPage(
      page,
      failed,
      `/${bootRoute} didn't show its page`,
      timeoutMs,
      () => window.__bench.bootstrapMs !== null,
    );
  } catch (error) {
    await context.close();

    throw error;
  }

  return { context, page, failed };
}

// Clicks a shell bench link and returns the in-page time to its destination's marker.
async function navigate({ page, failed }, link, timeoutMs) {
  const before = await page.evaluate(() => window.__bench.samples.length);

  await page.locator(`a[data-bench="${link}"]`).click({ timeout: timeoutMs });
  await waitInPage(
    page,
    failed,
    `The ${link} link's destination didn't show its page`,
    timeoutMs,
    (count) => window.__bench.samples.length > count,
    before,
  );

  return page.evaluate(() => ({
    target: window.__bench.target,
    ms: window.__bench.samples.at(-1),
  }));
}

// Bootstrap and cold navigation on fresh contexts, then warm navigation on one page, all in one
// browser process. samples: { boot, cold, warm }.
export async function measureNavigation(browserDirectory, { samples, timeoutMs }) {
  const server = await serveBrowser(browserDirectory);
  const values = {
    bootstrapMs: [],
    documentToBootstrapMs: [],
    navigateColdMs: [],
    navigateWarmMs: [],
  };
  let browser;
  let coldTarget;

  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

    // Each fresh context boots; the first `boot` record it, the first `cold` then navigate.
    const fresh = Math.max(samples.boot, samples.cold);

    for (let sample = 0; sample < fresh; sample++) {
      const session = await boot(browser, server.origin, timeoutMs);

      try {
        if (sample < samples.boot) {
          const state = await session.page.evaluate(() => window.__bench);

          values.bootstrapMs.push(state.bootstrapMs);
          values.documentToBootstrapMs.push(state.documentToBootstrapMs);
        }

        if (sample < samples.cold) {
          const cold = await navigate(session, "cold", timeoutMs);

          values.navigateColdMs.push(cold.ms);
          coldTarget = cold.target;
        }
      } finally {
        await session.context.close();
      }
    }

    const session = await boot(browser, server.origin, timeoutMs);

    try {
      for (let roundTrip = 0; roundTrip < warmRoundTrips; roundTrip++) {
        await navigate(session, "warm-b", timeoutMs);
        await navigate(session, "warm-a", timeoutMs);
      }

      for (let sample = 0; sample < samples.warm; sample++) {
        let link = "warm-b";

        if (sample % 2 === 1) {
          link = "warm-a";
        }

        const warm = await navigate(session, link, timeoutMs);

        values.navigateWarmMs.push(warm.ms);
      }
    } finally {
      await session.context.close();
    }

    return { values, chromium: browser.version(), coldTarget };
  } finally {
    await browser?.close();
    await server.close();
  }
}

// Starts a built Launch server on a free loopback port and waits for its LAUNCH_READY line. Its
// output goes to log when it stops.
export async function startServer(entry, { cwd, log, timeoutMs }) {
  const child = spawn(process.execPath, [entry], {
    cwd,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  let output = "";
  let timer;

  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });

  const ready = new Promise((resolvePromise, reject) => {
    child.stdout.on("data", () => {
      const match = /LAUNCH_READY (http:\/\/127\.0\.0\.1:\d+)/.exec(output);

      if (match) {
        resolvePromise(match[1]);
      }
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      reject(new Error(`The server exited (${signal ?? `exit ${code}`}) before it was ready`));
    });
    timer = setTimeout(
      () => reject(new Error(`The server wasn't ready within ${timeoutMs / 1000} s`)),
      timeoutMs,
    );
  });

  async function stop() {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }

    await exited;
    await writeFile(log, output);
  }

  try {
    const origin = await ready;

    return { origin, stop };
  } catch (error) {
    await stop();

    throw new Error(`${error.message}: node ${entry}; see ${log}`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

// The request each endpoint sends and what its response must hold.
const endpoints = {
  ssr: {
    path: "/g0000/1",
    init: () => ({ headers: { "x-bench-user": "bench" } }),
    check: (body) => body.includes(`data-bench-page="${ssrRoute}"`),
  },
  query: {
    path: "/_rpc/g0000/read",
    init: (origin) => rpc(origin, null),
    check: (body) => isDeepStrictEqual(JSON.parse(body), { user: "bench", block: "g0000" }),
  },
  mutation: {
    path: "/_rpc/g0000/write",
    init: (origin) => rpc(origin, { text: "bench" }),
    check: (body) => isDeepStrictEqual(JSON.parse(body), { user: "bench", text: "bench" }),
  },
};

function rpc(origin, input) {
  return {
    method: "POST",
    headers: { "x-bench-user": "bench", "content-type": "application/json", origin },
    body: JSON.stringify({ input }),
  };
}

// One request, timed from just before fetch to the body read in full, then asserted. It fails when
// the response, body included, takes longer than timeoutMs.
async function request(origin, name, timeoutMs) {
  const endpoint = endpoints[name];
  const signal = AbortSignal.timeout(timeoutMs);
  const init = { ...endpoint.init(origin), signal };
  const start = performance.now();
  let response;
  let body;

  try {
    response = await fetch(`${origin}${endpoint.path}`, init);
    body = await response.text();
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        `${name} ${endpoint.path} didn't answer in full within ${timeoutMs / 1000} s`,
        { cause: error },
      );
    }

    throw error;
  }

  const ms = performance.now() - start;

  if (response.status !== 200) {
    throw new Error(`${name} ${endpoint.path} answered ${response.status}: ${body.slice(0, 500)}`);
  }

  let matches;

  try {
    matches = endpoint.check(body);
  } catch {
    matches = false;
  }

  if (!matches) {
    throw new Error(`${name} ${endpoint.path} answered something else: ${body.slice(0, 500)}`);
  }

  return ms;
}

// The discarded requests, then `count` sequential timed requests to one endpoint, each limited to
// timeoutMs.
export async function measureRequests(origin, name, { count, timeoutMs }) {
  for (let warmup = 0; warmup < warmupRequests; warmup++) {
    await request(origin, name, timeoutMs);
  }

  const values = [];

  for (let sample = 0; sample < count; sample++) {
    values.push(await request(origin, name, timeoutMs));
  }

  return values;
}
