import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { chromium } from "playwright";

const [base, evidence] = process.argv.slice(2);

if (!base || !evidence || !isAbsolute(evidence)) {
  throw new Error(
    "Usage: node verify.mjs http://127.0.0.1:PORT /absolute/owned/absent-evidence-directory",
  );
}

await mkdir(evidence);

const checks = [];
const requests = [];
const requestFailures = [];
const pageErrors = [];
let browser;

async function save(name, value) {
  await writeFile(join(evidence, name), JSON.stringify(value, null, 2) + "\n");
}

async function stats() {
  const response = await fetch(`${base}/__proof/stats`);

  assert.equal(response.status, 200);

  return response.json();
}

async function html(path, user, filename) {
  const response = await fetch(`${base}${path}`, { headers: { cookie: `proof-user=${user}` } });
  const text = await response.text();

  await writeFile(join(evidence, filename), text);
  assert.equal(response.status, 200, text);
  assert.equal(response.headers.get("cache-control"), "private, no-store");

  return text;
}

function transferred(text) {
  const match = /<script id="ng-state" type="application\/json">(.*?)<\/script>/s.exec(text);

  assert.ok(match, "Native transfer state must exist");

  const state = JSON.parse(match[1]);
  const bodies = [];

  for (const entry of Object.values(state)) {
    if (entry && typeof entry === "object" && "b" in entry) {
      bodies.push(entry.b);
    }
  }

  return bodies;
}

async function post(procedure, input, user) {
  const headers = { "content-type": "application/json" };

  if (user) {
    headers.cookie = `proof-user=${user}`;
  }

  const response = await fetch(`${base}/_rpc/g_todos/${procedure}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
  });

  return { status: response.status, body: await response.json() };
}

try {
  const beforeIsolation = await stats();
  const [alice, bob] = await Promise.all([
    html("/", "alice", "alice-ssr.html"),
    html("/", "bob", "bob-ssr.html"),
  ]);
  const aliceTransfer = transferred(alice);
  const bobTransfer = transferred(bob);

  assert.equal(aliceTransfer.length, 1);
  assert.equal(bobTransfer.length, 1);
  assert.equal(aliceTransfer[0].user, "alice");
  assert.equal(bobTransfer[0].user, "bob");
  assert.notEqual(aliceTransfer[0].requestId, bobTransfer[0].requestId);
  assert.ok(alice.includes("alice: Design Launch"));
  assert.ok(!alice.includes("bob: Design Launch"));
  assert.ok(bob.includes("bob: Design Launch"));
  assert.ok(!bob.includes("alice: Design Launch"));
  assert.ok(!alice.includes("LAUNCH_SERVER_ONLY_SECRET_SENTINEL"));
  assert.ok(!alice.includes('"metrics"'));
  assert.ok(!alice.includes('"db"'));

  const afterIsolation = await stats();

  assert.equal(afterIsolation.contexts - beforeIsolation.contexts, 2);
  assert.equal(afterIsolation.directQueries - beforeIsolation.directQueries, 2);
  assert.equal(afterIsolation.httpQueries, beforeIsolation.httpQueries);
  await save("isolation.json", { beforeIsolation, afterIsolation, aliceTransfer, bobTransfer });
  checks.push(
    "concurrent SSR documents and transfer state use distinct request contexts; no loopback HTTP",
  );

  const beforeInvalid = await stats();
  const invalid = await post("add", 123, "alice");

  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_INPUT");

  const afterInvalid = await stats();

  assert.equal(afterInvalid.groupGuards, beforeInvalid.groupGuards);
  assert.equal(afterInvalid.mutations, beforeInvalid.mutations);

  const forbidden = await post("list", null);

  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, "FORBIDDEN");

  const readonly = await post("complete", { id: "1" }, "readonly");

  assert.equal(readonly.status, 403);

  const missing = await post("complete", { id: "missing" }, "alice");

  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");
  assert.deepEqual(missing.body.error.data, { id: "missing" });
  await save("http-errors.json", { invalid, forbidden, readonly, missing });
  checks.push(
    "HTTP validates before group guards; explicit group/procedure denials and declared error payloads",
  );

  const beforeProbes = await stats();
  const blocked = await html("/render-mutation", "alice", "render-mutation.html");

  assert.ok(blocked.includes("FORBIDDEN:Mutations are forbidden during rendering"));

  const unmarked = await html("/unmarked-mutation", "alice", "unmarked-mutation.html");

  assert.ok(unmarked.includes("unmarked mutation rejected"));

  const afterProbes = await stats();

  assert.equal(afterProbes.mutations, beforeProbes.mutations);
  assert.equal(
    afterProbes.contexts - beforeProbes.contexts,
    2,
    "Both probes must reject locally, without loopback HTTP",
  );
  assert.equal(
    afterProbes.groupGuards,
    beforeProbes.groupGuards,
    "Render-time mutation rejection precedes dispatch guards",
  );
  checks.push("marked and unmarked same-origin RPC mutations are rejected during SSR");

  const invalidHttpResult = await post("invalid-result", null, "alice");

  assert.equal(invalidHttpResult.status, 500);
  assert.equal(invalidHttpResult.body.error.code, "INTERNAL");
  assert.equal(invalidHttpResult.body.error.message, "Internal server error");

  const invalidSsrResult = await html("/invalid-result", "alice", "invalid-result.html");

  assert.ok(invalidSsrResult.includes("INTERNAL:Internal server error"));
  assert.ok(!invalidSsrResult.includes("RPC objects must be plain"));
  await save("json-parity.json", { invalidHttpResult });
  checks.push("unsupported Date output fails on both transports with nonleaking INTERNAL");

  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });

  const context = await browser.newContext();

  await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);

  const page = await context.newPage();

  page.on("request", (request) => {
    if (request.url().includes("/_rpc/")) {
      requests.push({ method: request.method(), url: request.url(), body: request.postData() });
    }
  });
  page.on("requestfailed", (request) =>
    requestFailures.push({ url: request.url(), failure: request.failure() }),
  );
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  const beforeHydration = await stats();

  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector("#todo-list li");
  assert.equal(
    await page.evaluate(() => globalThis.__proofSsrList === document.getElementById("todo-list")),
    true,
  );
  assert.equal(requests.length, 0, "Hydration must not issue an RPC POST");

  const afterHydration = await stats();

  assert.equal(afterHydration.contexts - beforeHydration.contexts, 1);
  assert.equal(afterHydration.directQueries - beforeHydration.directQueries, 1);
  assert.equal(afterHydration.httpQueries, beforeHydration.httpQueries);

  const originalIdentity = await page.locator("#identity").textContent();

  await save("hydration.json", {
    beforeHydration,
    afterHydration,
    originalIdentity,
    requests: [...requests],
  });
  checks.push(
    "native hydration preserves original SSR list Node and reuses POST transfer response",
  );

  await page.locator("#refresh").click();
  await page.waitForFunction(() => document.getElementById("status")?.textContent === "refreshed");

  const refreshedIdentity = await page.locator("#identity").textContent();

  assert.notEqual(refreshedIdentity, originalIdentity);
  assert.equal(requests.length, 1);
  assert.equal((await stats()).httpQueries - afterHydration.httpQueries, 1);
  checks.push("query after stability uses real HTTP and fresh request context");

  await page.locator("#add").click();
  await page.waitForFunction(() => document.getElementById("status")?.textContent === "added");
  assert.ok((await page.locator("#todo-list").textContent()).includes("Browser todo"));
  await page.locator("#complete").click();
  await page.waitForFunction(() => document.getElementById("status")?.textContent === "completed");
  assert.ok((await page.locator('[data-id="1"]').textContent()).includes("true"));

  const persisted = await html("/", "alice", "persisted-ssr.html");

  assert.ok(persisted.includes("Browser todo"));
  assert.ok(persisted.includes("alice: Design Launch · true"));
  checks.push("browser mutations validate transformed input and persist into later SSR");

  await page.locator("#missing").click();
  await page.waitForFunction(
    () => document.getElementById("status")?.textContent === "NOT_FOUND:missing",
  );
  checks.push("browser maps declared server failure to RpcError with its data");

  const beforeCancellation = await stats();

  await page.locator("#cancel").click();
  await page.waitForFunction(() => document.getElementById("status")?.textContent === "AbortError");

  const afterCancellation = await stats();

  assert.equal(afterCancellation.slowStarted - beforeCancellation.slowStarted, 1);
  assert.equal(afterCancellation.slowFinished, beforeCancellation.slowFinished);
  await new Promise((resolve) => setTimeout(resolve, 700));

  const afterServerFinishes = await stats();

  assert.equal(afterServerFinishes.slowFinished - beforeCancellation.slowFinished, 1);
  assert.ok(requestFailures.some((request) => request.url.endsWith("/slow")));
  await save("cancellation.json", {
    beforeCancellation,
    afterCancellation,
    afterServerFinishes,
    requestFailures,
  });
  checks.push("client AbortError aborts HTTP while server work may continue");

  const uncachedHtml = await html("/uncached", "alice", "uncached-ssr.html");

  assert.deepEqual(transferred(uncachedHtml), []);

  const beforeUncachedBrowser = requests.length;

  await page.goto(`${base}/uncached`, { waitUntil: "networkidle" });
  assert.equal(requests.length - beforeUncachedBrowser, 1);
  checks.push(
    "transferCache:false bypasses native response transfer and hydration makes HTTP request",
  );

  const beforeBrowserProbe = await stats();

  await page.goto(`${base}/render-mutation`, { waitUntil: "networkidle" });

  const afterBrowserProbe = await stats();

  assert.equal(afterBrowserProbe.mutations, beforeBrowserProbe.mutations);
  assert.ok((await page.locator("#status").textContent()).includes("browser probe skipped"));
  checks.push("mutation diagnostic does not write when browser navigation repeats its resolver");

  await page.goto(base, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(evidence, "todo.png"), fullPage: true });
  assert.deepEqual(pageErrors, []);
  await context.close();

  const browserOutput = await readFile(
    new URL("./dist/launch-proof/browser/main.js", import.meta.url),
    "utf8",
  );

  assert.ok(!browserOutput.includes("LAUNCH_SERVER_ONLY_SECRET_SENTINEL"));
  assert.ok(!browserOutput.includes("proof-user="));

  const metafile = JSON.parse(
    await readFile(new URL("./dist/launch-proof/stats.json", import.meta.url), "utf8"),
  );
  const browserFiles = new Set(
    await readdir(new URL("./dist/launch-proof/browser/", import.meta.url)),
  );
  const forbiddenInputs = [];
  let inspectedOutputs = 0;

  for (const [output, information] of Object.entries(metafile.outputs)) {
    if (!browserFiles.has(output) || !output.endsWith(".js")) {
      continue;
    }

    inspectedOutputs += 1;

    for (const input of Object.keys(information.inputs)) {
      if (input.endsWith(".server.ts") || input.endsWith("src/server.ts")) {
        forbiddenInputs.push({ output, input });
      }
    }
  }

  assert.ok(inspectedOutputs > 0, "Must inspect real browser outputs, not an empty selection");
  assert.deepEqual(forbiddenInputs, []);
  checks.push(
    "native browser metafile excludes server implementation modules and server-only sentinel",
  );
  await save("report.json", {
    success: true,
    checks,
    requests,
    pageErrors,
    finalStats: await stats(),
  });
  console.log(JSON.stringify({ success: true, checks, evidence }, null, 2));
} catch (error) {
  await save("report.json", {
    success: false,
    checks,
    requests,
    requestFailures,
    pageErrors,
    error: String(error),
    stack: error?.stack,
  });

  throw error;
} finally {
  await browser?.close();
}
