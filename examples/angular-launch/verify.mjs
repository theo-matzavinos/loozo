import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../packages/angular-launch/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const [base, evidence] = process.argv.slice(2);

if (!base || !evidence || !isAbsolute(evidence)) {
  throw new Error("Usage: node verify.mjs http://127.0.0.1:PORT /absolute/absent-evidence");
}

await mkdir(evidence);

const checks = [];
const requests = [];
const requestFailures = [];
const errors = [];

async function stats() {
  return (await fetch(`${base}/__proof/stats`)).json();
}

async function html(user) {
  const response = await fetch(`${base}/todos`, {
    headers: { cookie: `proof-user=${user}`, "x-forwarded-ignored": "strip-this-native-header" },
  });
  const text = await response.text();

  assert.equal(response.status, 200, text);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  await writeFile(join(evidence, `${user}-ssr.html`), text);

  return text;
}

function bodies(html) {
  const match = /<script id="ng-state" type="application\/json">(.*?)<\/script>/s.exec(html);

  assert.ok(match, "native transfer state exists");

  const result = [];

  for (const entry of Object.values(JSON.parse(match[1]))) {
    if (entry && typeof entry === "object" && "b" in entry) {
      result.push(entry.b);
    }
  }

  return result;
}

let browser;

try {
  const before = await stats();
  const [alice, bob] = await Promise.all([html("alice"), html("bob")]);
  const after = await stats();
  const aliceBodies = bodies(alice);
  const bobBodies = bodies(bob);

  assert.equal(aliceBodies.length, 2);
  assert.equal(bobBodies.length, 2);

  for (const body of aliceBodies) {
    assert.equal(body.user, "alice");
  }

  for (const body of bobBodies) {
    assert.equal(body.user, "bob");
  }

  assert.equal(new Set(aliceBodies.map((body) => body.requestId)).size, 1);
  assert.equal(new Set(bobBodies.map((body) => body.requestId)).size, 1);
  assert.notEqual(aliceBodies[0].requestId, bobBodies[0].requestId);
  assert.equal(after.contexts - before.contexts, 2);
  assert.equal(after.directQueries - before.directQueries, 2);
  assert.equal(after.httpQueries, before.httpQueries);
  assert.ok(alice.includes("alice: Review todos") && !alice.includes("bob: Review todos"));
  assert.ok(bob.includes("bob: Review todos") && !bob.includes("alice: Review todos"));
  assert.ok(!alice.includes("LAUNCH_SERVER_ONLY_DATABASE_SENTINEL"));
  assert.ok(!alice.includes("x-loozo-launch-scope"));
  assert.ok(!alice.includes('"db"') && !alice.includes('"stats"'));
  checks.push(
    "concurrent HTML: one context per document, both SSR calls reuse it, isolated users and transfer state, zero loopback",
  );

  for (const [body, cookie, status] of [
    [{ input: 7 }, "alice", 400],
    [{}, "alice", 400],
    [{ input: null }, undefined, 403],
  ]) {
    const headers = { "content-type": "application/json" };

    if (cookie) {
      headers.cookie = `proof-user=${cookie}`;
    }

    const response = await fetch(`${base}/_rpc/todos/list`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    assert.equal(response.status, status);
  }

  checks.push("genuine HTTP no-input validation and group denial");
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });

  const context = await browser.newContext();

  await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);

  const page = await context.newPage();

  page.on("request", (request) => {
    if (request.url().includes("/_rpc/")) {
      assert.equal("x-loozo-launch-scope" in request.headers(), false);
      requests.push({ method: request.method(), url: request.url(), body: request.postData() });
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("requestfailed", (request) =>
    requestFailures.push({ url: request.url(), failure: request.failure() }),
  );

  const beforeHydration = await stats();

  await page.goto(`${base}/todos`, { waitUntil: "networkidle" });
  await page.waitForSelector("#todo-list li");
  assert.equal(
    await page.evaluate(() => globalThis.__proofSsrList === document.getElementById("todo-list")),
    true,
  );
  assert.equal(requests.length, 0);

  const afterHydration = await stats();

  assert.equal(afterHydration.contexts - beforeHydration.contexts, 1);
  assert.equal(afterHydration.httpQueries, beforeHydration.httpQueries);
  checks.push(
    "native hydration keeps original list node, two POST responses reused without RPC network",
  );

  const identity = await page.locator("#identity").textContent();

  await page.locator("#refresh").click();
  await page.waitForFunction(() => document.getElementById("status")?.textContent === "refreshed");
  assert.notEqual(await page.locator("#identity").textContent(), identity);
  assert.equal(requests.length, 1);
  assert.equal((await stats()).httpQueries - afterHydration.httpQueries, 1);
  checks.push("post-stability refresh uses genuine HTTP and a new context");
  assert.equal(new URL(page.url()).pathname, "/todos");

  const beforeUncached = await stats();

  await page.goto(`${base}/uncached`, { waitUntil: "networkidle" });
  assert.equal(requests.length, 2);
  assert.equal(await page.locator("#uncached").textContent(), "alice");
  assert.equal((await stats()).contexts - beforeUncached.contexts, 2);
  assert.equal(requests[1].method, "POST");
  checks.push("transfer cache opt-out uses real hydration HTTP");
  await context.addCookies([{ name: "proof-user", value: "nobody", url: base }]);
  assert.equal(
    await page.evaluate(() => globalThis.__launchFrameworkError()),
    "RpcError:FORBIDDEN:403:null",
  );
  checks.push("generated browser callable recognizes genuine HTTP framework failure as RpcError");
  await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);
  await context.addCookies([{ name: "proof-delay", value: "1", url: base }]);
  await page.waitForFunction(() => typeof globalThis.__launchBeginCancellation === "function");

  const beforeCancellation = await stats();

  await page.evaluate(() => globalThis.__launchBeginCancellation());

  let started = await stats();

  for (
    let attempt = 0;
    attempt < 50 && started.httpQueries === beforeCancellation.httpQueries;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    started = await stats();
  }

  assert.equal(started.httpQueries - beforeCancellation.httpQueries, 1);
  assert.equal(started.finishedQueries, beforeCancellation.finishedQueries);
  await page.evaluate(() => globalThis.__launchAbort());
  assert.equal(await page.evaluate(() => globalThis.__launchCancelled), "AbortError");

  let finished = await stats();

  for (
    let attempt = 0;
    attempt < 100 && finished.finishedQueries === beforeCancellation.finishedQueries;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    finished = await stats();
  }

  assert.equal(finished.finishedQueries - beforeCancellation.finishedQueries, 1);
  assert.ok(requestFailures.some((request) => request.url.endsWith("/list")));
  await writeFile(
    join(evidence, "cancellation.json"),
    JSON.stringify({ beforeCancellation, started, finished, requestFailures }, null, 2),
  );
  checks.push(
    "generated client AbortSignal unsubscribes native HttpClient and aborts genuine HTTP; server read still finishes",
  );
  await context.clearCookies();
  await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);
  await page.goto(`${base}/todos`, { waitUntil: "networkidle" });

  const beforeWrites = await stats();

  await page.locator("#todo-title").fill("  Alice browser todo  ");
  await context.addCookies([{ name: "proof-delay", value: "1", url: base }]);
  await page.locator("#todo-title").press("Enter");
  await page.waitForFunction(
    () => document.getElementById("status")?.textContent === "Adding todo…",
  );
  assert.equal(await page.locator("#todo-title").isDisabled(), true);
  assert.equal(await page.locator("#refresh").isDisabled(), true);
  await page.waitForFunction(() => document.getElementById("status")?.textContent === "Todo added");
  assert.equal(await page.locator("#todo-title").inputValue(), "");

  const added = page.locator("#todo-list li").filter({ hasText: "Alice browser todo" });
  const addedId = await added.getAttribute("data-todo-id");

  assert.ok(addedId);
  assert.equal((await stats()).writes - beforeWrites.writes, 1);
  await added.getByRole("button", { name: "Complete Alice browser todo", exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById("status")?.textContent === "Todo completed",
  );
  assert.ok((await added.textContent()).includes("Completed"));
  assert.equal(await added.locator("button").count(), 0);
  assert.equal((await stats()).writes - beforeWrites.writes, 2);
  await context.clearCookies();
  await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);
  await page.reload({ waitUntil: "networkidle" });
  assert.ok((await added.textContent()).includes("Completed"));
  assert.equal((await stats()).writes - beforeWrites.writes, 2);
  assert.equal(
    await page.evaluate(() => globalThis.__proofSsrList === document.getElementById("todo-list")),
    true,
  );
  checks.push(
    "native form keyboard add → complete → browser reload persists per-user state; pending controls disabled and reads follow writes",
  );

  async function rpcRequest(method, input, user) {
    const headers = { "content-type": "application/json" };

    if (user) {
      headers.cookie = `proof-user=${user}`;
    }

    const response = await fetch(`${base}/_rpc/todos/${method}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input }),
    });

    return { status: response.status, body: await response.json() };
  }

  const beforeRejected = await stats();

  for (const [method, input, user, code, status] of [
    ["add", { title: " " }, "alice", "INVALID_INPUT", 400],
    ["add", { title: "x".repeat(201) }, "alice", "INVALID_INPUT", 400],
    ["complete", { id: 7 }, "alice", "INVALID_INPUT", 400],
    ["add", { title: "Denied" }, undefined, "FORBIDDEN", 403],
    ["complete", { id: addedId }, undefined, "FORBIDDEN", 403],
  ]) {
    const result = await rpcRequest(method, input, user);

    assert.equal(result.body.error.code, code);
    assert.equal(result.status, status);
  }

  const afterRejected = await stats();

  assert.equal(afterRejected.writes, beforeRejected.writes);
  assert.equal(afterRejected.addCalls, beforeRejected.addCalls);
  assert.equal(afterRejected.completeCalls, beforeRejected.completeCalls);
  assert.equal((await rpcRequest("complete", { id: addedId }, "alice")).status, 200);
  assert.equal((await stats()).writes, beforeRejected.writes);
  checks.push(
    "real HTTP invalid input/group denial never reaches mutation store; completion is idempotent",
  );

  await page.locator("#todo-title").fill("   ");
  await page.locator("#todo-title").press("Enter");
  await page.waitForFunction(
    () => document.getElementById("status")?.textContent === "Enter a title with 1–200 characters.",
  );
  assert.equal(await page.locator("#todo-title").inputValue(), "   ");
  assert.equal(await page.locator("#todo-title").isDisabled(), false);
  assert.equal((await stats()).writes, beforeRejected.writes);
  assert.deepEqual(await page.evaluate(() => globalThis.__launchCompleteMissing("absent-todo")), {
    code: "NOT_FOUND",
    id: "absent-todo",
  });
  await context.addCookies([{ name: "proof-failure", value: "1", url: base }]);
  assert.equal(
    await page.evaluate(() => globalThis.__launchFrameworkError()),
    "RpcError:INTERNAL:500:null",
  );
  await context.clearCookies();
  await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);
  checks.push(
    "generated browser declared NOT_FOUND narrows typed id payload; generic unexpected failure stays INTERNAL; failed input retained with live feedback",
  );

  const bobContext = await browser.newContext();

  await bobContext.addCookies([{ name: "proof-user", value: "bob", url: base }]);

  const bobPage = await bobContext.newPage();

  bobPage.on("pageerror", (error) => errors.push(String(error)));
  await bobPage.goto(`${base}/todos`, { waitUntil: "networkidle" });
  assert.ok(!(await bobPage.locator("#todo-list").textContent()).includes("Alice browser todo"));
  await bobPage.locator("#todo-title").fill("Bob browser todo");
  await bobPage.locator("#todo-title").press("Enter");
  await bobPage.waitForFunction(
    () => document.getElementById("status")?.textContent === "Todo added",
  );

  const aliceOnly = await rpcRequest("add", { title: "Alice isolation todo" }, "alice");

  assert.equal(aliceOnly.status, 200);
  assert.equal(aliceOnly.body.completed, false);

  const beforeForeign = await rpcRequest("list", null, "bob");
  const beforeAliceForeign = await rpcRequest("list", null, "alice");
  const foreignStats = await stats();
  const foreignId = aliceOnly.body.id;

  assert.deepEqual(
    await bobPage.evaluate((id) => globalThis.__launchCompleteMissing(id), foreignId),
    { code: "NOT_FOUND", id: foreignId },
  );
  assert.equal((await stats()).writes, foreignStats.writes);
  assert.deepEqual((await rpcRequest("list", null, "bob")).body.todos, beforeForeign.body.todos);
  assert.deepEqual(
    (await rpcRequest("list", null, "alice")).body.todos,
    beforeAliceForeign.body.todos,
  );
  assert.ok((await added.textContent()).includes("Completed"));
  await page.locator("#refresh").click();
  await page.waitForFunction(() => document.getElementById("status")?.textContent === "refreshed");
  assert.ok(!(await page.locator("#todo-list").textContent()).includes("Bob browser todo"));
  await bobContext.close();
  checks.push(
    "second user's native UI add is isolated; foreign complete returns declared NOT_FOUND without modifying either user's rows",
  );

  // One batched desktop+narrow visual pass against genuine native browser UI.
  await page.locator("#todo-title").fill("");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: join(evidence, "todos-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: join(evidence, "todos-narrow.png"), fullPage: true });
  checks.push(
    "desktop and 390 px native UI screenshots captured in one batched pass; no horizontal overflow",
  );
  assert.deepEqual(errors, []);
  await context.close();

  const directory = new URL("./dist/todos/browser/", import.meta.url);
  const browserFiles = new Set(await readdir(directory));
  const metafile = JSON.parse(
    await readFile(new URL("./dist/todos/browser-stats.json", import.meta.url), "utf8"),
  );
  let inspected = 0;
  const forbidden = [];

  for (const [output, info] of Object.entries(metafile.outputs)) {
    if (!browserFiles.has(output) || !output.endsWith(".js")) {
      continue;
    }

    inspected += 1;

    const bytes = await readFile(new URL(output, directory), "utf8");

    assert.ok(!bytes.includes("LAUNCH_SERVER_ONLY_DATABASE_SENTINEL"));

    for (const input of Object.keys(info.inputs)) {
      if (
        /context\.ts|\.server\.|\/server\/|server\.generated|\/generation\/|typescript\/|node:/.test(
          input,
        ) ||
        /routes\/.+\/rpc\.ts/.test(input)
      ) {
        forbidden.push({ output, input });
      }
    }
  }

  assert.ok(inspected > 0, "nonempty actual browser metafile selection");
  assert.deepEqual(forbidden, []);

  const serverFiles = await readdir(new URL("./dist/todos/server/", import.meta.url));
  let serverSentinel = false;

  for (const file of serverFiles) {
    if (
      file.endsWith(".mjs") &&
      (await readFile(new URL(`./dist/todos/server/${file}`, import.meta.url), "utf8")).includes(
        "LAUNCH_SERVER_ONLY_DATABASE_SENTINEL",
      )
    ) {
      serverSentinel = true;
    }
  }

  assert.equal(serverSentinel, true, "sentinel really exists in server output");
  checks.push(
    "actual browser graph excludes server/context/handler/database/generation/Node; sentinel exists only server-side",
  );
  await writeFile(
    join(evidence, "report.json"),
    JSON.stringify(
      { success: true, checks, requests, requestFailures, errors, stats: await stats() },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ success: true, checks, evidence }, null, 2));
} catch (error) {
  await writeFile(
    join(evidence, "report.json"),
    JSON.stringify(
      {
        success: false,
        checks,
        requests,
        requestFailures,
        errors,
        error: String(error),
        stack: error.stack,
      },
      null,
      2,
    ),
  );

  throw error;
} finally {
  await browser?.close();
}
