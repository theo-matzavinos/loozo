import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";

// Runs the platform-neutral build (`ng run todos:build:neutral`) on Deno, in its default and
// upcoming abort modes, and on Cloudflare's workerd through `wrangler dev`, and drives each in
// Chromium: pages, RPCs, streams and channels, and what a handler sees when its caller leaves.

const require = createRequire(
  new URL("../../packages/angular-launch/package.json", import.meta.url),
);
const { chromium } = require("playwright");
// Wrangler's exports don't include its CLI; the example's own install does.
const wrangler = fileURLToPath(new URL("node_modules/wrangler/bin/wrangler.js", import.meta.url));
const [evidence, extra] = process.argv.slice(2);

if (!evidence || extra !== undefined || !isAbsolute(evidence)) {
  throw new Error("Usage: node verify-runtimes.mjs /absolute/absent-evidence");
}

await mkdir(evidence);

const here = fileURLToPath(new URL(".", import.meta.url));
const deno = process.env.DENO ?? "deno";
const denoArgs = ["run", "--allow-net", "--allow-read", "--allow-env"];

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();

    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();

      probe.close(() => resolve(port));
    });
  });
}

const allRuntimes = [
  {
    name: "deno",
    deno: true,
    start: async () => [deno, [...denoArgs, "runtimes/deno.mjs"], /LAUNCH_READY (\S+)/],
  },
  {
    name: "deno-no-legacy-abort",
    deno: true,
    start: async () => [
      deno,
      [...denoArgs, "--unstable-no-legacy-abort", "runtimes/deno.mjs"],
      /LAUNCH_READY (\S+)/,
    ],
  },
  {
    name: "workerd",
    deno: false,
    start: async () => [
      process.execPath,
      [
        wrangler,
        "dev",
        "--config",
        "runtimes/wrangler.jsonc",
        "--ip",
        "127.0.0.1",
        "--port",
        String(await freePort()),
      ],
      /Ready on (http:\/\/\S+)/,
    ],
  },
];
// RUNTIMES=deno,workerd runs only those, for working on one runtime.
const only = process.env.RUNTIMES?.split(",");
const unknown = only?.filter((name) => !allRuntimes.some((runtime) => runtime.name === name));

assert.deepEqual(
  unknown ?? [],
  [],
  `RUNTIMES names unknown runtimes; choose from ${allRuntimes.map(({ name }) => name).join(", ")}`,
);

const runtimes = allRuntimes.filter((runtime) => !only || only.includes(runtime.name));

// Rejects with a labelled error unless `promise` settles within `ms`.
function bounded(promise, ms, label) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} took over ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Every runtime still running, so a failure, a timeout or Ctrl-C stops them all.
const running = new Set();

async function stopAll() {
  await Promise.all([...running].map((server) => server.stop()));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stopAll().finally(() => process.exit(130));
  });
}

// Starts a runtime in its own process group and resolves once it is listening; its output goes
// to `<name>.log` in the evidence directory. The returned `stop()` ends the whole group and
// waits for it, escalating to SIGKILL after 10 s.
async function serve(runtime) {
  const [command, args, ready] = await runtime.start();
  const output = createWriteStream(join(evidence, `${runtime.name}.log`));
  const child = spawn(command, args, {
    cwd: here,
    detached: true,
    env: { ...process.env, NO_COLOR: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pipesClosed = new Promise((resolve) => {
    child.once("close", resolve);
    child.once("error", resolve);
  });

  // Signals the whole group, whether or not its leader is still alive; false once it's gone.
  function signalGroup(signal) {
    if (child.pid === undefined) {
      return false;
    }

    try {
      process.kill(-child.pid, signal);

      return true;
    } catch (error) {
      if (error.code === "ESRCH") {
        return false;
      }

      throw error;
    }
  }

  const groupGone = (ms) => within(ms, () => !signalGroup(0));

  async function teardown() {
    signalGroup("SIGTERM");

    if ((await groupGone(10_000)) === -1) {
      signalGroup("SIGKILL");
      await groupGone(5_000);
    }

    // A survivor that held the pipes is gone too; don't wait on them past that.
    child.stdout.destroy();
    child.stderr.destroy();
    await bounded(pipesClosed, 5_000, `closing ${runtime.name}'s output`).catch(() => {});
    output.end();
    // Only now: a Ctrl-C during the stop waits for it through stopAll().
    running.delete(server);
  }

  let stopping;
  const server = {
    base: "",
    // Every caller, the signal handler included, shares one teardown.
    stop: () => (stopping ??= teardown()),
  };

  running.add(server);
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });

  try {
    server.base = await bounded(
      new Promise((resolve, reject) => {
        let text = "";

        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`${runtime.name} exited with ${code}`)));
        child.stdout.on("data", (chunk) => {
          // oxlint-disable-next-line no-control-regex -- strips terminal colors
          text += String(chunk).replace(/\u001b\[[0-9;]*m/g, "");

          const match = ready.exec(text);

          if (match) {
            resolve(match[1]);
          }
        });
      }),
      120_000,
      `starting ${runtime.name}`,
    );
  } catch (error) {
    await server.stop();

    throw error;
  }

  return server;
}

// A websocket upgrade over raw HTTP: the status, headers and body of a refusal, or 101. The
// whole exchange, body included, has 10 s.
function rawUpgrade(base, path, headers, { key = "dGhlIHNhbXBsZSBub25jZQ==" } = {}) {
  return new Promise((resolve, reject) => {
    const sent = httpRequest(`${base}${path}`, {
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        ...(key === null ? {} : { "sec-websocket-key": key }),
        ...headers,
      },
      signal: AbortSignal.timeout(10_000),
    });

    sent.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode, headers: response.headers, body: "" });
    });
    sent.on("response", (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("error", reject);
      response.on("end", () =>
        resolve({ status: response.statusCode, headers: response.headers, body }),
      );
    });
    sent.on("error", reject);
    sent.end();
  });
}

// Fetches `url` and reads its whole body within `ms`.
async function fetchText(url, init, ms) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });

  return { status: response.status, text: await response.text() };
}

// Polls `read` until it returns true or `ms` pass; resolves to the milliseconds taken, or -1.
async function within(ms, read) {
  const started = Date.now();

  while (Date.now() - started < ms) {
    if (await read()) {
      return Date.now() - started;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return -1;
}

async function verify(runtime, base, browser) {
  const checks = [];
  const origin = new URL(base).origin;
  const stats = async () => JSON.parse((await fetchText(`${base}/__proof/stats`, {}, 10_000)).text);
  const add = async (title, headers = {}) => {
    const { status, text } = await fetchText(
      `${base}/_rpc/todos/add`,
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: "proof-user=alice",
          ...headers,
        },
        body: JSON.stringify({ input: { title } }),
      },
      10_000,
    );

    return { status, body: JSON.parse(text) };
  };
  // Runs a browser helper with a deadline: they wait on the network.
  const run = (page, helper, ...args) =>
    bounded(page.evaluate(helper, ...args), 30_000, "a browser helper");

  const { status, text: html } = await fetchText(
    `${base}/todos`,
    { headers: { cookie: "proof-user=alice" } },
    30_000,
  );

  assert.equal(status, 200, html);

  // The rendered list, not the transferred state that hydration reads.
  const list = /<ul id="todo-list"[^>]*>([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? "";

  assert.match(list, /<span>alice: Review todos<\/span>/);
  await writeFile(join(evidence, `${runtime.name}-todos.html`), html);
  checks.push("server-renders a page with the user's todos");

  const title = `Over RPC ${crypto.randomUUID()}`;
  const { status: addedStatus, body: todo } = await add(title);

  assert.equal(addedStatus, 200, JSON.stringify(todo));
  assert.deepEqual({ title: todo.title, completed: todo.completed }, { title, completed: false });

  const foreign = await add("Never", { origin: "http://evil.example" });

  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.error.code, "FORBIDDEN");
  checks.push("answers a same-origin RPC with its result and refuses a cross-origin one");

  const context = await browser.newContext();
  const errors = [];

  context.setDefaultTimeout(30_000);
  await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);

  const live = await context.newPage();

  live.on("pageerror", (error) => errors.push(String(error)));
  await live.goto(`${base}/live`);
  await live.waitForFunction(() => document.getElementById("live-status")?.textContent === "Live");

  const streamed = `Streamed ${crypto.randomUUID()}`;

  assert.equal((await add(streamed)).status, 200);
  await live.waitForFunction(
    (text) => document.getElementById("live-list")?.textContent.includes(text),
    streamed,
  );
  checks.push("a page follows a stream with connect() after hydration and shows a write");

  // The channel's own values, not the stream's: its status line counts the list it last sent.
  await live.waitForFunction(() =>
    document.getElementById("live-channel")?.textContent.startsWith("Add channel open: "),
  );

  const sent = `Over the channel ${crypto.randomUUID()}`;
  const beforeSend = await stats();

  await live.locator("#live-title").fill(sent);
  await live.keyboard.press("Enter");
  await live.waitForFunction(
    (text) => document.getElementById("live-list")?.textContent.includes(text),
    sent,
  );

  const listed = await live.locator("#live-list li").count();

  await live.waitForFunction(
    (count) =>
      document.getElementById("live-channel")?.textContent ===
      `Add channel open: the server has ${count} todos.`,
    listed,
  );
  assert.equal(await live.locator("#live-title").inputValue(), "");
  assert.equal((await stats()).addCalls - beforeSend.addCalls, 1);
  checks.push("a page opens a channel with connect(), adds a title over it and shows its reply");

  let before = await stats();
  const raw = await run(live, () =>
    globalThis.__launchChannel([`Raw ${crypto.randomUUID()}`, `Raw ${crypto.randomUUID()}`]),
  );

  assert.deepEqual(raw, { lists: [listed, listed + 1, listed + 2], outcome: "closed" });
  assert.notEqual(
    await within(5_000, async () => (await stats()).channelsReturned > before.channelsReturned),
    -1,
  );

  let after = await stats();

  assert.equal(after.channelsStarted - before.channelsStarted, 1);
  assert.equal(after.channelsAborted - before.channelsAborted, 1);
  assert.equal(after.channelsReturned - before.channelsReturned, 1);
  assert.equal(after.addCalls - before.addCalls, 2);
  checks.push(
    "the raw channel client yields the lists in order while sending, and break aborts the handler's signal and it returns",
  );

  const refused = await run(live, () => globalThis.__launchChannel(["   "]));

  assert.deepEqual(refused, {
    lists: [listed + 2],
    outcome:
      'RpcError:INVALID_INPUT:400:{"issues":[{"path":["title"],"message":"Title must contain 1–200 characters"}]}',
  });
  checks.push("a refused channel message ends the call with its INVALID_INPUT issues");

  await context.addCookies([{ name: "proof-user", value: "nobody", url: base }]);
  assert.deepEqual(await run(live, () => globalThis.__launchChannel(["Unseen"])), {
    lists: [],
    outcome: "RpcRedirect:/sign-in",
  });
  await context.addCookies([{ name: "proof-user", value: "alice", url: base }]);
  checks.push("a channel's stage redirects a signed-out caller over the socket");

  assert.deepEqual(
    await run(live, () => globalThis.__launchTicks({ count: 3, everyMs: 10, fail: false })),
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
    await run(live, () => globalThis.__launchTicks({ count: 1, everyMs: 10, fail: true })),
    { values: [{ tick: 0, user: "alice" }], outcome: "RpcError:STOPPED:409:The ticks stopped" },
  );
  checks.push("a stream ends, and rejects with its declared error");

  // The caller leaves while the handler most likely waits on a timer, which workerd may cancel
  // once the request is (see Launch's README, "Cloudflare Workers").
  before = await stats();

  const broken = await run(live, () =>
    globalThis.__launchTicks({ count: 1000, everyMs: 50, fail: false }, 1),
  );

  assert.equal(broken.values.length, 1);

  const aborted = await within(
    5_000,
    async () => (await stats()).streamsAborted > before.streamsAborted,
  );
  const returned = await within(
    5_000,
    async () => (await stats()).streamsReturned > before.streamsReturned,
  );

  assert.notEqual(aborted, -1, "the stream's signal didn't abort within 5 s");

  if (runtime.deno) {
    assert.notEqual(returned, -1, "the stream's handler didn't return within 5 s");
    checks.push(
      `break on a stream aborts its handler's signal in ${aborted} ms and it returns in ${returned} ms`,
    );
  } else {
    checks.push(
      `break on a stream aborts its handler's signal in ${aborted} ms; the handler, waiting on a timer, ${returned === -1 ? "hasn't resumed 5 s later" : `returned in ${returned} ms`}`,
    );
  }

  // Closing a page with a channel open ends that call on the server; `live`'s stays open.
  const leaving = await context.newPage();

  await leaving.goto(`${base}/live`);
  await leaving.waitForFunction(() =>
    document.getElementById("live-channel")?.textContent.startsWith("Add channel open: "),
  );
  before = await stats();
  await leaving.close();

  const closed = await within(
    5_000,
    async () => (await stats()).channelsReturned > before.channelsReturned,
  );

  assert.notEqual(closed, -1, "the channel's handler didn't return within 5 s of the page closing");
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal((await stats()).channelsReturned - before.channelsReturned, 1);
  assert.ok((await live.locator("#live-channel").textContent()).startsWith("Add channel open: "));
  checks.push(`closing a page ends its open channel's handler in ${closed} ms`);

  // Refusals are plain HTTP answers; an accepted upgrade carries the call's cookies.
  const query = `?input=${encodeURIComponent("null")}`;
  const foreignUpgrade = await rawUpgrade(base, `/_rpc/live/add${query}`, {
    origin: "http://evil.example",
    cookie: "proof-user=alice",
  });
  const malformedUpgrade = await rawUpgrade(base, "/_rpc/live/add", {
    origin,
    cookie: "proof-user=alice",
  });
  const beforeAccepted = await stats();
  const acceptedUpgrade = await rawUpgrade(base, `/_rpc/live/add${query}`, {
    origin,
    cookie: "proof-user=alice",
  });

  // The raw socket closes at once; its call ends before the next check counts calls.
  assert.notEqual(
    await within(
      5_000,
      async () => (await stats()).channelCallsSettled > beforeAccepted.channelCallsSettled,
    ),
    -1,
    "the accepted upgrade's call didn't end within 5 s of its socket closing",
  );

  assert.equal(foreignUpgrade.status, 403);
  assert.equal(JSON.parse(foreignUpgrade.body).error.code, "FORBIDDEN");
  assert.equal(malformedUpgrade.status, 400);
  assert.equal(JSON.parse(malformedUpgrade.body).error.code, "INVALID_INPUT");
  assert.equal(acceptedUpgrade.status, 101);
  assert.deepEqual(acceptedUpgrade.headers["set-cookie"], [
    "proof-channel=alice; Path=/; HttpOnly; Secure; SameSite=Lax",
  ]);
  checks.push(
    "refuses foreign-origin and input-less upgrades over HTTP, and sends the call's cookie on the 101; that call ends when its socket closes",
  );

  // Deno requires Sec-WebSocket-Key, which Launch doesn't check: the host refuses the handshake
  // after Launch started the call, and must end it.
  if (runtime.deno) {
    before = await stats();

    const keyless = await rawUpgrade(
      base,
      `/_rpc/live/add${query}`,
      { origin, cookie: "proof-user=alice" },
      { key: null },
    );

    assert.equal(keyless.status, 400);
    assert.notEqual(
      await within(
        5_000,
        async () => (await stats()).channelCallsSettled > before.channelCallsSettled,
      ),
      -1,
      "the refused handshake's call didn't end within 5 s",
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    after = await stats();
    assert.equal(after.channelCallsSettled - before.channelCallsSettled, 1);
    assert.equal(after.channelsStarted, before.channelsStarted);
    checks.push(
      "refuses a handshake Deno can't complete with 400 and ends its call without running the handler",
    );
  }

  assert.deepEqual(errors, []);
  await context.close();

  return checks;
}

const report = {};
let failure;
const browser = await chromium.launch();

try {
  for (const runtime of runtimes) {
    const server = await serve(runtime);

    try {
      report[runtime.name] = await verify(runtime, server.base, browser);
    } finally {
      await server.stop();
    }
  }

  await writeFile(
    join(evidence, "report.json"),
    JSON.stringify({ success: true, report }, null, 2),
  );
  console.log(JSON.stringify({ success: true, report, evidence }, null, 2));
} catch (error) {
  failure = error;
  await writeFile(
    join(evidence, "report.json"),
    JSON.stringify({ success: false, report, error: String(error), stack: error.stack }, null, 2),
  );
} finally {
  await stopAll();
  await browser.close();
}

if (failure) {
  throw failure;
}
