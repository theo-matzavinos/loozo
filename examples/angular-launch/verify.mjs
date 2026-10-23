import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

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

// The slow list handler (proof-delay) must still finish before the server renders the page.
async function html(user) {
  const response = await fetch(`${base}/todos`, {
    headers: {
      cookie: `proof-user=${user}; proof-delay=1`,
      "x-forwarded-ignored": "strip-this-native-header",
    },
  });
  const text = await response.text();

  assert.equal(response.status, 200, text);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  await writeFile(join(evidence, `${user}-ssr.html`), text);

  return text;
}

function ngState(html) {
  const match = /<script id="ng-state" type="application\/json">(.*?)<\/script>/s.exec(html);

  assert.ok(match, "native transfer state exists");

  return JSON.parse(match[1]);
}

// Angular's HTTP transfer cache entries: { u: url, b: body, … }.
function transfers(html) {
  const result = [];

  for (const entry of Object.values(ngState(html))) {
    if (entry && typeof entry === "object" && "b" in entry) {
      result.push(entry);
    }
  }

  return result;
}

// TanStack's dehydrated queries, which only include successful ones.
function dehydrated(html) {
  return ngState(html)["tanstack-query-hydration-state"]?.queries ?? [];
}

// The rendered markup without scripts, where the transfer state also carries the data.
function visible(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, "");
}

function todoList(html) {
  const match = /<ul\b[^>]*\bid="todo-list"[^>]*>([\s\S]*?)<\/ul>/.exec(visible(html));

  assert.ok(match, "the server rendered the todo list");

  return match[1];
}

function rpcPaths(entries) {
  const result = [];

  for (const entry of entries) {
    result.push(new URL(entry.url).pathname);
  }

  return result;
}

function waitForStatus(page, text) {
  return page.waitForFunction(
    (expected) => document.getElementById("status")?.textContent === expected,
    text,
  );
}

let browser;

try {
  const before = await stats();
  const [alice, bob] = await Promise.all([html("alice"), html("bob")]);
  const after = await stats();
  const requestIds = {};

  for (const [user, other, text] of [
    ["alice", "bob", alice],
    ["bob", "alice", bob],
  ]) {
    const list = todoList(text);
    const markup = visible(text);

    // The first render shows the query's data, not a pending or error state.
    assert.ok(list.includes(`${user}: Review todos`));
    assert.ok(!list.includes(`${other}: Review todos`));
    assert.ok(!markup.includes('id="list-pending"'));
    assert.ok(!markup.includes('id="list-error"'));

    // The resolver's direct call stays in Angular's HTTP transfer cache; the query is
    // TanStack's alone, so its payload isn't in the HTML twice.
    const entries = transfers(text);
    const queries = dehydrated(text);

    assert.equal(entries.length, 1);
    assert.match(entries[0].u, /\/_rpc\/session\/current$/);
    assert.equal(entries[0].b.user, user);
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].queryKey, ["launch", "todos", "list"]);
    assert.equal(queries[0].state.status, "success");
    assert.equal(queries[0].state.data.user, user);
    assert.ok(queries[0].state.data.todos.some((todo) => todo.title === `${user}: Review todos`));
    assert.equal(queries[0].state.data.requestId, entries[0].b.requestId);
    requestIds[user] = entries[0].b.requestId;
  }

  assert.notEqual(requestIds.alice, requestIds.bob);
  assert.equal(after.contexts - before.contexts, 2);
  assert.equal(after.directQueries - before.directQueries, 2);
  assert.equal(after.httpQueries, before.httpQueries);
  assert.ok(alice.includes("alice: Review todos") && !alice.includes("bob: Review todos"));
  assert.ok(bob.includes("bob: Review todos") && !bob.includes("alice: Review todos"));
  assert.ok(!alice.includes("LAUNCH_SERVER_ONLY_DATABASE_SENTINEL"));
  assert.ok(!alice.includes("x-loozo-launch-scope"));
  assert.ok(!alice.includes('"db"') && !alice.includes('"stats"'));
  checks.push(
    "concurrent HTML with a slow list handler: one context per document, the resolver and injectQuery reuse it, isolated users, each user's todos in the rendered list markup, TanStack hydration state without a duplicate HTTP transfer entry, zero loopback",
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
    "native hydration with staleTime 0 keeps the original list node and makes zero /_rpc/ requests: TanStack hydrates the query, the resolver reuses its transfer entry",
  );

  // Negative control: the same page and query mounted after stability does fetch on mount,
  // so the zero above comes from the hydration window, not from a broken capture.
  let mark = requests.length;

  await page.waitForFunction(() => typeof globalThis.__launchNavigate === "function");
  const leftPage = await page.evaluate(() => globalThis.__launchNavigate("/static"));

  assert.equal(leftPage, true);

  const returned = await page.evaluate(() => globalThis.__launchNavigate("/todos"));

  assert.equal(returned, true);
  await page.waitForSelector("#todo-list li");

  for (let attempt = 0; attempt < 50 && requests.length - mark < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.deepEqual(rpcPaths(requests.slice(mark)).sort(), [
    "/_rpc/session/current",
    "/_rpc/todos/list",
  ]);
  checks.push(
    "negative control: client navigation back to the page after stability refetches the staleTime 0 query on mount",
  );

  const identity = await page.locator("#identity").textContent();

  mark = requests.length;

  const beforeRefresh = await stats();

  await page.locator("#refresh").click();
  await waitForStatus(page, "refreshed");
  assert.notEqual(await page.locator("#identity").textContent(), identity);
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/list"]);
  assert.equal((await stats()).httpQueries - beforeRefresh.httpQueries, 1);
  checks.push("post-stability refresh refetches the query over genuine HTTP with a new context");
  assert.equal(new URL(page.url()).pathname, "/todos");

  const beforeUncached = await stats();

  mark = requests.length;
  await page.goto(`${base}/uncached`, { waitUntil: "networkidle" });
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/session/current"]);
  assert.equal(await page.locator("#uncached").textContent(), "alice");
  assert.equal((await stats()).contexts - beforeUncached.contexts, 2);
  assert.equal(requests.at(-1).method, "POST");
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
  mark = requests.length;
  await page.locator("#todo-title").press("Enter");
  await waitForStatus(page, "Adding todo…");
  assert.equal(await page.locator("#todo-title").isDisabled(), true);
  assert.equal(await page.locator("#refresh").isDisabled(), true);
  await waitForStatus(page, "Todo added");
  assert.equal(await page.locator("#todo-title").inputValue(), "");
  // The mutation's onSuccess invalidates the group key, which refetches the list.
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/add", "/_rpc/todos/list"]);

  const added = page.locator("#todo-list li").filter({ hasText: "Alice browser todo" });
  const addedId = await added.getAttribute("data-todo-id");

  assert.ok(addedId);
  assert.equal((await stats()).writes - beforeWrites.writes, 1);
  mark = requests.length;
  await added.getByRole("button", { name: "Complete Alice browser todo", exact: true }).click();
  await waitForStatus(page, "Todo completed");
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/complete", "/_rpc/todos/list"]);
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
    "native form keyboard add → complete → browser reload persists per-user state; pending controls disabled; each mutation's invalidation refetches the list over HTTP",
  );

  // A write that succeeds while its list refetch fails isn't reported as success.
  async function controlsEnabled() {
    const [title, add, refresh] = await Promise.all([
      page.locator("#todo-title").isDisabled(),
      page.locator("#add").isDisabled(),
      page.locator("#refresh").isDisabled(),
    ]);

    return !title && !add && !refresh;
  }

  async function refreshWithoutFault() {
    await context.clearCookies();
    await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);
    mark = requests.length;
    await page.locator("#refresh").click();
    await waitForStatus(page, "refreshed");
    assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/list"]);
  }

  const beforeFaultyAdd = await stats();

  await page.locator("#todo-title").fill("Alice unrefreshed todo");
  await context.addCookies([{ name: "proof-failure", value: "1", url: base }]);
  mark = requests.length;
  await page.locator("#todo-title").press("Enter");
  await waitForStatus(page, "Could not add todo. Refresh to check before retrying.");
  // An RpcError isn't retried: one write, one failed read.
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/add", "/_rpc/todos/list"]);

  const afterFaultyAdd = await stats();

  const titleAfterFaultyAdd = await page.locator("#todo-title").inputValue();
  const enabledAfterFaultyAdd = await controlsEnabled();

  assert.equal(afterFaultyAdd.writes - beforeFaultyAdd.writes, 1);
  assert.equal(titleAfterFaultyAdd, "");
  assert.equal(enabledAfterFaultyAdd, true);

  const unrefreshed = page.locator("#todo-list li").filter({ hasText: "Alice unrefreshed todo" });
  const rowsBeforeRefresh = await unrefreshed.count();

  assert.equal(rowsBeforeRefresh, 0);
  await refreshWithoutFault();

  const rowsAfterRefresh = await unrefreshed.count();

  assert.equal(rowsAfterRefresh, 1);

  const beforeFaultyComplete = await stats();

  await context.addCookies([{ name: "proof-failure", value: "1", url: base }]);
  mark = requests.length;
  await unrefreshed
    .getByRole("button", { name: "Complete Alice unrefreshed todo", exact: true })
    .click();
  await waitForStatus(page, "Could not complete todo. Refresh to check before retrying.");
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/complete", "/_rpc/todos/list"]);

  const afterFaultyComplete = await stats();

  const enabledAfterFaultyComplete = await controlsEnabled();
  const buttonsBeforeRefresh = await unrefreshed.locator("button").count();

  assert.equal(afterFaultyComplete.writes - beforeFaultyComplete.writes, 1);
  assert.equal(enabledAfterFaultyComplete, true);
  assert.equal(buttonsBeforeRefresh, 1);
  await refreshWithoutFault();

  const completedText = await unrefreshed.textContent();
  const buttonsAfterRefresh = await unrefreshed.locator("button").count();

  assert.ok(completedText.includes("Completed"));
  assert.equal(buttonsAfterRefresh, 0);
  checks.push(
    "a write whose invalidation refetch fails reports the refresh warning, not success: one write, controls recover, Refresh recovers the list after the fault is removed",
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
  await waitForStatus(bobPage, "Todo added");

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
  await waitForStatus(page, "refreshed");
  assert.ok(!(await page.locator("#todo-list").textContent()).includes("Bob browser todo"));
  await bobContext.close();
  checks.push(
    "second user's native UI add is isolated; foreign complete returns declared NOT_FOUND without modifying either user's rows",
  );

  // A query that fails during server rendering isn't dehydrated; the browser loads it itself.
  const failedContext = await browser.newContext();
  const failedRequests = [];

  await failedContext.addCookies([
    { name: "proof-user", value: "alice", url: base },
    { name: "proof-ssr-failure", value: "1", url: base },
  ]);

  const failedPage = await failedContext.newPage();

  failedPage.on("pageerror", (error) => errors.push(String(error)));
  failedPage.on("request", (request) => {
    if (request.url().includes("/_rpc/")) {
      failedRequests.push({ method: request.method(), url: request.url() });
    }
  });

  const failedDocument = await failedPage.goto(`${base}/todos`, { waitUntil: "networkidle" });
  const failedHtml = await failedDocument.text();

  await writeFile(join(evidence, "alice-ssr-failure.html"), failedHtml);
  assert.ok(failedHtml.includes('id="list-error"'));
  assert.ok(!failedHtml.includes("alice: Review todos"));
  assert.deepEqual(dehydrated(failedHtml), []);
  await failedPage.waitForSelector("#todo-list li");

  const recoveredList = await failedPage.locator("#todo-list").textContent();

  assert.ok(recoveredList.includes("alice: Review todos"));
  assert.deepEqual(rpcPaths(failedRequests), ["/_rpc/todos/list"]);
  assert.equal(failedRequests[0].method, "POST");
  await failedContext.close();
  checks.push(
    "a query that fails during server rendering isn't dehydrated and loads over HTTP in the browser",
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

  // Prerendering a page whose only RPC is an injectQuery still fails the build.
  const prerender = spawnSync("pnpm", ["exec", "ng", "run", "todos:build:prerender"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });

  await writeFile(join(evidence, "prerender.log"), `${prerender.stdout}\n${prerender.stderr}`);
  assert.notEqual(prerender.status, 0);
  assert.match(
    `${prerender.stdout}\n${prerender.stderr}`,
    /prerendering route '\/identity'[\s\S]*Launch RPC requires live request context/,
  );
  checks.push(
    "prerendering a page whose only RPC is an injectQuery fails the build through finishLaunchRendering",
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
