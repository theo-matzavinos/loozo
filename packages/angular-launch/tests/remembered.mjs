// Proves rpcNavigationErrors' recovery of a restored remembered search key on generated output,
// in a development and a production build of tests/fixtures/remembered: real generated routes,
// provideSearchStorage(searchCookies()), the router's own currentSearchRestore (Launch imports
// it from @loozo/angular-router/_generated) and provideActiveRouteHydration(), rendered by
// AngularNodeAppEngine and sent through Node's writer. Three rows, each entered twice with the
// cookies the first entry left:
//
// - orders: the handler refuses the remembered filter it gets as input. 200 at the fallback,
//   seeded at the original URL, and the shell's first active-route read is the fallback.
// - cached: a request-reading .context() stage refuses it. Launch keeps the refusal for the
//   request, so the retry gets it too: a rendered 404 with no Location, one stage run and
//   exactly 4 NavigationStarts; the next document answers 200.
// - missing: not found at every filter. A rendered 404 with 4 NavigationStarts, then 2.
//
// Then Chromium enters each row by document and by client navigation, twice. The app records
// its router events and navigation-error-handler calls (on the server as the x-proof-trace
// response header), and the server records every stage and handler run at /__proof/calls.
//
// Usage: node tests/remembered.mjs /absolute/owned/absent-evidence-directory
// `pnpm run test:remembered` runs it under the machine-wide gate lock; the Launch example's
// verify.mjs runs it in CI.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const example = resolve(packageDirectory, "../../examples/angular-launch");

if (process.argv.length !== 3 || !isAbsolute(process.argv[2])) {
  throw new Error("Usage: node tests/remembered.mjs /absolute/owned/absent-evidence-directory");
}

const evidence = resolve(process.argv[2]);

await mkdir(evidence);

const require = createRequire(join(packageDirectory, "package.json"));
const { chromium } = require("playwright");
const exampleManifest = JSON.parse(await readFile(join(example, "package.json"), "utf8"));
const ng = join(example, "node_modules/@angular/cli/bin/ng.js");
const deletion = (name) =>
  `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax`;
const checks = [];

async function save(name, value) {
  await writeFile(join(evidence, name), JSON.stringify(value, null, 2) + "\n");
}

// A copy of the fixture outside the evidence directory, with the Launch example's installed
// dependencies linked in, so evidence uploads never follow the links.
async function consumer() {
  const fixture = await mkdtemp(join(tmpdir(), "launch-remembered-"));

  await cp(join(packageDirectory, "tests/fixtures/remembered"), fixture, {
    recursive: true,
    filter: (path) =>
      !/(?:^|\/)(?:node_modules|dist|\.angular|out-tsc|generated)(?:\/|$)/.test(path) &&
      !path.endsWith(".generated.ts"),
  });

  for (const dependency of new Set([
    ...Object.keys(exampleManifest.dependencies),
    ...Object.keys(exampleManifest.devDependencies),
  ])) {
    const link = join(fixture, "node_modules", dependency);

    await mkdir(dirname(link), { recursive: true });
    await symlink(join(example, "node_modules", dependency), link, "dir");
  }

  return fixture;
}

function run(command, args, cwd, log) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, NG_CLI_ANALYTICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";

  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  return new Promise((done, fail) => {
    child.on("error", fail);
    child.on("close", async (code) => {
      await writeFile(join(evidence, log), output);

      if (code === 0) {
        done(output);
      } else {
        fail(new Error(`${command} ${args.join(" ")} exited with ${code}:\n${output}`));
      }
    });
  });
}

// The built server on a free loopback port; resolves once it listens.
async function serve(fixture, build) {
  const child = spawn(process.execPath, [join(fixture, `dist/${build}/server/server.mjs`)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { child, output: "" };

  child.stdout.on("data", (chunk) => (state.output += chunk));
  child.stderr.on("data", (chunk) => (state.output += chunk));
  state.closed = new Promise((done) => child.once("close", done));

  const deadline = Date.now() + 30000;

  while (!/LAUNCH_READY (\S+)/.test(state.output)) {
    if (Date.now() > deadline || child.exitCode !== null) {
      throw new Error(`The ${build} server didn't start:\n${state.output}`);
    }

    await new Promise((done) => setTimeout(done, 50));
  }

  state.base = /LAUNCH_READY (\S+)/.exec(state.output)[1];

  return state;
}

// A cookie jar for Node's fetch: request cookies by name, updated by Set-Cookie values.
function jar(cookies) {
  const values = new Map(Object.entries(cookies));

  return {
    header() {
      const pairs = [];

      for (const [name, value] of values) {
        pairs.push(`${name}=${value}`);
      }

      return pairs.join("; ");
    },
    update(setCookies) {
      for (const cookie of setCookies) {
        const [pair] = cookie.split(";");
        const separator = pair.indexOf("=");
        const name = pair.slice(0, separator);

        if (/Max-Age=0/.test(cookie)) {
          values.delete(name);
        } else {
          values.set(name, pair.slice(separator + 1));
        }
      }
    },
    entries: () => Object.fromEntries(values),
  };
}

// Runs an entry's assertions, naming the entry in a failure.
function expect(label, assertions) {
  try {
    assertions();
  } catch (error) {
    throw new Error(label, { cause: error });
  }

  checks.push(label);
}

function count(trace, kind) {
  let total = 0;

  for (const entry of trace) {
    if (entry.kind === kind) {
      total += 1;
    }
  }

  return total;
}

function shownPage(html) {
  return /<h1 id="page">([^<]*)<\/h1>/.exec(html)?.[1] ?? null;
}

function seedOf(html) {
  const state = /<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/.exec(html);

  if (!state) {
    return null;
  }

  return JSON.parse(state[1])["@loozo/angular-router:active-route"] ?? null;
}

function searchCookies(setCookies) {
  const result = [];

  for (const cookie of setCookies) {
    if (cookie.startsWith("search.")) {
      result.push(cookie);
    }
  }

  return result;
}

const rows = [
  { name: "orders", path: "/orders?origin=kept" },
  { name: "cached", path: "/cached?origin=kept" },
  { name: "missing", path: "/missing?origin=kept" },
];

// What each HTTP entry must show; `calls` are the stage and handler runs it caused.
function expectHttp(row, entry, { response, html, setCookies, trace, calls, cookies }) {
  const name = `search.${row.name}.filter`;
  const starts = count(trace, "start");
  const handlerCalls = [];

  for (const call of calls) {
    handlerCalls.push(`${call.kind}:${call.filter ?? call.refused}`);
  }

  assert.equal(response.headers.get("location"), null, "no Location");
  assert.equal(cookies.unrelated, "keep", "unrelated cookie kept");
  assert.equal(count(trace, "end"), 1, "one NavigationEnd");
  assert.equal(count(trace, "error"), 0, "no NavigationError");
  assert.equal(name in cookies, false, "remembered cookie gone after the first entry");

  if (entry === 1) {
    assert.deepEqual(searchCookies(setCookies), [deletion(name)], "exactly one deletion");
  } else {
    assert.deepEqual(searchCookies(setCookies), [], "no remembered cookie written");
  }

  if (row.name === "orders") {
    const seed = seedOf(html);

    assert.equal(response.status, 200);
    assert.equal(shownPage(html), "orders");
    assert.match(html, /filter=all pageSize=20/);
    assert.equal(seed.url, row.path, "seed at the original URL");
    assert.equal(seed.routes.length, 1);
    assert.equal(seed.routes[0].id, "src/routes/orders/route.ts", "seed owned by orders");
    assert.deepEqual(seed.routes[0].data, { orders: { filter: "all", pageSize: 20 } });
    const own = setCookies.filter((cookie) => cookie.startsWith("launch-own="));

    if (entry === 1) {
      // Procedure work repeats on the retry, the cookie it sets included.
      assert.equal(own.length, 2);
      assert.equal(starts, 3, "original, restored, retry");
      assert.equal(count(trace, "handler"), 1);
      assert.deepEqual(handlerCalls, ["handler:archived", "handler:all"]);
    } else {
      assert.equal(own.length, 1);
      assert.equal(starts, 1);
      assert.equal(count(trace, "handler"), 0);
      assert.deepEqual(handlerCalls, ["handler:all"]);
    }

    return;
  }

  if (row.name === "cached") {
    if (entry === 1) {
      assert.equal(response.status, 404);
      assert.equal(shownPage(html), "not-found", "a rendered not-found page, not a blank 404");
      assert.equal(starts, 4, "original, restored, retry, not-found");
      assert.equal(count(trace, "handler"), 2);
      assert.deepEqual(handlerCalls, ["stage:true"], "one stage run, its refusal kept");
    } else {
      assert.equal(response.status, 200);
      assert.equal(shownPage(html), "cached");
      assert.match(html, /filter=all/);
      assert.equal(starts, 1);
      assert.deepEqual(handlerCalls, ["stage:false", "handler:all"]);
    }

    return;
  }

  assert.equal(response.status, 404);
  assert.equal(shownPage(html), "not-found");

  if (entry === 1) {
    assert.equal(starts, 4, "original, restored, retry, not-found");
    assert.equal(count(trace, "handler"), 2);
    assert.deepEqual(handlerCalls, ["handler:archived", "handler:all"]);
  } else {
    assert.equal(starts, 2, "original, not-found");
    assert.equal(count(trace, "handler"), 1);
    assert.deepEqual(handlerCalls, ["handler:all"]);
  }
}

async function http(base, build, results) {
  async function calls() {
    const response = await fetch(`${base}/__proof/calls`);

    return response.json();
  }

  for (const row of rows) {
    const cookies = jar({ [`search.${row.name}.filter`]: "archived", unrelated: "keep" });
    const entries = [];

    results.push({ row: row.name, entries });

    for (const entry of [1, 2]) {
      const before = (await calls()).length;
      const response = await fetch(`${base}${row.path}`, {
        redirect: "manual",
        headers: { cookie: cookies.header() },
      });
      const html = await response.text();
      const setCookies = response.headers.getSetCookie();
      const trace = JSON.parse(response.headers.get("x-proof-trace") ?? "[]");
      const made = (await calls()).slice(before);

      cookies.update(setCookies);

      const observed = {
        entry,
        status: response.status,
        location: response.headers.get("location"),
        setCookies,
        cookies: cookies.entries(),
        page: shownPage(html),
        bytes: Buffer.byteLength(html),
        seed: seedOf(html),
        trace,
        calls: made,
      };

      entries.push(observed);
      await writeFile(join(evidence, `${build}-http-${row.name}-${entry}.html`), html);
      expect(`${build}: HTTP ${row.name} entry ${entry}`, () =>
        expectHttp(row, entry, {
          response,
          html,
          setCookies,
          trace,
          calls: made,
          cookies: observed.cookies,
        }),
      );
    }
  }
}

// Records what the page shows at every DOM change and frame, so a flash would be seen.
function sampleFrames() {
  globalThis.proofFrames = [];

  const sample = () => {
    const value = {
      address: location.pathname + location.search,
      page: document.querySelector("#page")?.textContent ?? null,
      values: document.querySelector("#values")?.textContent ?? null,
    };
    const last = globalThis.proofFrames.at(-1);

    if (
      !last ||
      last.address !== value.address ||
      last.page !== value.page ||
      last.values !== value.values
    ) {
      globalThis.proofFrames.push(value);
    }
  };

  new MutationObserver(sample).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  const frame = () => {
    sample();
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

async function browserRows(base, build, browser, results) {
  for (const mode of ["document", "client"]) {
    for (const row of rows) {
      const name = `search.${row.name}.filter`;
      const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
      const errors = [];
      const diagnostics = [];
      const rpcs = [];
      const entries = [];

      results.push({ mode, row: row.name, entries, errors, diagnostics });
      await context.addInitScript(sampleFrames);
      context.on("page", (opened) => {
        opened.on("pageerror", (error) => errors.push(error.message));
        opened.on("console", (message) => {
          if (message.type() === "error" || message.type() === "warning") {
            diagnostics.push({ type: message.type(), text: message.text() });
          }
        });
        opened.on("response", (response) => {
          const request = response.request();

          if (new URL(response.url()).pathname.startsWith("/_rpc/")) {
            rpcs.push({
              path: new URL(response.url()).pathname,
              input: JSON.parse(request.postData() ?? "{}").input ?? null,
              status: response.status(),
            });
          }
        });
      });

      let page = await context.newPage();
      const idle = () =>
        page.waitForFunction(() => globalThis.proof?.idle() === true, null, { timeout: 15000 });

      if (mode === "client") {
        await page.goto(`${base}/outside`);
        await idle();
      }

      await context.addCookies([
        { name, value: "archived", url: base },
        { name: "unrelated", value: "keep", url: base },
      ]);

      for (const entry of [1, 2]) {
        const rpcsBefore = rpcs.length;
        let status = null;
        let html = null;
        let traceBefore = 0;

        if (mode === "document") {
          // Each entry in a new tab of the same browser: going to the same URL in one tab
          // reloads it, and a reload keeps history.state, whose router URL Angular restores.
          if (entry === 2) {
            await page.close();
            page = await context.newPage();
          }

          const response = await page.goto(`${base}${row.path}`);

          status = response.status();
          html = await response.text();
          await writeFile(join(evidence, `${build}-document-${row.name}-${entry}.html`), html);
        } else {
          traceBefore = await page.evaluate(() => {
            globalThis.proofFrames = [];

            return globalThis.proof.trace.length;
          });
          await page.evaluate(
            (path) => globalThis.proof.navigate(path, { state: { proof: "preserved" } }),
            row.path,
          );
        }

        await idle();
        await page.evaluate(
          () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
        );

        const state = await page.evaluate(
          (from) => ({
            address: location.pathname + location.search,
            page: document.querySelector("#page")?.textContent ?? null,
            values: document.querySelector("#values")?.textContent ?? null,
            first: globalThis.proof.first,
            active: globalThis.proof.active(),
            trace: globalThis.proof.trace.slice(from),
            frames: globalThis.proofFrames,
            historyState: history.state,
          }),
          traceBefore,
        );
        const cookies = await context.cookies();
        const observed = {
          entry,
          status,
          seed: null,
          ...state,
          rpcs: rpcs.slice(rpcsBefore),
          cookies: cookies.map((cookie) => `${cookie.name}=${cookie.value}`),
        };

        if (html !== null) {
          observed.seed = seedOf(html);
        }

        entries.push(observed);
        await page.screenshot({
          path: join(evidence, `${build}-${mode}-${row.name}-${entry}.png`),
        });
        expect(`${build}: Chromium ${mode} ${row.name} entry ${entry}`, () =>
          expectBrowser(row, mode, entry, observed),
        );

        if (mode === "client") {
          await page.evaluate(() => globalThis.proof.navigate("/outside"));
          await idle();
        }
      }

      expect(`${build}: Chromium ${mode} ${row.name} without page or hydration errors`, () => {
        assert.deepEqual(errors, []);

        for (const diagnostic of diagnostics) {
          assert.doesNotMatch(diagnostic.text, /NG0\d|hydration/i);
        }
      });
      await context.close();
    }
  }
}

function rpcSummary(rpcs) {
  const result = [];

  for (const rpc of rpcs) {
    result.push(`${rpc.path} ${rpc.input?.filter} ${rpc.status}`);
  }

  return result;
}

function expectBrowser(row, mode, entry, observed) {
  const name = `search.${row.name}.filter`;
  const rpcs = rpcSummary(observed.rpcs);
  const read = `/_rpc/${row.name}/read`;

  assert.equal(observed.address, row.path, "the original address");
  assert.ok(observed.cookies.includes("unrelated=keep"), "unrelated cookie kept");
  assert.equal(
    observed.cookies.some((cookie) => cookie.startsWith(`${name}=`)),
    false,
    "remembered cookie deleted",
  );

  if (mode === "document") {
    // No restore and no recovery in the browser: the server already did both.
    for (const step of observed.trace) {
      assert.doesNotMatch(step.url, /filter=/, "no browser restore");
    }
  }

  // The retry keeps the caller's state; the terminal not-found never did (unchanged).
  if (mode === "client" && row.name !== "missing") {
    assert.equal(observed.historyState.proof, "preserved", "caller state kept");
  }

  if (row.name === "orders") {
    assert.equal(observed.page, "orders");
    assert.equal(observed.values, "filter=all pageSize=20");
    assert.deepEqual(observed.active, { owner: "orders", search: { filter: "all", pageSize: 20 } });

    for (const frame of observed.frames) {
      assert.notEqual(frame.page, "not-found", "never shows not-found");
      assert.doesNotMatch(frame.values ?? "", /archived/, "never shows the refused filter");
    }

    if (mode === "document") {
      assert.equal(observed.status, 200);
      assert.equal(count(observed.trace, "start"), 1);
      // The server seed at the original URL and the shell's first read, before the first
      // successful navigation, agree on the fallback and on the owner.
      assert.equal(observed.seed.url, row.path);
      assert.equal(observed.seed.routes[0].id, "src/routes/orders/route.ts");
      assert.deepEqual(observed.first, {
        owner: "orders",
        search: { filter: "all", pageSize: 20 },
        beforeFirstSuccess: true,
      });
      assert.equal(count(observed.trace, "handler"), 0);
      assert.deepEqual(rpcs, [], "the transferred result, no browser RPC");
    } else if (entry === 1) {
      assert.deepEqual(rpcs, [`${read} archived 404`, `${read} all 200`]);
      assert.equal(count(observed.trace, "start"), 3, "original, restored, retry");
      assert.equal(count(observed.trace, "handler"), 1);
    } else {
      assert.deepEqual(rpcs, [`${read} all 200`]);
      assert.equal(count(observed.trace, "handler"), 0);
    }

    return;
  }

  if (row.name === "cached") {
    // The browser's own request scope runs the stage after the deletion, so it accepts; a
    // first document stays HTTP 404 while hydration shows the fallback page (documented).
    assert.equal(observed.page, "cached");
    assert.equal(observed.values, "filter=all");

    if (mode === "document") {
      if (entry === 1) {
        const shown = observed.frames.find((frame) => frame.page !== null);

        assert.equal(observed.status, 404);
        assert.equal(shown?.page, "not-found", "the rendered 404 first");
        assert.deepEqual(rpcs, [`${read} all 200`], "hydration's fresh request");
      } else {
        assert.equal(observed.status, 200);
        assert.deepEqual(observed.first, {
          owner: "cached",
          search: { filter: "all" },
          beforeFirstSuccess: true,
        });
        assert.deepEqual(rpcs, []);
      }
    } else if (entry === 1) {
      assert.deepEqual(rpcs, [`${read} archived 404`, `${read} all 200`]);
      assert.equal(count(observed.trace, "start"), 3, "original, restored, retry");
    } else {
      assert.deepEqual(rpcs, [`${read} all 200`]);
    }

    return;
  }

  assert.equal(observed.page, "not-found");

  for (const frame of observed.frames) {
    assert.notEqual(frame.page, "missing", "never shows the missing page");
  }

  if (mode === "document") {
    assert.equal(observed.status, 404);
    // Hydration asks once more, at the fallback, and is refused again: no restore, no retry.
    assert.deepEqual(rpcs, [`${read} all 404`]);
    assert.equal(count(observed.trace, "start"), 2, "original, not-found");
    assert.equal(count(observed.trace, "handler"), 1);
  } else if (entry === 1) {
    assert.deepEqual(rpcs, [`${read} archived 404`, `${read} all 404`]);
    assert.equal(count(observed.trace, "start"), 4, "original, restored, retry, not-found");
    assert.equal(count(observed.trace, "handler"), 2);
  } else {
    assert.deepEqual(rpcs, [`${read} all 404`]);
    assert.equal(count(observed.trace, "start"), 2, "original, not-found");
    assert.equal(count(observed.trace, "handler"), 1);
  }
}

const fixture = await consumer();
let browser;
let passed = false;

try {
  await run(
    process.execPath,
    [ng, "build", "--configuration", "development"],
    fixture,
    "build-development.log",
  );
  await run(
    process.execPath,
    [ng, "build", "--configuration", "production"],
    fixture,
    "build-production.log",
  );
  browser = await chromium.launch();

  for (const build of ["development", "production"]) {
    const server = await serve(fixture, build);
    const results = { http: [], browser: [] };

    try {
      await http(server.base, build, results.http);
      await browserRows(server.base, build, browser, results.browser);
    } finally {
      await save(`${build}.json`, results);
      server.child.kill();
      await server.closed;
      await writeFile(join(evidence, `${build}-server.log`), server.output);
    }
  }

  passed = true;
} finally {
  await browser?.close();
  await save("report.json", { success: passed, checks, fixture });

  // Keep a failed build's copy for inspection.
  if (passed) {
    await rm(fixture, { recursive: true, force: true });
  }
}

console.log(`Remembered search recovery: PASS (${checks.length} checks)`);
