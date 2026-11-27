// The runtime phase's measurements: the router workload's bootstrap and navigations in Chromium,
// and the Launch workload's SSR and RPC requests against its built server. See the Runtime
// section of bench/README.md for what each number means.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { packageDirectory } from "./consumer.mjs";
import { screens } from "./fixture.mjs";
import { makeRow, rowCount } from "./launch-fixture.mjs";

const require = createRequire(join(packageDirectory, "package.json"));
const { chromium } = require("playwright");

// Discarded before sampling: warm round trips (two navigations each) on the warm page, and
// requests per endpoint per server start.
const warmRoundTrips = 3;
const warmupRequests = 20;
// How long a failed navigation's diagnostic read of the page may take before the failure is
// reported without it.
const diagnosticTimeoutMs = 5000;

// The large endpoints' payloads: the query's response and the mutation's request must each hold at
// least this many UTF-8 bytes.
const largePayloadBytes = 1_000_000;
// Rows the large query's check compares in full, and the large mutation's exact reply.
const sampledRows = [makeRow(0), makeRow(rowCount / 2), makeRow(rowCount - 1)];
const largeMutationReply = JSON.stringify({ count: rowCount });

// The page the router workload boots at, and the marker its pages and the SSR page carry.
const bootRoute = "g0000/static/l0";
const ssrRoute = "g0000/$id";

export const runtimeConditions = {
  router: `Headless Chromium through Playwright, one browser process per route count; a static loopback server for dist/proof/browser (no-store, index.html for every other path). Bootstrap: a fresh context per sample, goto /${bootRoute}, from performance.mark("bench:bootstrap") just before bootstrapApplication to the first MutationObserver observation of the page's [data-bench-page] marker; router init, the initial navigation and its lazy chunks are in, HTML/JS transfer and parse aren't (kept as documentToBootstrapMs). Cold: the same page clicks the shell's cold link to the last block's static/l1, an unvisited branch. Warm: one more context, ${warmRoundTrips} discarded round trips, then alternating clicks between g0000/static/l0 and static/l1. Navigations run from a capture-phase click listener's performance.now() to the destination marker's first observation: DOM-committed, not painted. A fresh context isn't a cold OS, disk or JIT; the browser process is warm. Chromium coarsens performance.now() to 0.1 ms.`,
  launch: `The built server (dist/proof/server/server.mjs from the example's server.ts: request scope, RPC dispatch and abort handling, plus one pathname comparison and one String.replace on each page's HTML), PORT=0, ready on LAUNCH_READY. Requests go over keep-alive loopback at concurrency 1 with x-bench-user: bench, each timed from just before fetch to the body read in full, then validated. In order: 1. Cold starts, on the middleware build: per trial, one fresh server whose only request is GET /g0000/1 and another whose only request is POST /_rpc/g0000/read, no discarded requests; each timed from just before spawn to LAUNCH_READY and to that request's body read in full, then stopped and joined. 2. One warm middleware server; per endpoint ${warmupRequests} discarded requests, then the timed ones: SSR GET /g0000/1 (200 and the page marker); query POST /_rpc/g0000/read and mutation POST /_rpc/g0000/write, with a JSON envelope and the server's origin; the large query POST /_rpc/g0000/large (${rowCount} rows; its first, discarded response holds at least ${largePayloadBytes} UTF-8 bytes, every timed one has its exact length, ${rowCount} rows and rows 0, ${rowCount / 2} and ${rowCount - 1} as generated); the large mutation POST /_rpc/g0000/largeWrite (those rows, serialized once before timing, at least ${largePayloadBytes} UTF-8 bytes; every reply exactly ${largeMutationReply}). 3. The bare server: the same route count built without the block roots' .use(timing) (consumer-bare, an untimed build made before step 1), after the warm server stops; ${warmupRequests} discarded SSR requests, then timed SSR only. The with/without SSR pair bounds end-to-end latency with and without the middleware chain; it doesn't isolate the middleware's cost.`,
  bound: `After warm navigation, the control and screens each start at l0, discard ${warmRoundTrips} round trips, and time only forward legs. Arrival waits for l1's bound sibling href, the expected count and last bound href or search on l3 and l4, or 100 true destination bindings on l5.`,
};

// The runtime phase's browser: Playwright's headless Chromium (the headless shell).
const launchOptions = { headless: true, args: ["--no-sandbox"] };

// Fails before a long run when the browser the runtime phase launches can't start.
export async function requireChromium() {
  let browser;

  try {
    browser = await chromium.launch(launchOptions);
  } catch (error) {
    throw new Error(
      "Playwright's headless Chromium doesn't start for the runtime phase: run pnpm --dir packages/angular-router exec playwright install chromium.",
      { cause: error },
    );
  } finally {
    await browser?.close();
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
function observe({ bootPage, screenSizes }) {
  const state = {
    bootstrapMs: null,
    documentToBootstrapMs: null,
    samples: [],
    start: null,
    target: null,
    cutoff: "marker",
    prove: false,
    proofs: {},
    clicks: 0,
    sameUrlClicks: 0,
  };

  window.__bench = state;

  // How much of the current navigation's cutoff the DOM holds. Inside the interval it reads only
  // what the cutoff needs, in order; `full` reads every part for a timeout's message.
  function cutoffState(full = false) {
    const marker = document.querySelector(`[data-bench-page="${state.target}"]`);
    const screenSize = screenSizes[state.target];
    const current = { marker, screenSize, arrived: marker !== null };

    if ((marker === null && !full) || state.cutoff !== "bound") {
      return current;
    }

    if (screenSize === undefined) {
      current.siblingHref = marker?.nextElementSibling?.getAttribute("href") ?? null;
      current.arrived = marker !== null && Boolean(current.siblingHref);

      return current;
    }

    // Angular can insert the static marker before the repeater and its bindings run.
    current.content = marker?.previousElementSibling ?? null;
    current.count = current.content?.childElementCount ?? 0;
    current.arrived = marker !== null && current.count === screenSize;

    if (!current.arrived && !full) {
      return current;
    }

    const last = current.content?.lastElementChild;

    if (state.target.endsWith("/l3")) {
      current.lastBound = Boolean(last?.hasAttribute("href"));
      current.arrived &&= current.lastBound;
    } else if (state.target.endsWith("/l4")) {
      current.lastBound = Boolean(last?.querySelector("[data-bench-search]")?.textContent);
      current.arrived &&= current.lastBound;
    } else {
      current.activeMatches =
        current.content?.querySelectorAll('[data-bench-active="true"]').length ?? 0;
      current.arrived &&= current.activeMatches === screenSize;
    }

    return current;
  }

  // The cutoff's parts and whether each holds, for a navigation that didn't arrive.
  state.describeCutoff = () => {
    const current = cutoffState(true);
    const parts = [
      `[data-bench-page="${state.target}"] ${current.marker === null ? "missing" : "present"}`,
    ];

    if (state.cutoff === "bound" && current.screenSize === undefined) {
      parts.push(`sibling link href ${current.siblingHref ?? "missing"}`);
    } else if (state.cutoff === "bound") {
      parts.push(`${current.count} of ${current.screenSize} items`);

      if (state.target.endsWith("/l3")) {
        parts.push(`last anchor's href ${current.lastBound ? "bound" : "missing"}`);
      } else if (state.target.endsWith("/l4")) {
        parts.push(`last reader's search ${current.lastBound ? "rendered" : "missing"}`);
      } else {
        parts.push(`${current.activeMatches} of ${current.screenSize} is(destination) matches`);
      }
    }

    return `${state.cutoff} cutoff for /${state.target}: ${parts.join(", ")}`;
  };

  // Fixed reader views can bind their text after creation without inserting any more nodes.
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
      const { arrived, content, siblingHref, screenSize } = cutoffState();

      if (arrived) {
        state.samples.push(performance.now() - state.start);
        state.start = null;

        if (state.prove) {
          const children = [...(content?.children ?? [])];
          const proof = {
            source: state.source,
            destination: location.pathname + location.search,
          };

          if (screenSize === undefined) {
            proof.siblingHref = siblingHref;
          } else if (state.target.endsWith("/l3")) {
            proof.anchorCount = children.filter((child) => child.matches("a[href]")).length;
            proof.hrefs = [0, Math.floor(children.length / 2), children.length - 1].map((index) =>
              children[index]?.getAttribute("href"),
            );
          } else if (state.target.endsWith("/l4")) {
            for (const field of ["title", "params", "search"]) {
              proof[field] = [
                ...new Set(
                  children.map(
                    (child) => child.querySelector(`[data-bench-${field}]`)?.textContent,
                  ),
                ),
              ];
            }
          } else {
            const active = [...content.querySelectorAll('[data-bench-active="true"]')];
            proof.activeCount = active.length;
            proof.title = [...new Set(active.map((element) => element.textContent))];
          }

          if (screenSize !== undefined) {
            proof.count = children.length;
          }

          state.proofs[state.target] = proof;
          state.prove = false;
        }
      }
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[data-bench]");

      if (link === null) {
        return;
      }

      const destination = new URL(link.href);
      state.clicks++;
      if (destination.href === location.href) {
        state.sameUrlClicks++;
        throw new Error(`The bench clicked its current URL ${destination.href}`);
      }

      state.source = location.pathname + location.search;
      state.target = destination.pathname.slice(1);
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
async function boot(browser, origin, timeoutMs, bootSearch) {
  const context = await browser.newContext();
  let fail;
  const failed = new Promise((resolvePromise, reject) => {
    fail = reject;
  });

  // Seen through waitInPage's race; a page error between waits fails the next one.
  failed.catch(() => {});

  const screenSizes = Object.fromEntries(
    screens.map(({ leaf, size }) => [`g0000/static/l${leaf}`, size]),
  );
  await context.addInitScript(observe, { bootPage: bootRoute, screenSizes });

  const page = await context.newPage();

  page.on("pageerror", (error) => fail(new Error(`The page threw: ${error.message}`)));

  try {
    await page.goto(`${origin}/${bootRoute}${bootSearch}`, { timeout: timeoutMs });
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

// Clicks a shell bench link and returns the in-page time to the chosen destination cutoff.
async function navigate(
  { page, failed },
  link,
  timeoutMs,
  { cutoff = "marker", prove = false } = {},
) {
  const before = await page.evaluate(
    ({ cutoff, prove }) => {
      window.__bench.cutoff = cutoff;
      window.__bench.prove = prove;
      return window.__bench.samples.length;
    },
    { cutoff, prove },
  );

  await page.locator(`a[data-bench="${link}"]`).click({ timeout: timeoutMs });

  try {
    await waitInPage(
      page,
      failed,
      `The ${link} link's destination didn't reach its cutoff`,
      timeoutMs,
      (count) => window.__bench.samples.length > count,
      before,
    );
  } catch (error) {
    let unmet = "the page couldn't be read";
    let timer;

    // Bounded: Playwright evaluates without a timeout, and a locked renderer would otherwise keep
    // the original failure, and the gate lock, from ever reaching the harness.
    try {
      unmet = await Promise.race([
        page.evaluate(() => window.__bench.describeCutoff()),
        new Promise((resolvePromise) => {
          timer = setTimeout(
            () => resolvePromise(`the page didn't answer within ${diagnosticTimeoutMs / 1000} s`),
            diagnosticTimeoutMs,
          );
        }),
      ]);
    } catch {
      // The page error or a closed page is already in the message.
    } finally {
      clearTimeout(timer);
    }

    throw new Error(`${error.message} (${unmet})`, { cause: error });
  }

  return page.evaluate(() => ({
    source: window.__bench.source,
    target: window.__bench.target,
    ms: window.__bench.samples.at(-1),
  }));
}

// Fails the run unless the first timed visits saw the bound control's sibling link, all 500 typed
// links with their expected hrefs, the readers' title, params and search, and 100 readers whose
// active route is l5.
function checkScreenProof(proof, bootSearch) {
  const control = proof.proofs["g0000/static/l1"];

  if (
    control?.destination !== `/g0000/static/l1${bootSearch}` ||
    !control.siblingHref.startsWith("/g0000/static/l1")
  ) {
    throw new Error(`Unexpected bound control: ${JSON.stringify(control)}`);
  }

  const visited = {};

  for (const { name, leaf, size } of screens) {
    const route = `g0000/static/l${leaf}`;
    const screen = proof.proofs[route];

    if (screen?.count !== size || screen.destination !== `/${route}${bootSearch}`) {
      throw new Error(`Unexpected ${route} at its first timed visit: ${JSON.stringify(screen)}`);
    }

    visited[name] = screen;
  }

  const { links, readers, activeReaders } = visited;
  const hrefs = [0, Math.floor(links.count / 2), links.count - 1].map((id) => `/g0000/${id}`);
  let search = {};

  if (bootSearch) {
    search = { pageSize: 50 };
  }

  const expected =
    proof.sameUrlClicks === 0 &&
    links.anchorCount === links.count &&
    isDeepStrictEqual(links.hrefs, hrefs) &&
    isDeepStrictEqual(readers.title, ["g0000"]) &&
    isDeepStrictEqual(readers.params.map(JSON.parse), [{}]) &&
    isDeepStrictEqual(readers.search.map(JSON.parse), [search]) &&
    activeReaders.activeCount === activeReaders.count &&
    isDeepStrictEqual(activeReaders.title, ["g0000"]);

  if (!expected) {
    throw new Error(`Unexpected screen values: ${JSON.stringify(proof)}`);
  }
}

// Bootstrap and cold navigation on fresh contexts, then warm navigation, the bound control and the
// screens on one page, all in one browser process. samples: { boot, cold, warm, screens }.
// `bootSearch` is the boot URL's query, such as the remembered workload's page size.
export async function measureNavigation(browserDirectory, { samples, timeoutMs, bootSearch = "" }) {
  const server = await serveBrowser(browserDirectory);
  const values = {
    bootstrapMs: [],
    documentToBootstrapMs: [],
    navigateColdMs: [],
    navigateWarmMs: [],
    navigateBoundMs: [],
    linksNavigateMs: [],
    readersNavigateMs: [],
    activeReadersNavigateMs: [],
  };
  let browser;
  let coldTarget;
  let screenProof;

  try {
    browser = await chromium.launch(launchOptions);

    // Each fresh context boots; the first `boot` record it, the first `cold` then navigate.
    const fresh = Math.max(samples.boot, samples.cold);

    for (let sample = 0; sample < fresh; sample++) {
      const session = await boot(browser, server.origin, timeoutMs, bootSearch);

      try {
        if (sample < samples.boot) {
          const state = await session.page.evaluate(() => ({
            bootstrapMs: window.__bench.bootstrapMs,
            documentToBootstrapMs: window.__bench.documentToBootstrapMs,
          }));

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

    const session = await boot(browser, server.origin, timeoutMs, bootSearch);

    try {
      let warmReset = null;

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

      if (samples.warm % 2 === 1) {
        warmReset = await navigate(session, "warm-a", timeoutMs);

        if (warmReset.source !== `/g0000/static/l1${bootSearch}`) {
          throw new Error(`The odd warm reset left ${warmReset.source}`);
        }
      }

      // The bound control and each screen: discarded round trips, then timed l0 → target legs;
      // the way back isn't timed. The first timed visit to each target stores its proof.
      const boundControl = { link: "warm-b", metric: "navigateBoundMs" };

      for (const visit of [boundControl, ...screens]) {
        for (let roundTrip = 0; roundTrip < warmRoundTrips + samples.screens; roundTrip++) {
          const timed = roundTrip >= warmRoundTrips;
          const { ms, source } = await navigate(session, visit.link, timeoutMs, {
            cutoff: "bound",
            prove: roundTrip === warmRoundTrips,
          });

          if (source !== `/${bootRoute}${bootSearch}`) {
            throw new Error(`${visit.link} started at ${source}`);
          }

          if (timed) {
            values[visit.metric].push(ms);
          }

          await navigate(session, "warm-a", timeoutMs);
        }
      }

      screenProof = await session.page.evaluate(() => {
        const { proofs, clicks, sameUrlClicks } = window.__bench;

        return { proofs, clicks, sameUrlClicks, finalUrl: location.pathname + location.search };
      });
      screenProof.warmReset = warmReset;
      checkScreenProof(screenProof, bootSearch);
    } finally {
      await session.context.close();
    }

    return { values, chromium: browser.version(), coldTarget, screens: screenProof };
  } finally {
    await browser?.close();
    await server.close();
  }
}

// Starts a built Launch server on a free loopback port and waits for its LAUNCH_READY line. Its
// output goes to log when it stops.
export async function startServer(entry, { cwd, log, timeoutMs }) {
  const started = performance.now();
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
        resolvePromise({ origin: match[1], readyMs: performance.now() - started });
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

    const [code, signal] = await exited;
    await writeFile(log, output);

    return { code, signal };
  }

  try {
    const { origin, readyMs } = await ready;

    return { origin, stop, started, readyMs, pid: child.pid };
  } catch (error) {
    await stop();

    throw new Error(`${error.message}: node ${entry}; see ${log}`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

// Cold starts: per trial, one fresh server answers GET /g0000/1 first and another POST
// /_rpc/g0000/read first. Each records spawn → LAUNCH_READY and spawn → that first body read in
// full; the server is stopped and joined after its request, also when the request fails.
export async function measureColdStarts(entry, { cwd, trials, timeoutMs, logs }) {
  const values = { readyMs: [], firstSsrMs: [], firstRpcMs: [] };
  const first = { ssr: values.firstSsrMs, query: values.firstRpcMs };
  const processes = [];
  const started = performance.now();

  for (let trial = 1; trial <= trials; trial++) {
    for (const endpoint of ["ssr", "query"]) {
      const log = join(logs, `cold-${trial}-${endpoint}.log`);
      const server = await startServer(entry, { cwd, log, timeoutMs });
      const child = {
        trial,
        pid: server.pid,
        firstRequest: endpoints[endpoint].path,
        completed: false,
      };

      try {
        values.readyMs.push(server.readyMs);

        const { ended } = await request(server.origin, endpoint, timeoutMs);

        first[endpoint].push(ended - server.started);
        child.completed = true;
      } finally {
        child.exit = await server.stop();
        await appendFile(log, `${JSON.stringify(child)}\n`);
        processes.push(child);
      }
    }
  }

  return { values, processes, wallMs: performance.now() - started };
}

let largeMutationBody;

// The large mutation's request body, serialized once before any timed request.
function largeMutationRequest() {
  if (largeMutationBody !== undefined) {
    return largeMutationBody;
  }

  const rows = [];

  for (let id = 0; id < rowCount; id++) {
    rows.push(makeRow(id));
  }

  const body = JSON.stringify({ input: { rows } });
  const bytes = Buffer.byteLength(body, "utf8");

  if (bytes < largePayloadBytes) {
    throw new Error(
      `The large mutation's request has ${bytes} UTF-8 bytes, expected at least ${largePayloadBytes}`,
    );
  }

  largeMutationBody = body;

  return body;
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
  largeQuery: {
    path: "/_rpc/g0000/large",
    init: (origin) => rpc(origin, null),
    // Its size is checked against the first response in measureRequests.
    check: (body) => {
      const rows = JSON.parse(body);

      if (!Array.isArray(rows) || rows.length !== rowCount) {
        return false;
      }

      for (const row of sampledRows) {
        if (!isDeepStrictEqual(rows[row.id], row)) {
          return false;
        }
      }

      return true;
    },
  },
  largeMutation: {
    path: "/_rpc/g0000/largeWrite",
    init: (origin) => ({ ...rpc(origin, null), body: largeMutationRequest() }),
    check: (body) => body === largeMutationReply,
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
  // A redirect would measure another URL than the endpoint's, so it fails the 200 check below.
  const init = { ...endpoint.init(origin), signal, redirect: "manual" };
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

  const ended = performance.now();

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

  return { ms: ended - start, ended, body };
}

// The discarded requests, then `count` sequential timed requests to one endpoint, each limited to
// timeoutMs. The large query's first (discarded) response must reach largePayloadBytes, and every
// timed response must have its exact UTF-8 length; `payloadBytes` receives the large sizes.
export async function measureRequests(origin, name, { count, timeoutMs, payloadBytes }) {
  const sized = name === "largeQuery";
  let firstBytes;

  if (name === "largeMutation") {
    largeMutationRequest();
  }

  for (let warmup = 0; warmup < warmupRequests; warmup++) {
    const { body } = await request(origin, name, timeoutMs);

    if (sized && warmup === 0) {
      firstBytes = Buffer.byteLength(body, "utf8");

      if (firstBytes < largePayloadBytes) {
        throw new Error(
          `${name} answered ${firstBytes} UTF-8 bytes, expected at least ${largePayloadBytes}`,
        );
      }
    }
  }

  const values = [];

  for (let sample = 0; sample < count; sample++) {
    const { ms, body } = await request(origin, name, timeoutMs);

    if (sized) {
      const bytes = Buffer.byteLength(body, "utf8");

      if (bytes !== firstBytes) {
        throw new Error(
          `${name} sample ${sample + 1} answered ${bytes} UTF-8 bytes, expected ${firstBytes}`,
        );
      }
    }

    values.push(ms);
  }

  if (name === "largeQuery") {
    payloadBytes.queryResponse = firstBytes;
  } else if (name === "largeMutation") {
    payloadBytes.mutationRequest = Buffer.byteLength(largeMutationBody, "utf8");
    payloadBytes.mutationResponse = Buffer.byteLength(largeMutationReply, "utf8");
  }

  return values;
}
