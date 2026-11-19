// Named outlets on real generated builds: examples/angular-router/outlets-proof, copied, checked
// against its committed generated files, server-rendered and driven in Chromium.
//
// Usage: node tests/outlets.mjs /absolute/owned/absent-evidence-directory
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { get } from "node:http";
import { createServer } from "node:net";
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");

if (process.argv.length !== 3 || !isAbsolute(process.argv[2])) {
  throw new Error("Usage: node tests/outlets.mjs /absolute/owned/absent-evidence-directory");
}

const evidence = resolve(process.argv[2]);

await mkdir(evidence);
await mkdir(join(evidence, "screenshots"));

const fixture = join(evidence, "consumer");

await cp(join(repository, "examples/angular-router/outlets-proof"), fixture, {
  recursive: true,
  filter: (path) => !/(?:^|\/)(?:node_modules|dist|\.angular|out-tsc)(?:\/|$)/.test(path),
});

const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));

for (const name of new Set([
  ...Object.keys(metadata.dependencies),
  ...Object.keys(metadata.devDependencies),
  "@loozo/angular-router",
])) {
  const leaf = join(fixture, "node_modules", name);

  await mkdir(dirname(leaf), { recursive: true });

  let target = join(packageDirectory, "node_modules", name);

  if (name === "@loozo/angular-router") {
    target = packageDirectory;
  }

  await symlink(target, leaf, "dir");
}

const require = createRequire(join(packageDirectory, "package.json"));
const { Architect } = require("@angular-devkit/architect");
const { WorkspaceNodeModulesArchitectHost } = require("@angular-devkit/architect/node");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");
const { NodeJsSyncHost } = nativeRequire("@angular-devkit/core/node");
const { chromium } = require("playwright");
const { Window } = require("happy-dom");
const logs = [];
const logger = new core.logging.Logger("outlets");

logger.subscribe((entry) => logs.push(entry));

const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
const { workspace } = await core.workspaces.readWorkspace(fixture, host);
const registry = new core.json.schema.CoreSchemaRegistry();

registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

const architect = new Architect(
  new WorkspaceNodeModulesArchitectHost(workspace, fixture),
  registry,
);

async function save(name, value) {
  await writeFile(join(evidence, name), JSON.stringify(value, null, 2) + "\n");
}

// The committed generated files are current: the check configuration fails on any drift, then
// builds the server and browser bundles the SSR requests below use.
const check = await architect.scheduleTarget(
  { project: "proof", target: "build", configuration: "ci" },
  {},
  { logger },
);

try {
  const output = await check.result;

  await save("check-build-report.json", { output, logs });
  assert.equal(output.success, true, JSON.stringify(logs));
} finally {
  await check.stop();
}

function request(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const outgoing = get(url, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.once("error", reject);
      response.once("end", () => {
        resolve({ url, status: response.statusCode, headers: response.headers, body });
      });
    });
    const timer = setTimeout(() => {
      outgoing.destroy(new Error("SSR HTTP request timed out: " + url));
    }, timeoutMs);

    outgoing.once("close", () => clearTimeout(timer));
    outgoing.once("error", reject);
  });
}

async function freePort() {
  const reservation = createServer();

  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));

  const { port } = reservation.address();

  await new Promise((resolve) => reservation.close(resolve));

  return port;
}

const views = [
  "home",
  "products",
  "products-sort",
  "overview",
  "list",
  "list-page",
  "item",
  "item-id",
  "item-static",
  "chat",
  "chat-id",
  "settings",
  "chat-rest",
  "chat-rest-path",
  "chat-files",
  "chat-files-path",
  "plain",
  "login",
  "missing",
  "team",
  "team-list",
  "team-item",
  "team-item-id",
  "account-layout",
  "profile",
  "help",
  "literal",
  "literal-child-page",
  "active-route",
];

// Which views a server-rendered document shows, by id, with their text.
function rendered(body) {
  const window = new Window();
  const template = window.document.createElement("template");

  template.innerHTML = body;

  const result = {};

  for (const id of views) {
    const node = template.content.querySelector("#" + id);

    if (node) {
      result[id] = node.textContent.replace(/\s+/g, " ").trim();
    }
  }

  window.close();

  return result;
}

function seedOf(body) {
  const match = body.match(/<script id="ng-state"[^>]*>([\s\S]*?)<\/script>/);

  assert.ok(match, "The document carries TransferState");

  return JSON.parse(match[1])["@loozo/angular-router:active-route"];
}

const ssr = [];

// Direct server-rendered requests to the built Node entry: named-outlet URLs reach the `**`
// server route and the app's root catchall makes them render.
{
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  let stderr = "";
  const node = spawn(process.execPath, [join(fixture, "dist/proof/server/server.mjs")], {
    cwd: fixture,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  node.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  try {
    const deadline = Date.now() + 60000;

    for (;;) {
      try {
        const response = await request(origin + "/plain", 3000);

        if (response.status === 200) {
          break;
        }
      } catch {
        // Startup only.
      }

      assert.ok(Date.now() < deadline, "Node SSR server did not start: " + stderr);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    for (const [url, expected] of [
      ["/products/list(chat:chat/7)", { list: true, "chat-id": "7", "active-route": "list" }],
      [
        "/products/(list//detail:item/3)(chat:chat/7)?sort=price",
        {
          "products-sort": "price",
          list: true,
          "item-id": "3",
          "chat-id": "7",
          "active-route": "list",
        },
      ],
      ["/(chat:chat/7)", { home: true, "chat-id": "7", "active-route": "home" }],
      ["/products/(detail:item/3)", { overview: true, "item-id": "3", "active-route": "overview" }],
      [
        "/products/(detail:item/3)(chat:chat/7)",
        { overview: true, "item-id": "3", "chat-id": "7", "active-route": "overview" },
      ],
      [
        "/teams/4/(list//detail:item/3)(chat:chat/7)",
        { "team-list": true, "team-item-id": "3", "chat-id": "7", "active-route": "teamList" },
      ],
      ["/account/(profile//aside:help)", { profile: true, help: true, "active-route": "profile" }],
      ["/(chat:a/b)", { home: true, "chat-rest-path": "a/b", "active-route": "home" }],
      ["/plain(chat:unknown/path)", { plain: true, "chat-rest-path": "unknown/path" }],
      ["/products/%28detail%3Aitem%29", { literal: true, "active-route": "literal" }],
      ["/products/(detail:item)", { overview: true, "item-static": true }],
      // Encoded parentheses are one primary segment: the not-found page.
      ["/products%28chat:chat/7%29", { missing: true, "active-route": "missing" }],
    ]) {
      const response = await request(origin + url);
      const shown = rendered(response.body);
      const observation = { url, status: response.status, shown };

      ssr.push(observation);
      assert.equal(response.status, 200, url);

      for (const [id, value] of Object.entries(expected)) {
        if (value === true) {
          assert.ok(id in shown, `${url} renders #${id}: ${JSON.stringify(shown)}`);
        } else {
          assert.equal(shown[id], value, `${url} #${id}`);
        }
      }

      // Every server-rendered page names one primary chain in its seed, within the primary path.
      if (url === "/products/(detail:item/3)(chat:chat/7)") {
        assert.deepEqual(seedOf(response.body), {
          url,
          routes: [
            { id: "src/routes/products/route.ts", from: 0, to: 1 },
            { id: "src/routes/products/+overview/route.ts", from: 1, to: 1 },
          ],
        });
      }

      if (url === "/(chat:chat/7)") {
        assert.deepEqual(seedOf(response.body), {
          url,
          routes: [{ id: "src/routes/+home/route.ts", from: 0, to: 0, data: { visits: 1 } }],
        });
      }
    }

    // A redirect into a branch replaces the whole URL with the branch's own.
    for (const [url, location] of [
      ["/old-chat/7", "/(chat:chat/7)"],
      ["/old-chat-kept/7?x=1", "/(chat:chat/7)?x=1"],
      ["/old-item/3?sort=price", "/products/(detail:item/3)?sort=price"],
    ]) {
      const response = await request(origin + url);

      ssr.push({ url, status: response.status, location: response.headers.location });
      assert.equal(response.status, 302, url);
      assert.equal(response.headers.location, location);
    }

    // The redirected root-branch URL then renders home beside chat.
    {
      const response = await request(origin + "/old-chat/7");
      const followed = await request(origin + response.headers.location);
      const shown = rendered(followed.body);

      ssr.push({ url: response.headers.location, followedFrom: "/old-chat/7", shown });
      assert.equal(followed.status, 200);
      assert.ok("home" in shown && shown["chat-id"] === "7", JSON.stringify(shown));
      assert.equal(shown["active-route"], "home");
    }
  } finally {
    node.kill("SIGTERM");
    await save("ssr.json", { requests: ssr, stderr });
  }
}

const outputs = [];
const serve = await architect.scheduleTarget({ project: "proof", target: "serve" }, {}, { logger });
const observations = [];
let browser;

try {
  serve.output.subscribe((output) => outputs.push(output));

  const deadline = Date.now() + 120000;

  while (!outputs.some((output) => output.success && output.baseUrl)) {
    assert.ok(Date.now() < deadline, JSON.stringify(logs));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const origin = new URL(outputs.find((output) => output.success && output.baseUrl).baseUrl).origin;

  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  await save("versions.json", {
    node: process.version,
    angular: require("@angular/router/package.json").version,
    playwright: require("playwright/package.json").version,
    chromium: browser.version(),
  });

  // One page per scenario, its console and errors journaled. `hold` holds scripts until the
  // returned release is called, leaving the server's DOM in place.
  async function session(name, { video = false } = {}) {
    let options = { viewport: { width: 1280, height: 860 } };

    if (video) {
      options = {
        ...options,
        recordVideo: { dir: join(evidence, "videos"), size: { width: 1280, height: 860 } },
      };
    }

    const context = await browser.newContext(options);
    const page = await context.newPage();
    const journal = { errors: [], console: [], documents: 0 };

    page.on("pageerror", (error) => journal.errors.push(error.message));
    page.on("console", (message) => {
      journal.console.push({ type: message.type(), text: message.text() });

      if (message.type() === "error") {
        journal.errors.push(message.text());
      }
    });
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        journal.documents += 1;
      }
    });

    let allow = () => {};
    let held = false;

    await page.route("**/*", async (route) => {
      if (held && route.request().resourceType() === "script") {
        await new Promise((resolve) => {
          const previous = allow;

          allow = () => {
            previous();
            resolve();
          };
        });
      }

      await route.continue();
    });

    return {
      page,
      journal,
      async open(url, { holdScripts = false } = {}) {
        held = holdScripts;
        await page.goto(origin + url, { waitUntil: holdScripts ? "commit" : "load" });

        if (holdScripts) {
          await page.waitForSelector("#active-route", { state: "attached" });

          return;
        }

        await stable();
      },
      release() {
        held = false;
        allow();
      },
      async observe(label, extra = {}) {
        await idle();

        const state = await page.evaluate((ids) => {
          const shown = {};

          for (const id of ids) {
            const node = document.getElementById(id);

            if (node) {
              shown[id] = node.textContent.replace(/\s+/g, " ").trim();
            }
          }

          return {
            routerUrl: window.proofApp.router.url,
            href: location.pathname + location.search + location.hash,
            shown,
          };
        }, views);
        const observation = {
          scenario: name,
          label,
          ...state,
          ...extra,
          documents: journal.documents,
          errors: [...journal.errors],
          warnings: journal.console
            .filter((entry) => entry.type === "warning")
            .map((entry) => entry.text),
        };

        observations.push(observation);
        await save("observations.json", observations);

        return observation;
      },
      close: () => context.close(),
    };

    async function stable() {
      await page.waitForFunction(() => document.documentElement.dataset.proofStable === "true");
      await idle();
    }

    async function idle() {
      await page.waitForFunction(() => window.proofApp?.router.currentNavigation() === null);
      await page.waitForTimeout(100);
    }
  }

  function clean(observation) {
    assert.deepEqual(observation.errors, [], `${observation.scenario}/${observation.label}`);

    for (const warning of observation.warnings) {
      assert.doesNotMatch(
        warning,
        /not seeded|NG0\d+/,
        `${observation.scenario}/${observation.label}`,
      );
    }
  }

  function href(page, id) {
    return page.locator("#" + id).getAttribute("href");
  }

  const media = join(evidence, "screenshots");

  // Hydration of direct named-outlet links keeps the server's nodes and the active route.
  for (const url of ["/products/(detail:item/3)(chat:chat/7)", "/(chat:chat/7)"]) {
    const view = await session("hydration");

    await view.open(url, { holdScripts: true });

    const ids = ["active-route", "chat", "chat-id"];

    if (url.startsWith("/products")) {
      ids.push("products", "overview", "item");
    } else {
      ids.push("home");
    }

    const before = await view.page.evaluate((ids) => {
      window.proofNodes = ids.map((id) => document.getElementById(id));

      return document.getElementById("active-route").textContent;
    }, ids);

    view.release();
    await view.page.waitForFunction(() => document.documentElement.dataset.proofStable === "true");

    const observation = await view.observe(url, {
      before,
      retained: await view.page.evaluate(
        (ids) => ids.map((id, index) => window.proofNodes[index] === document.getElementById(id)),
        ids,
      ),
    });

    clean(observation);
    assert.deepEqual(
      observation.retained,
      ids.map(() => true),
      url,
    );
    assert.equal(observation.shown["active-route"], before, url);
    await view.close();
  }

  // R1-F1: the server, the first client render while the initial navigation is held, and the
  // commit agree on every composed link; then each link clicked before the commit.
  const held = "/products/(list//detail:item/3)(chat:chat/7)?sort=price&hold=1";
  const linkIds = [
    "shell-open",
    "shell-open-computed",
    "shell-close",
    "shell-close-computed",
    "shell-list",
    "shell-list-computed",
  ];
  const expectedHrefs = {
    "shell-open": "/products/(list//detail:item/3)(chat:chat/8)?sort=price&hold=1",
    "shell-open-computed": "/products/(list//detail:item/3)(chat:chat/8)?sort=price&hold=1",
    "shell-close": "/products/(list//detail:item/3)?sort=price&hold=1",
    "shell-close-computed": "/products/(list//detail:item/3)?sort=price&hold=1",
    "shell-list": "/products/(list//detail:item/3)(chat:chat/7)?page=2",
    "shell-list-computed": "/products/(list//detail:item/3)(chat:chat/7)?page=2",
  };

  {
    const view = await session("first-client");

    await view.open(held, { holdScripts: true });

    const server = {};

    for (const id of linkIds) {
      server[id] = await href(view.page, id);
    }

    view.release();
    await view.page.waitForFunction(() => window.proofFirstClient !== undefined);

    const first = await view.page.evaluate(() => window.proofFirstClient);

    await view.page.screenshot({ path: join(media, "F1-first-client.png") });
    await view.page.evaluate(() => window.proofProbe.release.forEach((release) => release()));
    await view.page.waitForFunction(() => document.documentElement.dataset.proofStable === "true");

    const committed = {};

    for (const id of linkIds) {
      committed[id] = await href(view.page, id);
    }

    const observation = await view.observe("server-first-commit", { server, first, committed });

    clean(observation);
    assert.equal(first.committed, false);
    assert.equal(first.active, "list");
    assert.deepEqual(server, expectedHrefs);
    assert.deepEqual(first.hrefs, expectedHrefs);
    assert.deepEqual(committed, expectedHrefs);
    await view.close();
  }

  for (const [id, url, views] of [
    ["shell-list", expectedHrefs["shell-list"], ["list", "item", "chat"]],
    ["shell-list-computed", expectedHrefs["shell-list-computed"], ["list", "item", "chat"]],
    ["shell-open", expectedHrefs["shell-open"], ["list", "item", "chat"]],
    ["shell-close", expectedHrefs["shell-close"], ["list", "item"]],
  ]) {
    const view = await session("pre-commit-click");

    await view.open(held, { holdScripts: true });
    await view.page.evaluate(
      (ids) => {
        window.proofNodes = ids.map((id) => document.getElementById(id));
      },
      ["products", "list", "item", "active-route"],
    );
    view.release();
    await view.page.waitForFunction(() => window.proofFirstClient !== undefined);
    await view.page.click("#" + id);
    await view.page.waitForFunction((url) => window.proofApp.router.url === url, url);

    const observation = await view.observe(id, {
      retained: await view.page.evaluate(
        (ids) => ids.map((id, index) => window.proofNodes[index] === document.getElementById(id)),
        ["products", "list", "item", "active-route"],
      ),
    });

    clean(observation);
    assert.equal(observation.routerUrl, url);
    assert.deepEqual(observation.retained, [true, true, true, true], id);

    for (const shown of views) {
      assert.ok(shown in observation.shown, `${id}: #${shown}`);
    }

    if (id === "shell-open") {
      assert.equal(observation.shown["chat-id"], "8");
    }

    if (id === "shell-close") {
      assert.ok(!("chat" in observation.shown));
    }

    // R2-F1 unseeded: the click retired the seed before any commit; the entry the commit
    // created composes and navigates outside any injection context.
    if (id === "shell-list") {
      assert.equal(
        await href(view.page, "shell-open"),
        "/products/(list//detail:item/3)(chat:chat/8)?page=2",
      );
      assert.equal(
        await view.page.evaluate(() =>
          window.proofApp.active().navigate({ to: window.proofDestinations.chat, close: true }),
        ),
        true,
      );
      clean(await view.observe("unseeded-entry-close"));
      assert.equal(
        await view.page.evaluate(() => window.proofApp.router.url),
        "/products/(list//detail:item/3)?page=2",
      );
    }

    await view.close();
  }

  // Composition, replacement, close and history on one document.
  {
    const view = await session("flow", { video: true });
    const page = view.page;

    await view.open("/products/list(chat:chat/7)");
    clean(await view.observe("S1 root chat beside list"));
    await page.screenshot({ path: join(media, "S1-root-chat.png") });

    const entries = [];
    const record = async (label) => {
      const observation = await view.observe(label);

      clean(observation);
      entries.push(observation);

      return observation;
    };

    assert.equal(await href(page, "list-item"), "/products/(list//detail:item/3)(chat:chat/7)");
    await page.evaluate(() => {
      window.proofList = document.getElementById("list");
    });
    await page.click("#list-item");

    let state = await record("open detail");

    assert.equal(state.routerUrl, "/products/(list//detail:item/3)(chat:chat/7)");
    assert.equal(state.shown["item-id"], "3");
    assert.equal(
      await page.evaluate(() => window.proofList === document.getElementById("list")),
      true,
    );
    assert.equal(await page.locator("#shell-products").getAttribute("class"), "active");
    await page.screenshot({ path: join(media, "S1-nested-detail.png") });

    await page.click("#list-page-template");
    state = await record("query-only primary");
    assert.equal(state.routerUrl, "/products/(list//detail:item/3)(chat:chat/7)?page=2");

    await page.click("#shell-open");
    state = await record("shell opens chat 8");
    assert.equal(state.routerUrl, "/products/(list//detail:item/3)(chat:chat/8)?page=2");

    await page.click("#chat-next");
    state = await record("chat replaces itself");
    assert.equal(state.routerUrl, "/products/(list//detail:item/3)(chat:chat/9)?page=2");

    await page.click("#item-next");
    state = await record("detail replaces itself");
    assert.equal(state.routerUrl, "/products/(list//detail:item/4)(chat:chat/9)?page=2");

    await page.click("#chat-close");
    state = await record("chat closes");
    assert.equal(state.routerUrl, "/products/(list//detail:item/4)?page=2");
    assert.ok(!("chat" in state.shown));
    await page.screenshot({ path: join(media, "close-flow.png") });

    await page.click("#shell-open");
    state = await record("chat reopens");
    await page.click("#list-plain");
    state = await record("primary leaves the anchor");
    assert.equal(state.routerUrl, "/plain(chat:chat/8)");
    assert.ok(!("item" in state.shown));

    await page.evaluate(() => window.proofApp.router.navigateByUrl("/plain"));
    state = await record("exact URL clears every branch");
    assert.equal(state.routerUrl, "/plain");
    assert.equal(state.documents, 1);

    // Each history entry restores its URL, views and active route.
    const visited = entries.map((entry) => entry.routerUrl);

    for (let index = visited.length - 2; index >= 0; index -= 1) {
      await page.goBack();

      const back = await view.observe("back " + index);

      clean(back);
      assert.equal(back.routerUrl, visited[index]);
      assert.deepEqual(back.shown, entries[index].shown);
    }

    for (let index = 1; index < visited.length; index += 1) {
      await page.goForward();

      const forward = await view.observe("forward " + index);

      clean(forward);
      assert.equal(forward.routerUrl, visited[index]);
      assert.deepEqual(forward.shown, entries[index].shown);
    }

    assert.equal(view.journal.documents, 1);
    await page.waitForTimeout(500);
    await view.close();
  }

  // Closes: from inside the branch, by destination, with nothing to close, and the reload control.
  {
    const view = await session("close");
    const page = view.page;
    const run = (label, body, argument) =>
      page.evaluate(body, argument).then((value) => ({ label, value }));

    await view.open("/products/list(chat:chat/7/settings)");
    await page.click("#settings-close");
    clean(await view.observe("settings closes the whole branch"));
    assert.equal(await page.evaluate(() => window.proofApp.router.url), "/products/list");

    await view.open("/plain(chat:unknown/path)");
    await page.click("#shell-close");
    clean(await view.observe("close by destination closes the catchall"));
    assert.equal(await page.evaluate(() => window.proofApp.router.url), "/plain");

    // Absent and mismatched: the URL is unchanged and Angular's default policy skips it.
    await view.open("/products/list?sort=name");
    assert.equal(await href(page, "shell-close"), "/products/list?sort=name");

    const absent = await run("absent", () =>
      window.proofApp.active().navigate({ to: window.proofDestinations.chat, close: true }),
    );

    await view.open("/products/(list//detail:item/3)");

    const mismatched = await run("mismatched", () =>
      window.proofApp.active().navigate({ to: window.proofDestinations.teamItem, close: true }),
    );

    clean(await view.observe("no-op closes", { absent, mismatched }));
    assert.equal(absent.value, false);
    assert.equal(mismatched.value, false);
    assert.equal(
      await page.evaluate(() => window.proofApp.router.url),
      "/products/(list//detail:item/3)",
    );

    // Reload control: Angular reprocesses the URL, so home's canMatch runs again; activation
    // guards and resolvers follow runGuardsAndResolvers (paramsChange), so its resolver doesn't.
    await view.open("/");

    const before = await page.evaluate(() => ({
      matches: window.proofProbe.calls.filter((call) => call.scope === "home").length,
      resolves: window.proofProbe.homeResolves,
    }));
    const reload = await run("reload", () =>
      window.proofApp.active().navigate({
        to: window.proofDestinations.chat,
        close: true,
        onSameUrlNavigation: "reload",
      }),
    );
    const after = await page.evaluate(() => ({
      matches: window.proofProbe.calls.filter((call) => call.scope === "home").length,
      resolves: window.proofProbe.homeResolves,
    }));
    const reloaded = await view.observe("reload control", { before, after, reload });

    clean(reloaded);
    assert.equal(reload.value, true);
    assert.equal(reloaded.routerUrl, "/");
    assert.equal(after.matches, before.matches + 1);
    assert.equal(after.resolves, before.resolves);

    // A dynamic anchor closes at the concrete team; another team drops the detail.
    await view.open("/teams/4/(detail:item/3)");
    await page.click("#team-item-close");
    clean(await view.observe("dynamic anchor close"));
    assert.equal(await page.evaluate(() => window.proofApp.router.url), "/teams/4");

    await view.open("/teams/4/(list//detail:item/3)(chat:chat/7)");
    await page.evaluate(() =>
      window.proofApp
        .active()
        .navigate({ to: window.proofDestinations.teamList, params: { teamId: 5 } }),
    );

    const team = await view.observe("another team");

    clean(team);
    assert.equal(team.routerUrl, "/teams/5/list(chat:chat/7)");
    assert.ok(!("team-item" in team.shown));
    await view.close();
  }

  // An empty-path primary parent: the aside branch anchors at account.
  {
    const view = await session("empty-path-parent");
    const page = view.page;

    await view.open("/account/(profile//aside:help)");

    const direct = await view.observe("direct");

    clean(direct);
    assert.ok(
      "account-layout" in direct.shown && "profile" in direct.shown && "help" in direct.shown,
    );
    await page.evaluate(() => window.proofApp.router.navigateByUrl("/account/profile"));
    assert.equal(await href(page, "help-open"), "/account/(profile//aside:help)");
    await page.click("#help-open");
    clean(await view.observe("open aside"));
    assert.equal(
      await page.evaluate(() => window.proofApp.router.url),
      "/account/(profile//aside:help)",
    );
    await page.click("#help-close");

    const closed = await view.observe("close aside");

    clean(closed);
    assert.equal(closed.routerUrl, "/account/profile");
    assert.ok(!("help" in closed.shown));
    await view.close();
  }

  // R1-F3: an empty leaf at an anchor runs its matching callbacks only where it ends the path.
  {
    const view = await session("guards");
    const page = view.page;
    const navigate = (url) =>
      page.evaluate(async (url) => {
        const start = performance.now();

        // The probe exists once a guard has run in this document.
        window.proofProbe?.calls.splice(0);
        await window.proofApp.router.navigateByUrl(url);

        return {
          url: window.proofApp.router.url,
          calls: [...(window.proofProbe?.calls ?? [])],
          elapsed: performance.now() - start,
        };
      }, url);
    const results = [];

    for (const [from, to, scope] of [
      ["/", "/products/list?guard=redirect", "home"],
      ["/", "/plain?guard=async", "home"],
      ["/products", "/products/list?guard=redirect", "overview"],
      ["/products", "/products/list?guard=async", "overview"],
    ]) {
      await view.open(from);

      const result = { from, to, ...(await navigate(to)) };

      results.push(result);
      assert.equal(result.url, to);
      assert.ok(!result.calls.some((call) => call.scope === scope), JSON.stringify(result));
      assert.ok(result.elapsed < 1500, JSON.stringify(result));
    }

    for (const [to, expected, scope] of [
      ["/(chat:chat/7)?guard=redirect", "/login", "home"],
      ["/products/(detail:item/3)?guard=redirect", "/login", "overview"],
      ["/(chat:chat/7)?guard=async", "/(chat:chat/7)?guard=async", "home"],
      [
        "/products/(detail:item/3)?guard=async",
        "/products/(detail:item/3)?guard=async",
        "overview",
      ],
    ]) {
      await view.open("/plain");

      const result = { from: "/plain", to, ...(await navigate(to)) };

      results.push(result);
      assert.equal(result.url, expected);
      assert.ok(
        result.calls.some((call) => call.scope === scope),
        JSON.stringify(result),
      );

      if (to.endsWith("async")) {
        assert.ok(result.elapsed >= 1900, JSON.stringify(result));
      }
    }

    clean(await view.observe("guards", { results }));
    await view.close();
  }

  // R1-F4, R1-F5, redirects, unknown chat paths and lazy children tables.
  {
    const view = await session("tables");
    const page = view.page;

    await view.open("/products/%28detail%3Aitem%29");
    await page.click("#literal-child");
    clean(await view.observe("literal child"));
    // Angular's serializer leaves ":" in a segment; the parentheses stay escaped.
    assert.equal(await href(page, "literal-up"), "/products/%28detail:item%29");

    await view.open("/products/(detail:item)");

    const branch = await view.observe("branch item");

    clean(branch);
    assert.ok(
      "overview" in branch.shown && "item-static" in branch.shown && !("literal" in branch.shown),
    );

    await view.open("/plain");
    assert.equal(
      await page.evaluate(() =>
        window.proofApp
          .active()
          .link({ to: window.proofDestinations.chatRest, params: { rest: ["a", "b"] } })
          .toString(),
      ),
      "/plain(chat:a/b)",
    );
    assert.match(
      await page.evaluate(() => {
        try {
          window.proofApp
            .active()
            .link({ to: window.proofDestinations.chatRest, params: { rest: [] } });

          return "no error";
        } catch (error) {
          return String(error);
        }
      }),
      /^TypeError: A destination in outlet chat needs at least one path segment: src\/routes\/chat\/\$rest\[\]\/route\.ts$/,
    );

    // Narrowed by is(), the active route's targeted forms throw for a zero-segment group before
    // Angular starts a navigation, and take `[]` where the accumulated group keeps `files`.
    const narrowed = await page.evaluate(() => {
      const { router } = window.proofApp;
      const { plain, chatRest, filesRest } = window.proofDestinations;
      const active = window.proofApp.active();
      const starts = [];
      // EventType.NavigationStart.
      const subscription = router.events.subscribe((event) => {
        if (event.type === 0) {
          starts.push(event.url);
        }
      });
      const attempt = (call) => {
        try {
          call();

          return "no error";
        } catch (error) {
          return String(error);
        }
      };
      const empty = { to: chatRest, params: { rest: [] } };
      const result = {
        is: active.is(plain),
        link: attempt(() => active.link(empty)),
        navigate: attempt(() => active.navigate(empty)),
        accepted: active.link({ to: filesRest, params: { rest: [] } }).toString(),
        url: router.url,
        starts,
      };

      subscription.unsubscribe();

      return result;
    });
    const zeroSegments =
      /^TypeError: A destination in outlet chat needs at least one path segment: src\/routes\/chat\/\$rest\[\]\/route\.ts$/;

    assert.equal(narrowed.is, true);
    assert.match(narrowed.link, zeroSegments);
    assert.match(narrowed.navigate, zeroSegments);
    assert.deepEqual(narrowed.starts, []);
    assert.equal(narrowed.url, "/plain");
    assert.equal(narrowed.accepted, "/plain(chat:files)");
    assert.equal(
      await page.evaluate(() =>
        window.proofApp
          .active()
          .navigate({ to: window.proofDestinations.filesRest, params: { rest: [] } }),
      ),
      true,
    );

    const files = await view.observe("narrowed empty catchall", { narrowed });

    clean(files);
    assert.equal(files.routerUrl, "/plain(chat:files)");
    assert.ok("plain" in files.shown && "chat-files" in files.shown, JSON.stringify(files.shown));
    assert.equal(files.shown["chat-files-path"], "");

    await view.open("/(chat:a/b)");
    assert.equal((await view.observe("catchall")).shown["chat-rest-path"], "a/b");
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.proofStable === "true");
    assert.equal((await view.observe("catchall reload")).shown["chat-rest-path"], "a/b");
    await page.click("#chat-rest-close");

    const closed = await view.observe("catchall close");

    clean(closed);
    assert.equal(closed.routerUrl, "/");
    assert.ok(!("chat-rest" in closed.shown) && "home" in closed.shown);

    await page.evaluate(() => window.proofApp.router.navigateByUrl("/old-item/3?sort=price"));

    const item = await view.observe("redirect into detail");

    clean(item);
    assert.equal(item.routerUrl, "/products/(detail:item/3)?sort=price");
    assert.equal(item.shown["products-sort"], "price");
    assert.ok("overview" in item.shown && item.shown["item-id"] === "3");

    // chat/:id's lazy loads happen once, when the chat record first matches; settings and
    // another chat reuse them.
    await view.open("/plain");

    const loadsOf = () =>
      page.evaluate(() => window.proofLoads.filter((load) => load.startsWith("chat:")).length);
    const initial = await loadsOf();

    await page.evaluate(() => window.proofApp.router.navigateByUrl("/plain(chat:chat/7)"));

    const opened = await loadsOf();

    await page.evaluate(() => window.proofApp.router.navigateByUrl("/plain(chat:chat/7/settings)"));
    await page.evaluate(() => window.proofApp.router.navigateByUrl("/plain(chat:chat/8/settings)"));

    const loads = await view.observe("lazy tables", {
      initial,
      opened,
      settings: await loadsOf(),
      all: await page.evaluate(() => [...window.proofLoads]),
    });

    clean(loads);
    assert.equal(initial, 0);
    assert.ok(opened >= 1);
    assert.equal(loads.settings, opened);
    assert.ok("settings" in loads.shown);
    await view.close();
  }

  // A redirect into a root-level branch renders what loading its URL does: home beside chat,
  // through home's guard and resolver, and only where the root config has an empty-path
  // primary route that matches by prefix.
  {
    const view = await session("root redirect");
    const page = view.page;
    const navigate = (url) =>
      page.evaluate(async (url) => {
        const probe = window.proofProbe;
        const before = probe?.homeResolves ?? 0;
        const start = performance.now();

        probe?.calls.splice(0);

        const result = await window.proofApp.router.navigateByUrl(url);

        return {
          url,
          result,
          routerUrl: window.proofApp.router.url,
          calls: [...(window.proofProbe?.calls ?? [])],
          resolves: (window.proofProbe?.homeResolves ?? 0) - before,
          elapsed: performance.now() - start,
        };
      }, url);
    const homeCalls = (run) => run.calls.filter((call) => call.scope === "home");

    await view.open("/plain");

    const allowed = await navigate("/old-chat/7");
    const redirected = await view.observe("redirect into chat", { run: allowed });

    clean(redirected);
    assert.equal(allowed.result, true);
    assert.equal(redirected.routerUrl, "/(chat:chat/7)");
    assert.equal(redirected.href, "/(chat:chat/7)");
    assert.equal(redirected.shown["chat-id"], "7");
    assert.ok("home" in redirected.shown, JSON.stringify(redirected.shown));
    assert.equal(redirected.shown["active-route"], "home");
    assert.ok(!("missing" in redirected.shown), JSON.stringify(redirected.shown));
    // Home's matching guard ran once where it ends the primary path, and its resolver once.
    assert.deepEqual(homeCalls(allowed), [{ scope: "home", segments: [] }]);
    assert.equal(allowed.resolves, 1);
    await page.screenshot({ path: join(media, "R-root-redirect.png") });

    // Its URL loaded directly agrees.
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.proofStable === "true");

    const reloaded = await view.observe("redirected URL reloaded");

    clean(reloaded);
    assert.ok("home" in reloaded.shown && reloaded.shown["chat-id"] === "7");
    assert.equal(reloaded.shown["active-route"], "home");

    // Home's guard redirects or waits on the redirected tree as on a direct one; the guard
    // reads the flag from the navigation's original URL.
    await navigate("/plain");

    const refused = await navigate("/old-chat/7?guard=redirect");

    assert.equal(refused.routerUrl, "/login", JSON.stringify(refused));
    assert.equal(homeCalls(refused).length, 1, JSON.stringify(refused));
    assert.equal(refused.resolves, 0);
    await navigate("/plain");

    const waited = await navigate("/old-chat/7?guard=async");

    assert.equal(waited.routerUrl, "/(chat:chat/7)", JSON.stringify(waited));
    assert.ok(waited.elapsed >= 1900, JSON.stringify(waited));
    assert.equal(homeCalls(waited).length, 1, JSON.stringify(waited));
    assert.equal(waited.resolves, 1);

    const guarded = await view.observe("guarded redirects", { refused, waited });

    clean(guarded);
    assert.ok("home" in guarded.shown && guarded.shown["chat-id"] === "7");

    // The source's query and fragment, kept on the returned tree.
    await navigate("/plain");

    const kept = await navigate("/old-chat-kept/7?x=1#f");
    const preserved = await view.observe("redirect keeps query and fragment", { run: kept });

    clean(preserved);
    assert.equal(preserved.routerUrl, "/(chat:chat/7)?x=1#f");
    assert.equal(preserved.href, "/(chat:chat/7)?x=1#f");
    assert.ok("home" in preserved.shown && preserved.shown["chat-id"] === "7");

    // Without an eligible empty primary route the tree stays as built: the zero-segment root
    // catchall doesn't activate, as on a direct load of the same URL.
    for (const variant of ["no home", "full-match home"]) {
      await navigate("/plain");
      await page.evaluate((variant) => {
        const router = window.proofApp.router;

        window.proofConfig ??= router.config;

        const config = [];

        for (const route of window.proofConfig) {
          const home = route.path === "" && !route.outlet;

          if (!home) {
            config.push(route);
          } else if (variant === "full-match home") {
            config.push({ ...route, pathMatch: "full" });
          }
        }

        router.resetConfig(config);
      }, variant);

      const run = await navigate("/old-chat/7");
      const bare = await view.observe(`redirect, ${variant}`, { run });

      clean(bare);
      assert.equal(bare.routerUrl, "/(chat:chat/7)");
      assert.equal(bare.shown["chat-id"], "7");
      assert.ok(!("home" in bare.shown), JSON.stringify(bare.shown));
      assert.ok(!("missing" in bare.shown), JSON.stringify(bare.shown));
      assert.equal(bare.shown["active-route"], "none");
      assert.equal(run.resolves, 0);
    }

    await page.evaluate(() => window.proofApp.router.resetConfig(window.proofConfig));
    await view.close();
  }

  // R2-F1 seeded: a hydrated shell's active signal is first read in its template; the entry a
  // later commit creates composes and navigates.
  {
    const view = await session("seeded-later-entry");
    const page = view.page;

    await view.open("/products/list(chat:chat/7)");
    await page.click("#list-plain");
    clean(await view.observe("plain"));
    assert.equal(await href(page, "shell-open"), "/plain(chat:chat/8)");
    assert.equal(
      await page.evaluate(() =>
        window.proofApp.active().navigate({ to: window.proofDestinations.chat, close: true }),
      ),
      true,
    );

    const closed = await view.observe("closed");

    clean(closed);
    assert.equal(closed.routerUrl, "/plain");
    await view.close();
  }
} catch (error) {
  // Angular's dev server handles uncaught errors itself, so a failure sets the exit code here.
  process.exitCode = 1;

  throw error;
} finally {
  await save("observations.json", observations);
  await save("serve-report.json", { outputs, logs });
  await browser?.close();
  await serve.stop();
}

console.log(
  `outlets proof: ${ssr.length} SSR requests, ${observations.length} browser observations`,
);

// Named outlets beside sibling pathless groups (SPEC §8): a root branch composes with either
// group's pages, and a branch anchored below a group's page renders inside it. When every route
// of a named outlet refuses its segments, Angular tries them against the groups too, with no
// outlet to tell them apart from primary ones: a group whose claims fit runs its canMatch (whose
// UrlTree redirects the navigation) or loads its table before NG04002. These rows pin that
// native limit, so a change in either direction shows.
const { buildFixture, chunkSources, errorCodes, siblingFixture, staticServer, visitCold } =
  await import("./sibling-groups.mjs");
const siblings = join(evidence, "sibling-groups");
const siblingObservations = {};
const siblingBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const authenticatedTable = "src/routes/+authenticated/children.generated.ts";
const signedInTable = "src/routes/+signed-in/children.generated.ts";

await mkdir(siblings);

// Builds one tree and opens each URL cold. Every row is recorded before any assertion.
async function siblingTree(name, options, urls) {
  const directory = await siblingFixture(siblings, name, options);

  await buildFixture(directory);

  const chunks = await chunkSources(directory);
  const server = await staticServer(directory);
  const result = {};

  try {
    for (const url of urls) {
      const slug = url.replace(/[^a-z0-9]+/gi, "_");
      const visit = await visitCold(siblingBrowser, server.base, chunks, url, {
        screenshot: join(siblings, `${name}-${slug}.png`),
      });

      result[url] = visit.seen;
      await visit.close();
    }
  } finally {
    await server.close();
    siblingObservations[name] = result;
    await save("sibling-groups.json", siblingObservations);
  }

  return result;
}

// What a row settled to, in the terms the expectations below use.
function row(seen) {
  return {
    url: seen.url,
    rendered: seen.rendered,
    calls: seen.calls.slice(1),
    tables: seen.tables,
    errors: errorCodes(seen),
  };
}

// The refused-branch rows prototype-3 observed with ownership on, per URL: the root chat branch
// refuses unless ?aux=allow (its guard) or for chat/nope (its numberParam codec).
const pierced = {
  "/profile(chat:chat/1)?auth=redirect": {
    url: "/blocked",
    rendered: ["blocked"],
    calls: ["signed-in:canMatch", "chat:canMatch:false", "authenticated:canMatch"],
    tables: [signedInTable],
    errors: [],
  },
  "/profile(chat:chat/1)": {
    url: "/",
    rendered: [],
    calls: ["signed-in:canMatch", "chat:canMatch:false", "authenticated:canMatch"],
    tables: [authenticatedTable, signedInTable],
    errors: ["NG04002"],
  },
  "/profile(chat:chat/nope)?aux=allow&auth=redirect": {
    url: "/blocked",
    rendered: ["blocked"],
    calls: ["signed-in:canMatch", "authenticated:canMatch"],
    tables: [signedInTable],
    errors: [],
  },
  "/profile(chat:chat/nope)?aux=allow": {
    url: "/",
    rendered: [],
    calls: ["signed-in:canMatch", "authenticated:canMatch"],
    tables: [authenticatedTable, signedInTable],
    errors: ["NG04002"],
  },
  "/profile(chat:chat/1)?aux=allow": {
    url: "/profile(chat:chat/1)?aux=allow",
    rendered: ["signed-in", "profile", "chat-panel"],
    calls: ["signed-in:canMatch", "chat:canMatch:true"],
    tables: [signedInTable],
    errors: [],
  },
  "/profile": {
    url: "/profile",
    rendered: ["signed-in", "profile"],
    calls: ["signed-in:canMatch"],
    tables: [signedInTable],
    errors: [],
  },
};

try {
  const composed = await siblingTree("anchored", { chat: "anchored" }, [
    "/(chat:chat/1)?aux=allow",
    "/profile(chat:chat/1)?aux=allow",
    "/inbox(chat:chat/1)?aux=allow",
    "/products/(detail:item/1)",
    "/profile(chat:chat/nope)?aux=allow",
  ]);

  assert.deepEqual(composed["/(chat:chat/1)?aux=allow"].rendered, [
    "signed-in",
    "index",
    "chat-panel",
  ]);
  assert.deepEqual(composed["/profile(chat:chat/1)?aux=allow"].rendered, [
    "signed-in",
    "profile",
    "chat-panel",
  ]);
  assert.deepEqual(composed["/inbox(chat:chat/1)?aux=allow"].rendered, [
    "authenticated",
    "inbox",
    "chat-panel",
  ]);
  assert.deepEqual(composed["/products/(detail:item/1)"].rendered, [
    "authenticated",
    "authenticated-products",
    "detail-panel",
  ]);
  // No group claims chat/nope, so both ownership guards refuse it: no authored group guard
  // runs for the refused branch, and no other table loads.
  assert.deepEqual(row(composed["/profile(chat:chat/nope)?aux=allow"]), {
    url: "/",
    rendered: [],
    calls: ["signed-in:canMatch"],
    tables: [signedInTable],
    errors: ["NG04002"],
  });

  // A primary +authenticated/chat/$id, then a +authenticated catchall, beside the branch. The
  // catchall group sorts last and still receives the refused branch's segments.
  for (const [name, options] of [
    ["exact", { chat: "exact" }],
    ["catchall", { chat: "branch", catchall: true }],
  ]) {
    const rows = await siblingTree(name, options, Object.keys(pierced));

    for (const [url, expected] of Object.entries(pierced)) {
      assert.deepEqual(row(rows[url]), expected, `${name} ${url}`);
    }
  }
} catch (error) {
  // The dev server above left Angular's uncaught-error handler installed, so set the code here.
  process.exitCode = 1;

  throw error;
} finally {
  await siblingBrowser.close();
}

console.log("outlets proof: named outlets beside sibling pathless groups passed");
