import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";

const require = createRequire(
  new URL("../../packages/angular-launch/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const [evidence, extra] = process.argv.slice(2);

if (!evidence || extra !== undefined || !isAbsolute(evidence)) {
  throw new Error("Usage: node verify.mjs /absolute/absent-evidence");
}

await mkdir(evidence);

// Starts a built server entry on a free loopback port and resolves once it is listening; the
// server's output goes to `log` in the evidence directory, and `output()` returns it so far.
async function serve(entry, log) {
  const output = createWriteStream(join(evidence, log));
  const server = spawn(process.execPath, [fileURLToPath(entry)], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let all = "";

  server.stdout.pipe(output);
  server.stderr.pipe(output);
  server.stdout.on("data", (chunk) => (all += chunk));
  server.stderr.on("data", (chunk) => (all += chunk));

  const base = await new Promise((resolve, reject) => {
    let text = "";

    server.once("exit", (code) => reject(new Error(`server for ${log} exited with ${code}`)));
    server.stdout.on("data", (chunk) => {
      text += chunk;

      const ready = /LAUNCH_READY (\S+)/.exec(text);

      if (ready) {
        resolve(ready[1]);
      }
    });
  });

  return { base, server, output: () => all };
}

const built = await serve(new URL("./dist/todos/server/server.mjs", import.meta.url), "server.log");
const base = built.base;

// Node's fetch sends neither Origin nor Sec-Fetch-Site, so RPC calls from here name the
// app's own origin, as any non-browser caller must.
const origin = new URL(base).origin;

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

async function rpcRequest(method, input, user) {
  const headers = { "content-type": "application/json", origin };

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

// A websocket upgrade over raw HTTP: the status and body of a refusal, or 101.
function rawUpgrade(path, headers) {
  return new Promise((resolve, reject) => {
    const sent = httpRequest(`${base}${path}`, {
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
        ...headers,
      },
    });

    sent.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode, body: "" });
    });
    sent.on("response", async (response) => {
      let body = "";

      for await (const chunk of response) {
        body += chunk;
      }

      resolve({ status: response.statusCode, body });
    });
    sent.on("error", reject);
    sent.end();
  });
}

// Holds the page's next call to a todos procedure until release().
async function hold(page, procedure) {
  let arrive;
  let release;
  const reached = new Promise((resolve) => {
    arrive = resolve;
  });
  const released = new Promise((resolve) => {
    release = resolve;
  });

  await page.route(
    `**/_rpc/todos/${procedure}`,
    async (route) => {
      arrive();
      await released;
      await route.continue();
    },
    { times: 1 },
  );

  return { reached, release };
}

function todoRow(page, title) {
  return page.locator("#todo-list li").filter({ hasText: title });
}

function todoTitles(page) {
  return page.locator("#todo-list li > span:first-child").allTextContents();
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

  // Response control: cookies and headers on the RPC response; during server rendering
  // cookies go on the page response and headers are dropped.
  const sessionCall = await fetch(`${base}/_rpc/session/current`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: "proof-user=alice" },
    body: JSON.stringify({ input: null }),
  });
  const sessionBody = await sessionCall.json();

  assert.equal(sessionCall.status, 200);
  assert.deepEqual(sessionCall.headers.getSetCookie(), [
    `proof-seen=${sessionBody.requestId}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  ]);
  assert.match(sessionCall.headers.get("server-timing") ?? "", /^rpc;dur=\d+\.\d$/);
  assert.equal(sessionCall.headers.get("cache-control"), "private, no-store");

  // Signed out, signInFirst redirects before the handler sets the cookie.
  const refused = await fetch(`${base}/_rpc/session/current`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ input: null }),
  });

  assert.equal(refused.status, 303);
  assert.equal(refused.headers.get("location"), null);
  assert.deepEqual(refused.headers.getSetCookie(), []);
  assert.match(refused.headers.get("server-timing") ?? "", /^rpc;dur=/);

  const renderedPage = await fetch(`${base}/todos`, { headers: { cookie: "proof-user=alice" } });
  const pageCookies = renderedPage.headers.getSetCookie();

  assert.equal(renderedPage.status, 200);
  await renderedPage.text();
  assert.equal(pageCookies.length, 1);
  assert.match(pageCookies[0], /^proof-seen=\d+; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  assert.equal(renderedPage.headers.get("server-timing"), null);
  checks.push(
    "response control: an RPC carries its cookie and server-timing header, also when redirected (header only), and a rendered page carries the cookie its resolver's query set but not the header",
  );

  const beforeDenial = await stats();

  // The group's signedIn middleware runs before validation, so a caller without a user
  // gets FORBIDDEN even for invalid input; a malformed envelope fails before it runs.
  for (const [body, cookie, status] of [
    [{ input: 7 }, "alice", 400],
    [{}, "alice", 400],
    [{ input: null }, undefined, 403],
    [{ input: 7 }, undefined, 403],
  ]) {
    const headers = { "content-type": "application/json", origin };

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

  assert.equal((await stats()).signedInChecks - beforeDenial.signedInChecks, 3);
  checks.push(
    "genuine HTTP no-input validation and group middleware denial, before validation for callers without a user",
  );

  // Outcomes over HTTP are frames, never followed: a 303 without Location, or a 404.
  for (const [path, input, cookie, status, body] of [
    ["/_rpc/todo/get", { id: "missing" }, "alice", 404, { notFound: null }],
    ["/_rpc/todo/get", { id: "bob-initial" }, "alice", 404, { notFound: null }],
    ["/_rpc/todo/get", { id: "alice-initial" }, undefined, 303, { redirect: { to: "/sign-in" } }],
    ["/_rpc/session/current", null, undefined, 303, { redirect: { to: "/sign-in" } }],
  ]) {
    const headers = { "content-type": "application/json", origin };

    if (cookie) {
      headers.cookie = `proof-user=${cookie}`;
    }

    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input }),
    });

    assert.equal(response.status, status, path);
    assert.equal(response.headers.get("location"), null, path);
    assert.deepEqual(await response.json(), body, path);
  }

  // During server rendering, rpcNavigationErrors turns them into a 302 or the not-found page.
  const signedOutPage = await fetch(`${base}/todos`, { redirect: "manual" });

  assert.equal(signedOutPage.status, 302);
  assert.equal(signedOutPage.headers.get("location"), "/sign-in");

  for (const [user, id, status, title] of [
    ["alice", "alice-initial", 200, '<h1 id="todo-title">alice: Review todos</h1>'],
    ["alice", "bob-initial", 404, '<h1 id="not-found-title">Not found</h1>'],
    ["alice", "missing", 404, '<h1 id="not-found-title">Not found</h1>'],
  ]) {
    const response = await fetch(`${base}/todo/${id}`, {
      headers: { cookie: `proof-user=${user}` },
      redirect: "manual",
    });
    const text = await response.text();

    assert.equal(response.status, status, id);
    assert.ok(text.includes(title), id);
  }

  checks.push(
    "redirect() and notFound() are 303 and 404 frames over HTTP; server-rendered pages answer 302 to /sign-in for visitors without a user and the not-found page with 404 for foreign or missing todos",
  );

  const beforeRefused = await stats();

  for (const [headers, label] of [
    [{}, "neither Origin nor Sec-Fetch-Site"],
    [{ "sec-fetch-site": "cross-site", origin }, "Sec-Fetch-Site cross-site"],
    [{ origin: "https://evil.example" }, "foreign Origin"],
  ]) {
    const response = await fetch(`${base}/_rpc/todos/list`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "proof-user=alice", ...headers },
      body: JSON.stringify({ input: null }),
    });
    const body = await response.json();

    assert.equal(response.status, 403, label);
    assert.equal(body.error.code, "FORBIDDEN", label);
  }

  // fetch can't override Host, so this sends a foreign one through node:http.
  const foreignHost = await new Promise((resolve, reject) => {
    const sent = httpRequest(
      `${base}/_rpc/todos/list`,
      {
        method: "POST",
        headers: {
          host: "evil.example",
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
          cookie: "proof-user=alice",
        },
      },
      (response) => {
        let text = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({ status: response.statusCode, text });
        });
      },
    );

    sent.on("error", reject);
    sent.end(JSON.stringify({ input: null }));
  });

  assert.deepEqual(foreignHost, { status: 400, text: "Host not allowed" });

  const afterRefused = await stats();

  assert.equal(afterRefused.contexts, beforeRefused.contexts);
  assert.equal(afterRefused.httpQueries, beforeRefused.httpQueries);
  checks.push(
    "built server refuses RPCs with neither Origin nor Sec-Fetch-Site, a cross-site Sec-Fetch-Site or a foreign Origin (FORBIDDEN), and a foreign Host (400 text), creating no context",
  );
  browser = await chromium.launch({ headless: true });

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

  // A server-rendered not-found page keeps its URL; hydration calls the procedure again,
  // since only successes transfer. Client navigation handles both outcomes the same way.
  // Chromium logs each 404 response itself: the page and two of the todo calls.
  const consoleErrors = [];
  let notFoundResponses = 0;
  const onConsole = (message) => {
    if (message.type() !== "error") {
      return;
    }

    if (message.text().endsWith("status of 404 (Not Found)")) {
      notFoundResponses += 1;

      return;
    }

    consoleErrors.push(message.text());
  };

  page.on("console", onConsole);
  mark = requests.length;

  const missingPage = await page.goto(`${base}/todo/missing`, { waitUntil: "networkidle" });

  assert.equal(missingPage.status(), 404);
  await page.waitForSelector("#not-found-title");
  assert.equal(new URL(page.url()).pathname, "/todo/missing");
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todo/get"]);
  await page.waitForFunction(() => typeof globalThis.__launchNavigate === "function");
  await page.evaluate(() => globalThis.__launchNavigate("/todo/alice-initial"));
  await page.waitForSelector("#todo-title");
  await page.evaluate(() => globalThis.__launchNavigate("/todo/bob-initial"));
  await page.waitForSelector("#not-found-title");
  assert.equal(new URL(page.url()).pathname, "/todo/bob-initial");
  await context.addCookies([{ name: "proof-user", value: "nobody", url: base }]);
  await page.evaluate(() => globalThis.__launchNavigate("/todo/alice-initial"));
  await page.waitForSelector("#sign-in-title");
  assert.equal(new URL(page.url()).pathname, "/sign-in");
  await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);
  page.off("console", onConsole);
  assert.deepEqual(consoleErrors, []);
  assert.equal(notFoundResponses, 3);
  checks.push(
    "a server-rendered 404 page hydrates at its URL with one /_rpc/todo/get call; client navigation renders not-found at the requested URL and follows the sign-in redirect",
  );
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
  assert.equal(finished.abortedQueries - beforeCancellation.abortedQueries, 1);
  assert.ok(requestFailures.some((request) => request.url.endsWith("/list")));
  await writeFile(
    join(evidence, "cancellation.json"),
    JSON.stringify({ beforeCancellation, started, finished, requestFailures }, null, 2),
  );
  checks.push(
    "generated client AbortSignal unsubscribes native HttpClient and aborts genuine HTTP; the handler's signal aborts through the server entry's wiring, and the read still finishes",
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
  // The add invalidates nothing itself: config.ts's MutationCache reads the list again.
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/add", "/_rpc/todos/list"]);

  const added = todoRow(page, "Alice browser todo");
  const addedId = await added.getAttribute("data-todo-id");

  assert.ok(addedId);
  assert.equal((await stats()).writes - beforeWrites.writes, 1);

  // Optimistic: the row shows Completed while the write is still on its way, and the
  // other controls stay usable.
  const heldComplete = await hold(page, "complete");

  mark = requests.length;
  await added.getByRole("button", { name: "Complete Alice browser todo", exact: true }).click();
  await heldComplete.reached;
  await added.locator(".completed").waitFor();
  assert.equal(await page.locator("#add").isDisabled(), false);
  // The row and Refresh wait for the write: another write to the row, or a read, would
  // undo its optimistic state.
  const addedDelete = added.getByRole("button", { name: "Delete Alice browser todo", exact: true });

  assert.equal(await addedDelete.isDisabled(), true);
  assert.equal(await page.locator("#refresh").isDisabled(), true);
  heldComplete.release();
  await waitForStatus(page, "Todo completed");
  assert.equal(await addedDelete.isDisabled(), false);
  assert.equal(await page.locator("#refresh").isDisabled(), false);
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/complete", "/_rpc/todos/list"]);
  assert.equal(await added.getByRole("button", { name: /^Complete / }).count(), 0);
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
    "native form keyboard add → optimistic complete → browser reload persists per-user state; add disables the form while pending; complete shows its row before the response and leaves the controls usable; the app's MutationCache reads the list again after each write",
  );

  async function refreshWithoutFault() {
    await context.clearCookies();
    await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);
    mark = requests.length;
    await page.locator("#refresh").click();
    await waitForStatus(page, "refreshed");
    assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/list"]);
  }

  const seeded = {};

  for (const title of [
    "Alice gone todo",
    "Alice removed elsewhere",
    "Alice kept todo",
    "Alice first todo",
    "Alice second todo",
    "Alice unrefreshed todo",
    "Alice overlap todo",
  ]) {
    const result = await rpcRequest("add", { title }, "alice");

    assert.equal(result.status, 200);
    seeded[title] = result.body.id;
  }

  await refreshWithoutFault();

  // The declared error decides the rollback. A todo deleted elsewhere leaves the list as soon
  // as its write answers NOT_FOUND, before the list is read again.
  const gone = todoRow(page, "Alice gone todo");

  assert.equal(
    (await rpcRequest("remove", { id: seeded["Alice gone todo"] }, "alice")).status,
    200,
  );

  let heldWrite = await hold(page, "complete");
  let heldRead = await hold(page, "list");

  mark = requests.length;
  await gone.getByRole("button", { name: "Complete Alice gone todo", exact: true }).click();
  await heldWrite.reached;
  await gone.locator(".completed").waitFor();
  heldWrite.release();
  await heldRead.reached;
  await gone.waitFor({ state: "detached" });
  heldRead.release();
  await waitForStatus(page, "This todo no longer exists.");
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/complete", "/_rpc/todos/list"]);

  const removedElsewhere = todoRow(page, "Alice removed elsewhere");

  assert.equal(
    (await rpcRequest("remove", { id: seeded["Alice removed elsewhere"] }, "alice")).status,
    200,
  );
  heldWrite = await hold(page, "remove");
  heldRead = await hold(page, "list");
  mark = requests.length;
  await removedElsewhere
    .getByRole("button", { name: "Delete Alice removed elsewhere", exact: true })
    .click();
  await heldWrite.reached;
  await removedElsewhere.waitFor({ state: "detached" });
  heldWrite.release();
  await heldRead.reached;
  assert.equal(await removedElsewhere.count(), 0);
  heldRead.release();
  await waitForStatus(page, "This todo no longer exists.");
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/remove", "/_rpc/todos/list"]);

  // Any other failure puts the row back where it was before the list is read again.
  const kept = todoRow(page, "Alice kept todo");
  const titlesBeforeFailure = await todoTitles(page);
  const beforeAbortedDelete = await stats();

  await page.route("**/_rpc/todos/remove", (route) => route.abort(), { times: 1 });
  heldRead = await hold(page, "list");
  mark = requests.length;
  await kept.getByRole("button", { name: "Delete Alice kept todo", exact: true }).click();
  await heldRead.reached;
  assert.deepEqual(await todoTitles(page), titlesBeforeFailure);
  heldRead.release();
  await waitForStatus(page, "Could not delete todo. Try again.");
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/remove", "/_rpc/todos/list"]);
  assert.equal((await stats()).removeCalls, beforeAbortedDelete.removeCalls);

  mark = requests.length;
  await kept.getByRole("button", { name: "Delete Alice kept todo", exact: true }).click();
  await waitForStatus(page, "Todo deleted");
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/remove", "/_rpc/todos/list"]);
  assert.equal(await kept.count(), 0);
  checks.push(
    "optimistic writes roll back by declared error: complete or delete of a todo deleted elsewhere drops its row on NOT_FOUND, before the list is read again; a failed delete puts the row back in place; a delete removes the row",
  );

  // Writes in one task share a scope: the server gets them in order, the page shows both at
  // once, and the list is read once, after the last.
  const beforeConcurrent = await stats();

  mark = requests.length;
  await page.evaluate(() => {
    document.querySelector('[aria-label="Complete Alice first todo"]').click();
    document.querySelector('[aria-label="Delete Alice second todo"]').click();
  });
  await todoRow(page, "Alice second todo").waitFor({ state: "detached" });
  assert.ok((await todoRow(page, "Alice first todo").textContent()).includes("Completed"));
  await waitForStatus(page, "Todo deleted");
  assert.deepEqual(rpcPaths(requests.slice(mark)), [
    "/_rpc/todos/complete",
    "/_rpc/todos/remove",
    "/_rpc/todos/list",
  ]);
  assert.equal((await stats()).writes - beforeConcurrent.writes, 2);

  // Writes in different scopes, settling together, still read the list once, after both.
  const overlap = todoRow(page, "Alice overlap todo");
  const heldAdd = await hold(page, "add");
  const heldOverlap = await hold(page, "complete");

  mark = requests.length;
  await page.locator("#todo-title").fill("Alice overlapping add");
  await page.locator("#todo-title").press("Enter");
  await heldAdd.reached;
  await overlap.getByRole("button", { name: "Complete Alice overlap todo", exact: true }).click();
  await heldOverlap.reached;
  heldAdd.release();
  heldOverlap.release();
  await page.waitForFunction(() => document.getElementById("refresh")?.disabled === false);
  assert.deepEqual(rpcPaths(requests.slice(mark)), [
    "/_rpc/todos/add",
    "/_rpc/todos/complete",
    "/_rpc/todos/list",
  ]);
  assert.equal(await todoRow(page, "Alice overlapping add").count(), 1);
  assert.ok((await overlap.textContent()).includes("Completed"));
  checks.push(
    "two optimistic writes started together reach the server in order and the list is read once, after the last; an add and a complete in different scopes settling together also read it once, after both; a row's controls and Refresh are disabled while a write to it is pending",
  );

  // A write whose list read fails keeps its row and says the list may be stale.
  const unrefreshed = todoRow(page, "Alice unrefreshed todo");
  const beforeFaultyComplete = await stats();

  await context.addCookies([{ name: "proof-failure", value: "1", url: base }]);
  mark = requests.length;

  // The status already reads "Todo completed": wait for the failed read instead.
  const failedRead = page.waitForResponse((response) => response.url().endsWith("/todos/list"));

  await unrefreshed
    .getByRole("button", { name: "Complete Alice unrefreshed todo", exact: true })
    .click();
  await failedRead;
  await waitForStatus(page, "Todo completed");
  // An RpcError isn't retried: one write, one failed read.
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/complete", "/_rpc/todos/list"]);
  assert.equal((await stats()).writes - beforeFaultyComplete.writes, 1);
  assert.ok((await unrefreshed.textContent()).includes("Completed"));
  await page.locator("#list-stale").waitFor();
  await refreshWithoutFault();
  assert.equal(await page.locator("#list-stale").count(), 0);
  assert.ok((await unrefreshed.textContent()).includes("Completed"));

  // An add isn't optimistic: its row appears with the next successful read.
  const unread = todoRow(page, "Alice unread todo");
  const beforeFaultyAdd = await stats();

  await page.locator("#todo-title").fill("Alice unread todo");
  await context.addCookies([{ name: "proof-failure", value: "1", url: base }]);
  mark = requests.length;
  await page.locator("#todo-title").press("Enter");
  await waitForStatus(page, "Todo added");
  assert.deepEqual(rpcPaths(requests.slice(mark)), ["/_rpc/todos/add", "/_rpc/todos/list"]);
  assert.equal((await stats()).writes - beforeFaultyAdd.writes, 1);
  assert.equal(await page.locator("#todo-title").inputValue(), "");
  assert.equal(await unread.count(), 0);
  await page.locator("#list-stale").waitFor();
  await refreshWithoutFault();
  assert.equal(await unread.count(), 1);
  assert.equal(await page.locator("#list-stale").count(), 0);
  checks.push(
    "a write whose list read fails reports success with a stale-list notice: complete keeps its optimistic row, add's row waits for Refresh, which clears the notice once the fault is removed",
  );

  // A click on the server-rendered page before the app runs is replayed after hydration.
  const earlyContext = await browser.newContext();
  const earlyRequests = [];

  await earlyContext.addCookies([{ name: "proof-user", value: "alice", url: base }]);
  assert.equal((await rpcRequest("add", { title: "Alice early todo" }, "alice")).status, 200);

  const earlyPage = await earlyContext.newPage();

  earlyPage.on("pageerror", (error) => errors.push(String(error)));
  earlyPage.on("request", (request) => {
    if (request.url().includes("/_rpc/")) {
      earlyRequests.push({ method: request.method(), url: request.url() });
    }
  });
  // Hold the app's scripts back, so the click lands before bootstrap.
  await earlyPage.route(/\/(main|chunk)[^/]*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await earlyPage.goto(`${base}/todos`, { waitUntil: "commit" });

  const early = todoRow(earlyPage, "Alice early todo");
  const earlyButton = early.getByRole("button", { name: "Complete Alice early todo", exact: true });

  await earlyButton.waitFor();
  assert.equal(await earlyPage.evaluate(() => globalThis.__launchStable), undefined);
  await earlyButton.click();
  await waitForStatus(earlyPage, "Todo completed");
  assert.ok((await early.textContent()).includes("Completed"));
  assert.deepEqual(rpcPaths(earlyRequests), ["/_rpc/todos/complete", "/_rpc/todos/list"]);
  await earlyContext.close();
  checks.push(
    "a click before the app bootstraps is replayed after hydration: one write and one list read, with no load-time read",
  );

  const beforeRejected = await stats();

  const titleIssues = {
    issues: [{ path: ["title"], message: "Title must contain 1–200 characters" }],
  };

  for (const [method, input, user, code, status, data] of [
    ["add", { title: " " }, "alice", "INVALID_INPUT", 400, titleIssues],
    ["add", { title: "x".repeat(201) }, "alice", "INVALID_INPUT", 400, titleIssues],
    [
      "complete",
      { id: 7 },
      "alice",
      "INVALID_INPUT",
      400,
      { issues: [{ path: ["id"], message: "Todo id required" }] },
    ],
    ["add", { title: "Denied" }, undefined, "FORBIDDEN", 403, null],
    ["complete", { id: addedId }, undefined, "FORBIDDEN", 403, null],
    ["remove", { id: addedId }, undefined, "FORBIDDEN", 403, null],
  ]) {
    const result = await rpcRequest(method, input, user);

    assert.equal(result.body.error.code, code);
    assert.equal(result.status, status);
    assert.deepEqual(result.body.error.data, data);
  }

  const afterRejected = await stats();

  assert.equal(afterRejected.writes, beforeRejected.writes);
  assert.equal(afterRejected.addCalls, beforeRejected.addCalls);
  assert.equal(afterRejected.completeCalls, beforeRejected.completeCalls);
  assert.equal(afterRejected.removeCalls, beforeRejected.removeCalls);
  assert.equal((await rpcRequest("complete", { id: addedId }, "alice")).status, 200);
  assert.equal((await stats()).writes, beforeRejected.writes);
  checks.push(
    "real HTTP invalid input (with path-indexed issues)/group denial never reaches mutation store; completion is idempotent",
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

  // Streams: /live renders from a query on the server, then follows a stream in the browser.
  const liveHtml = await (
    await fetch(`${base}/live`, { headers: { cookie: "proof-user=alice" } })
  ).text();

  await writeFile(join(evidence, "alice-live-ssr.html"), liveHtml);
  assert.ok(liveHtml.includes("alice: Review todos"));

  const livePage = await context.newPage();

  livePage.on("pageerror", (error) => errors.push(String(error)));
  await livePage.goto(`${base}/live`);
  await livePage.waitForFunction(
    () => document.getElementById("live-status")?.textContent === "Live",
  );
  assert.equal(await livePage.evaluate(() => globalThis.__launchStable), true);

  const liveTitle = `Streamed ${crypto.randomUUID()}`;
  const liveAdd = await fetch(`${base}/_rpc/todos/add`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie: "proof-user=alice" },
    body: JSON.stringify({ input: { title: liveTitle } }),
  });

  assert.equal(liveAdd.status, 200);
  await livePage.waitForFunction(
    (title) => document.getElementById("live-list")?.textContent.includes(title),
    liveTitle,
  );
  checks.push(
    "a stream page renders its query on the server, follows the stream with connect() after hydration without keeping the app unstable, and shows a write from elsewhere",
  );

  // Channels: the page's add channel opens with connect(), adds over the socket, and the
  // stream shows the result.
  await livePage.waitForFunction(() =>
    document.getElementById("live-channel")?.textContent.startsWith("Add channel open: "),
  );

  const channelTitle = `Over the channel ${crypto.randomUUID()}`;
  const beforeChannelAdd = await stats();

  await livePage.locator("#live-title").fill(channelTitle);
  await livePage.keyboard.press("Enter");
  await livePage.waitForFunction(
    (title) => document.getElementById("live-list")?.textContent.includes(title),
    channelTitle,
  );

  const listed = await livePage.locator("#live-list li").count();

  await livePage.waitForFunction(
    (count) =>
      document.getElementById("live-channel")?.textContent ===
      `Add channel open: the server has ${count} todos.`,
    listed,
  );
  assert.equal(await livePage.locator("#live-title").inputValue(), "");
  assert.equal((await stats()).addCalls - beforeChannelAdd.addCalls, 1);
  assert.equal(await livePage.evaluate(() => globalThis.__launchStable), true);
  checks.push(
    "a channel page opens its channel with connect() after hydration, adds a title over the socket, shows the channel's updated list and the stream's, and stays stable",
  );

  // The raw channel callable: the list first, then one per title sent alongside reading;
  // break closes the socket, so the handler sees its signal abort and returns.
  const beforeRaw = await stats();
  const raw = await livePage.evaluate(() =>
    globalThis.__launchChannel([`Raw ${crypto.randomUUID()}`, `Raw ${crypto.randomUUID()}`]),
  );

  assert.equal(raw.outcome, "closed");
  assert.deepEqual(raw.lists, [listed, listed + 1, listed + 2]);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await stats()).channelsReturned > beforeRaw.channelsReturned) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const afterRaw = await stats();

  assert.equal(afterRaw.channelsStarted - beforeRaw.channelsStarted, 1);
  assert.equal(afterRaw.channelsAborted - beforeRaw.channelsAborted, 1);
  assert.equal(afterRaw.channelsReturned - beforeRaw.channelsReturned, 1);
  assert.equal(afterRaw.addCalls - beforeRaw.addCalls, 2);

  const refusedTitle = await livePage.evaluate(() => globalThis.__launchChannel(["   "]));

  assert.deepEqual(refusedTitle, {
    lists: [listed + 2],
    outcome:
      'RpcError:INVALID_INPUT:400:{"issues":[{"path":["title"],"message":"Title must contain 1–200 characters"}]}',
  });
  checks.push(
    "the browser channel client yields typed lists, sends titles alongside reading, rejects a refused message with its own INVALID_INPUT issues, and break closes the socket so the handler's signal aborts and it returns",
  );

  // Pre-context refusals are plain HTTP answers to the upgrade, and create no context.
  const beforeUpgradeRefusals = await stats();
  const liveQuery = `?input=${encodeURIComponent("null")}`;
  const foreignUpgrade = await rawUpgrade(`/_rpc/live/add${liveQuery}`, {
    origin: "http://evil.example",
    cookie: "proof-user=alice",
  });

  assert.equal(foreignUpgrade.status, 403);
  assert.equal(JSON.parse(foreignUpgrade.body).error.code, "FORBIDDEN");

  const malformedUpgrade = await rawUpgrade("/_rpc/live/add", {
    origin,
    cookie: "proof-user=alice",
  });

  assert.equal(malformedUpgrade.status, 400);
  assert.equal(JSON.parse(malformedUpgrade.body).error.code, "INVALID_INPUT");
  assert.equal((await stats()).contexts, beforeUpgradeRefusals.contexts);

  const acceptedUpgrade = await rawUpgrade(`/_rpc/live/add${liveQuery}`, {
    origin,
    cookie: "proof-user=alice",
  });

  assert.equal(acceptedUpgrade.status, 101);
  checks.push(
    "the built server answers channel upgrades from a foreign Origin (403 FORBIDDEN) or without input (400 INVALID_INPUT) over plain HTTP without creating a context, and upgrades a same-origin one",
  );

  assert.deepEqual(
    await livePage.evaluate(() => globalThis.__launchTicks({ count: 3, everyMs: 10, fail: false })),
    {
      values: [
        { tick: 0, user: "alice" },
        { tick: 1, user: "alice" },
        { tick: 2, user: "alice" },
      ],
      outcome: "ended",
    },
  );
  assert.deepEqual(
    await livePage.evaluate(() => globalThis.__launchTicks({ count: 1, everyMs: 10, fail: true })),
    {
      values: [{ tick: 0, user: "alice" }],
      outcome: "RpcError:STOPPED:409:The ticks stopped",
    },
  );

  const beforeBreak = await stats();
  const broken = await livePage.evaluate(() =>
    globalThis.__launchTicks({ count: 100, everyMs: 50, fail: false }, 1),
  );

  assert.equal(broken.values.length, 1);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = await stats();

    if (current.streamsReturned > beforeBreak.streamsReturned) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const afterBreak = await stats();

  assert.equal(afterBreak.streamsAborted - beforeBreak.streamsAborted, 1);
  assert.equal(afterBreak.streamsReturned - beforeBreak.streamsReturned, 1);
  await livePage.close();
  checks.push(
    "the browser stream client yields typed values, ends cleanly, rejects with the procedure's declared error, and break closes the request so the handler sees its signal abort and returns",
  );

  // A client leaving is expected: the break above, closing /live while it follows its stream,
  // and a page render aborted while its slow list loads. The server entry logs none of them.
  const beforeRenderAbort = await stats();
  const leaving = new AbortController();
  const render = fetch(`${base}/todos`, {
    headers: { cookie: "proof-user=alice; proof-delay=1" },
    signal: leaving.signal,
  });

  setTimeout(() => leaving.abort(), 150);
  await assert.rejects(render, { name: "AbortError" });

  // The slow list finishes after Angular already rejected the render.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await stats()).abortedQueries > beforeRenderAbort.abortedQueries) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.ok((await stats()).abortedQueries > beforeRenderAbort.abortedQueries);
  assert.deepEqual(
    built
      .output()
      .split("\n")
      .filter((line) => line.includes("AbortError")),
    [],
  );
  assert.match(built.output(), /Launch RPC failed Error: Private database failure fixture/);

  // This entry isn't Express, but its abort handling must be the README's, line for line.
  const readme = await readFile(
    new URL("../../packages/angular-launch/README.md", import.meta.url),
    "utf8",
  );
  const abortSection = readme.split("\n### Aborted requests\n")[1].split("\n### ")[0];
  const entryLines = (await readFile(new URL("./src/server.ts", import.meta.url), "utf8"))
    .split("\n")
    .map((line) => line.trim());
  const snippets = [...abortSection.matchAll(/```ts\n([\s\S]*?)```/g)];

  assert.equal(snippets.length, 2);

  for (const [, snippet] of snippets) {
    let at = 0;

    for (const line of snippet.split("\n").map((text) => text.trim())) {
      if (line) {
        at = entryLines.indexOf(line, at);
        assert.notEqual(at, -1, `src/server.ts lacks the README's \`${line}\``);
        at += 1;
      }
    }
  }

  checks.push(
    "the built server, whose abort handling is the README's, logs nothing when a client leaves a stream, a page following one or a page render, and still logs real failures",
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

  // A public page prerenders from the anonymous build context; the RPC-free one still does.
  const prerender = spawnSync("pnpm", ["exec", "ng", "run", "todos:build:prerender"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });

  await writeFile(join(evidence, "prerender.log"), `${prerender.stdout}\n${prerender.stderr}`);
  assert.equal(prerender.status, 0);

  const prerendered = new URL("./dist/prerender/", import.meta.url);
  const about = await readFile(new URL("browser/about/index.html", prerendered), "utf8");
  const aboutEntries = transfers(about);
  const aboutQueries = dehydrated(about);

  assert.match(
    await readFile(new URL("browser/static/index.html", prerendered), "utf8"),
    /Static page without RPC/,
  );
  assert.match(visible(about), /<h1 id="about-title">Personal todos<\/h1>/);
  assert.match(visible(about), /Titles have 1–200 characters\./);
  assert.equal(aboutEntries.length, 1);
  assert.equal(aboutEntries[0].u, "/_rpc/about/summary");
  assert.equal(aboutQueries.length, 1);
  assert.deepEqual(aboutQueries[0].queryKey, ["launch", "about", "limits"]);

  const builtAt = aboutEntries[0].b.answeredAt;

  assert.ok(visible(about).includes(builtAt));
  checks.push(
    "prerendering /about renders its resolver call and injectQuery from the build context into the file, transferred as for SSR; /static still prerenders",
  );

  // The prerendered file is served as is, hydrates without RPCs, and later calls are live.
  const prerenderServer = await serve(
    new URL("server/server.mjs", prerendered),
    "prerender-server.log",
  );

  try {
    const prerenderBase = prerenderServer.base;
    const served = await fetch(`${prerenderBase}/about`);

    assert.equal(served.status, 200);
    assert.ok(served.headers.has("etag"), "the prerendered file is served, not rendered");
    assert.ok((await served.text()).includes(builtAt));

    const prerenderContext = await browser.newContext();

    await prerenderContext.addCookies([{ name: "proof-user", value: "alice", url: prerenderBase }]);

    const prerenderPage = await prerenderContext.newPage();
    const prerenderCalls = [];

    prerenderPage.on("request", (request) => {
      if (request.url().includes("/_rpc/")) {
        prerenderCalls.push(new URL(request.url()).pathname);
      }
    });
    // Past hydration and the first stability, after which a query would refetch on mount.
    await prerenderPage.goto(`${prerenderBase}/about`, { waitUntil: "networkidle" });
    await prerenderPage.waitForTimeout(1000);
    assert.equal(await prerenderPage.textContent("#about-answered"), builtAt);
    assert.deepEqual(prerenderCalls, []);

    // A client-side navigation to the page calls the server with the visitor's context.
    await prerenderPage.evaluate(() => {
      history.pushState(null, "", "/static");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await prerenderPage.waitForSelector("#static-title");

    // The page renders with the resolver's result; its stale query refetches once it mounts.
    const limitsAnswered = prerenderPage.waitForResponse(
      (response) => new URL(response.url()).pathname === "/_rpc/about/limits",
    );

    await prerenderPage.evaluate(() => {
      history.pushState(null, "", "/about");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await prerenderPage.waitForFunction((before) => {
      const answered = document.querySelector("#about-answered")?.textContent;

      return answered !== undefined && answered !== before;
    }, builtAt);
    await limitsAnswered;
    assert.deepEqual(prerenderCalls, ["/_rpc/about/summary", "/_rpc/about/limits"]);
    await prerenderContext.close();
    checks.push(
      "the prerendered /about is served as a file and hydrates without RPCs; a client-side navigation to it calls the server live",
    );
  } finally {
    prerenderServer.server.kill();
  }

  // Prerendering a page whose only RPC is an injectQuery that needs a user fails the build.
  const signedIn = spawnSync("pnpm", ["exec", "ng", "run", "todos:build:prerender-signed-in"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });

  await writeFile(
    join(evidence, "prerender-signed-in.log"),
    `${signedIn.stdout}\n${signedIn.stderr}`,
  );
  assert.notEqual(signedIn.status, 0);
  assert.match(
    `${signedIn.stdout}\n${signedIn.stderr}`,
    /prerendering route '\/identity'[\s\S]*Launch can't prerender this page: \/_rpc\/session\/current answered 303 \{"redirect":\{"to":"\/sign-in"\}\}/,
  );
  checks.push(
    "prerendering a page whose injectQuery is refused for the anonymous build context fails the build through finishLaunchRendering, naming the call",
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
  built.server.kill();
}
