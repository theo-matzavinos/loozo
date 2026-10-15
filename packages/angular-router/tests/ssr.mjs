import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { get } from "node:http";
import { createServer } from "node:net";
import { cp, lstat, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");

if (process.argv.length !== 3 || !isAbsolute(process.argv[2])) {
  throw new Error("Usage: node tests/ssr.mjs /absolute/owned/absent-evidence-directory");
}

const evidence = resolve(process.argv[2]);

await mkdir(evidence);

const fixture = join(evidence, "consumer");

await cp(join(repository, "examples/angular-router/ssr-proof"), fixture, {
  recursive: true,
  filter: (path) => !/(?:^|\/)(?:node_modules|dist|\.angular|out-tsc)(?:\/|$)/.test(path),
});

// A root not-found catchall, so invalid path params have somewhere to fall through to.
await mkdir(join(fixture, "src/routes/missing"));
await writeFile(
  join(fixture, "src/routes/missing/definition.ts"),
  `import { defineRoute, stringParam } from "@loozo/angular-router";

export default defineRoute("$segments[]", { params: { segments: stringParam } });
`,
);
await writeFile(
  join(fixture, "src/routes/missing/page.ts"),
  `import { Component } from "@angular/core";

@Component({ template: '<p id="missing">Not found</p>' })
export default class Missing {}
`,
);

const metadataText = await readFile(join(packageDirectory, "package.json"), "utf8");
const metadata = JSON.parse(metadataText);

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
const logger = new core.logging.Logger("ssr");

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

async function generatedInventory() {
  const result = {};

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name.endsWith(".generated.ts")) {
        const status = await lstat(path, { bigint: true });
        const bytes = await readFile(path);

        result[path.slice(fixture.length + 1)] = {
          sha256: createHash("sha256").update(bytes).digest("hex"),
          mode: Number(status.mode & 0o777n),
          size: Number(status.size),
          mtimeNs: status.mtimeNs.toString(),
        };
      }
    }
  }

  await visit(join(fixture, "src"));
  await visit(join(fixture, "generated"));

  return result;
}

const build = await architect.scheduleTarget({ project: "proof", target: "build" }, {}, { logger });

try {
  const output = await build.result;

  await save("build-report.json", { output, logs });
  assert.equal(output.success, true, JSON.stringify(logs));
} finally {
  await build.stop();
}

const beforeCheck = await generatedInventory();

await save("generated-check-before.json", beforeCheck);

const check = await architect.scheduleTarget(
  { project: "proof", target: "build", configuration: "ci" },
  {},
  { logger },
);

try {
  const output = await check.result;

  await save("check-report.json", { output, logs });
  assert.equal(output.success, true, JSON.stringify(logs));
} finally {
  await check.stop();
}

const afterCheck = await generatedInventory();

await save("generated-check-after.json", afterCheck);
assert.deepEqual(afterCheck, beforeCheck);

for (const [name, binary] of [
  ["tsc", require.resolve("typescript/lib/tsc.js")],
  [
    "ngc",
    join(dirname(require.resolve("@angular/compiler-cli/package.json")), "bundles/src/bin/ngc.js"),
  ],
]) {
  const command = [
    binary,
    "-p",
    join(fixture, "tsconfig.app.json"),
    "--noEmit",
    "--skipLibCheck",
    "false",
  ];
  const result = spawnSync(process.execPath, command, { cwd: fixture, encoding: "utf8" });

  await save(`strict-${name}.command.json`, {
    cwd: fixture,
    command: [process.execPath, ...command],
  });
  await writeFile(join(evidence, `strict-${name}.stdout`), result.stdout);
  await writeFile(join(evidence, `strict-${name}.stderr`), result.stderr);
  await writeFile(join(evidence, `strict-${name}.exit`), String(result.status) + "\n");
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

const statsText = await readFile(join(fixture, "dist/proof/browser-stats.json"), "utf8");
const stats = JSON.parse(statsText);
let mainPath;
let lazyItem = false;
let browserOutputs = 0;
const browserInputs = new Set();

for (const [file, output] of Object.entries(stats.outputs)) {
  const serverOutput = file.endsWith(".mjs") || file.includes("/server/");

  if (serverOutput || !file.endsWith(".js")) {
    continue;
  }

  browserOutputs += 1;

  if (output.entryPoint?.endsWith("src/main.ts")) {
    mainPath = file;
  }

  for (const input of Object.keys(output.inputs)) {
    browserInputs.add(input);
    assert.doesNotMatch(
      input,
      /node_modules\/(?:@angular\/build|@angular\/compiler(?:-cli)?|@angular-devkit\/|typescript\/|chokidar\/)/,
    );

    assert.doesNotMatch(input, /packages\/angular-router\/node\/|\/src\/(?:generation|builders)\//);

    if (input.endsWith("src/routes/item/page.ts") && output.entryPoint !== "src/main.ts") {
      lazyItem = true;
    }
  }

  for (const imported of output.imports) {
    assert.doesNotMatch(imported.path, /^(?:node:|fs$|fs\/|path$|child_process$|worker_threads$)/);
  }
}

assert.ok(browserOutputs > 0);
assert.ok(mainPath);
assert.equal(lazyItem, true);

const eagerPaths = [mainPath];
const visited = new Set();

for (let index = 0; index < eagerPaths.length; index += 1) {
  const file = eagerPaths[index];

  if (visited.has(file)) {
    continue;
  }

  visited.add(file);

  const output = stats.outputs[file];

  for (const input of Object.keys(output.inputs)) {
    assert.equal(
      input.endsWith("src/routes/item/page.ts"),
      false,
      "page must remain genuinely lazy",
    );
  }

  for (const imported of output.imports) {
    if (imported.external || imported.kind === "dynamic-import") {
      continue;
    }

    let next = imported.path;

    if (!stats.outputs[next]) {
      next = posix.normalize(posix.join(posix.dirname(file), next));
    }

    assert.ok(stats.outputs[next], "native metafile import " + next);
    eagerPaths.push(next);
  }
}

const reachablePaths = [{ file: mainPath, dynamic: false }];
const reachable = new Set();
const reachableWithDynamic = new Set();
const dynamicEdges = [];
let dynamicallyReachableItem = false;

for (let index = 0; index < reachablePaths.length; index += 1) {
  const { file, dynamic } = reachablePaths[index];
  let seen = reachable;

  if (dynamic) {
    seen = reachableWithDynamic;
  }

  if (seen.has(file)) {
    continue;
  }

  seen.add(file);

  const output = stats.outputs[file];

  for (const input of Object.keys(output.inputs)) {
    if (dynamic && input.endsWith("src/routes/item/page.ts")) {
      dynamicallyReachableItem = true;
    }
  }

  for (const imported of output.imports) {
    if (imported.external) {
      continue;
    }

    let next = imported.path;

    if (!stats.outputs[next]) {
      next = posix.normalize(posix.join(posix.dirname(file), next));
    }

    assert.ok(stats.outputs[next], "native reachable metafile import " + next);
    assert.ok(next.endsWith(".js") && !next.includes("/server/"), "browser-only edge " + next);

    const dynamicEdge = imported.kind === "dynamic-import";

    if (dynamicEdge) {
      dynamicEdges.push({ from: file, to: next });
    }

    reachablePaths.push({ file: next, dynamic: dynamic || dynamicEdge });
  }
}

assert.equal(dynamicallyReachableItem, true, "item chunk must be dynamically reachable from main");
await save("browser-closure.json", {
  mainPath,
  browserOutputs,
  browserInputs: [...browserInputs],
  eagerPaths: [...visited],
  reachablePaths: [...reachable],
  reachableWithDynamic: [...reachableWithDynamic],
  dynamicEdges,
  lazyItem,
  dynamicallyReachableItem,
});
await cp(join(fixture, "dist/proof/browser-stats.json"), join(evidence, "production-stats.json"));

function requestSsr(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
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
      request.destroy(new Error("SSR HTTP request timed out: " + url));
    }, timeoutMs);

    request.once("close", () => clearTimeout(timer));
    request.once("error", reject);
  });
}

async function port() {
  const reservation = createServer();

  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));

  const address = reservation.address();

  assert.ok(address && typeof address !== "string");

  const value = address.port;

  await new Promise((resolve, reject) => {
    reservation.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  return value;
}

async function ready(origin) {
  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    try {
      const response = await requestSsr(origin + "/handle-only/1", 3000);

      if (response.status === 200) {
        return;
      }
    } catch {
      // Native server startup only; final requests preserve their actual failure.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Native SSR server did not become ready");
}

function inspectHtml(body) {
  const window = new Window();
  const template = window.document.createElement("template");

  template.innerHTML = body;

  const document = template.content;
  const result = {};

  for (const id of [
    "parsed-team",
    "parsed-id",
    "parsed-score",
    "resolved",
    "handle-id",
    "handle-score",
    "missing",
  ]) {
    result[id] = document.querySelector("#" + id)?.textContent ?? null;
  }

  window.close();

  return result;
}

const httpPort = await port();
const origin = "http://127.0.0.1:" + httpPort;
const nodeCommand = [join(fixture, "dist/proof/server/server.mjs")];
let nodeStdout = "";
let nodeStderr = "";
let nodeClosed;
const nodeFailures = [];
const node = spawn(process.execPath, nodeCommand, {
  cwd: fixture,
  detached: true,
  env: { ...process.env, PORT: String(httpPort) },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  nodeClosed = new Promise((resolve) => {
    node.once("close", resolve);
  });
  node.once("error", (error) => {
    nodeFailures.push(error);
  });
  node.stdout.on("data", (data) => {
    nodeStdout += data.toString();
  });
  node.stderr.on("data", (data) => {
    nodeStderr += data.toString();
  });
  await save("node-server.command.json", {
    cwd: fixture,
    command: [process.execPath, ...nodeCommand],
    PORT: httpPort,
  });
  await ready(origin);

  const alias = await requestSsr(origin + "/teams/7/old-items/7?discard=1&score=42");
  const location = new URL(alias.headers.location, origin);

  await save("http-alias.json", alias);
  assert.equal(alias.status, 302);
  assert.equal(location.pathname + location.search + location.hash, "/teams/7/items/7");

  const urls = ["/teams/7/items/7;teamId=999;id=888?score=42", "/teams/8/items/8?score=43"];
  const requests = [];

  for (const url of urls) {
    requests.push(requestSsr(origin + url));
  }

  const responses = await Promise.all(requests);
  const values = [];

  for (let index = 0; index < responses.length; index += 1) {
    const response = responses[index];

    await save(`http-item-${index}.json`, {
      url: response.url,
      status: response.status,
      headers: response.headers,
    });
    await writeFile(join(evidence, `http-item-${index}.html`), response.body);
    assert.equal(response.status, 200);
    values.push(inspectHtml(response.body));
  }

  assert.deepEqual(values[0], {
    "parsed-team": "7",
    "parsed-id": "7",
    "parsed-score": "42",
    resolved: "team=7;item=7;score=42",
    "handle-id": null,
    "handle-score": null,
    missing: null,
  });
  assert.deepEqual(values[1], {
    "parsed-team": "8",
    "parsed-id": "8",
    "parsed-score": "43",
    resolved: "team=8;item=8;score=43",
    "handle-id": null,
    "handle-score": null,
    missing: null,
  });
  assert.doesNotMatch(responses[0].body, /team=999;|item=888;/);
  assert.notEqual(values[0].resolved, values[1].resolved);

  const started = performance.now();
  const handleOnly = await requestSsr(origin + "/handle-only/31?score=47");
  const elapsedMs = performance.now() - started;
  const handleValues = inspectHtml(handleOnly.body);

  await save("http-handle-only.json", {
    url: handleOnly.url,
    status: handleOnly.status,
    headers: handleOnly.headers,
    elapsedMs,
    values: handleValues,
  });
  await writeFile(join(evidence, "http-handle-only.html"), handleOnly.body);
  assert.equal(handleOnly.status, 200);
  assert.ok(elapsedMs >= 50, "handle-only SSR must await actual delayed codecs");
  assert.equal(handleValues["handle-id"], "31");
  assert.equal(handleValues["handle-score"], "47");
  assert.equal(handleValues.resolved, null);
  assert.equal(handleValues.missing, null);

  // Invalid path params don't match, so the server renders the catchall instead of failing:
  // the synchronous team param, and the delayed item and handle-only params.
  const invalidValues = {};

  for (const url of ["/teams/x/items/7", "/teams/7/items/x?score=42", "/handle-only/x"]) {
    const response = await requestSsr(origin + url);
    const values = inspectHtml(response.body);

    assert.equal(response.status, 200, url);
    assert.equal(values.missing, "Not found", url);
    assert.equal(values.resolved, null, url);
    assert.equal(values["handle-id"], null, url);
    invalidValues[url] = { status: response.status, values };
  }
  await save("http-observations.json", {
    alias: { status: alias.status, location: location.href },
    concurrentValues: values,
    handleOnly: { elapsedMs, values: handleValues },
    invalidValues,
  });
} catch (error) {
  nodeFailures.push(error);
} finally {
  let timer;

  try {
    const pid = node.pid;

    if (pid && node.exitCode === null && node.signalCode === null) {
      timer = setTimeout(() => {
        if (node.exitCode === null && node.signalCode === null) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch (error) {
            nodeFailures.push(error);
          }
        }
      }, 3000);
      process.kill(-pid, "SIGTERM");
    }
  } catch (error) {
    nodeFailures.push(error);
  } finally {
    // CLOSE follows child exit AND stdio drain; exit alone can lose buffered errors.
    await nodeClosed;
    clearTimeout(timer);

    const writes = await Promise.allSettled([
      writeFile(join(evidence, "node-server.stdout"), nodeStdout),
      writeFile(join(evidence, "node-server.stderr"), nodeStderr),
      save("node-server.exit.json", { code: node.exitCode, signal: node.signalCode, closed: true }),
    ]);

    for (const result of writes) {
      if (result.status === "rejected") {
        nodeFailures.push(result.reason);
      }
    }
  }
}

try {
  assert.equal(nodeStderr, "", "Valid native SSR proof must not log stderr errors");
  assert.doesNotMatch(nodeStdout, /unhandledRejection|uncaughtException|\berror\b/i);
} catch (error) {
  nodeFailures.push(error);
}

if (nodeFailures.length > 0) {
  process.exitCode = 1;

  throw new AggregateError(
    nodeFailures,
    "Native SSR HTTP proof or cleanup failed; raw channels retained",
  );
}

const outputs = [];
let subscription;
let browser;
let allowScripts;
const browserFailures = [];
const serve = await architect.scheduleTarget({ project: "proof", target: "serve" }, {}, { logger });

try {
  subscription = serve.output.subscribe((output) => outputs.push(output));

  const deadline = Date.now() + 90000;

  while (!outputs.some((output) => output.success && output.baseUrl)) {
    assert.ok(Date.now() < deadline, JSON.stringify(logs));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const output = outputs.find((output) => output.success && output.baseUrl);
  const baseUrl = new URL(output.baseUrl).origin;
  const response = await requestSsr(baseUrl + "/teams/7/items/7;teamId=999?score=42");

  await save("dev-ssr.json", {
    url: response.url,
    status: response.status,
    headers: response.headers,
  });
  await writeFile(join(evidence, "dev-ssr.html"), response.body);
  assert.equal(response.status, 200);

  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const consoleMessages = [];
  const requests = [];
  let documents = 0;

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });

    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("request", (request) => {
    requests.push({
      url: request.url(),
      resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(),
    });

    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documents += 1;
    }
  });

  const scripts = new Promise((resolve) => {
    allowScripts = resolve;
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin !== baseUrl) {
      await route.abort();

      return;
    }

    if (request.resourceType() === "script") {
      await scripts;
    }

    await route.continue();
  });
  await page.goto(baseUrl + "/teams/7/items/7;teamId=999?score=42", { waitUntil: "commit" });
  await page.waitForSelector("#resolved", { state: "attached" });

  const before = await page.evaluate(() => {
    const selectors = [
      "proof-item",
      "#item-article",
      "#parsed",
      "#resolved",
      "#parsed-team",
      "#parsed-id",
      "#parsed-score",
    ];
    const nodes = [document];

    for (const selector of selectors) {
      const node = document.querySelector(selector);

      if (!node) {
        throw new Error("Missing original SSR node: " + selector);
      }

      nodes.push(node);
    }

    const textNodes = [];

    for (const selector of ["#parsed-team", "#parsed-id", "#parsed-score", "#resolved"]) {
      textNodes.push(document.querySelector(selector).firstChild);
    }

    window.proofOriginalNodes = nodes;
    window.proofOriginalTexts = textNodes;

    return {
      resolved: document.querySelector("#resolved").textContent,
      html: document.documentElement.outerHTML,
    };
  });

  await writeFile(join(evidence, "browser-before-hydration.html"), before.html);
  assert.equal(before.resolved, "team=7;item=7;score=42");
  allowScripts();
  await page.waitForFunction(() => document.documentElement.dataset.proofStable === "true");

  const hydrated = await page.evaluate(() => {
    const selectors = [
      "proof-item",
      "#item-article",
      "#parsed",
      "#resolved",
      "#parsed-team",
      "#parsed-id",
      "#parsed-score",
    ];
    const current = [document];

    for (const selector of selectors) {
      current.push(document.querySelector(selector));
    }

    for (let index = 0; index < current.length; index += 1) {
      if (current[index] !== window.proofOriginalNodes[index]) {
        throw new Error("Hydration replaced original node " + index);
      }
    }

    const texts = ["#parsed-team", "#parsed-id", "#parsed-score", "#resolved"];

    for (let index = 0; index < texts.length; index += 1) {
      if (document.querySelector(texts[index]).firstChild !== window.proofOriginalTexts[index]) {
        throw new Error("Hydration replaced original text Node " + index);
      }
    }

    window.proofOriginalInstance = window.proofItemInstance;

    if (!window.proofOriginalInstance) {
      throw new Error("No actual browser item instance");
    }

    return {
      retainedNodes: true,
      retainedTextNodes: true,
      stable: true,
      parsedTeam: document.querySelector("#parsed-team").textContent,
      parsedId: document.querySelector("#parsed-id").textContent,
      parsedScore: document.querySelector("#parsed-score").textContent,
      resolved: document.querySelector("#resolved").textContent,
    };
  });

  assert.equal(hydrated.parsedTeam, "7");
  assert.equal(hydrated.parsedId, "7");
  assert.equal(hydrated.parsedScore, "42");
  assert.equal(hydrated.resolved, "team=7;item=7;score=42");

  const directLink = page.locator("#direct");
  const aliasLink = page.locator("#alias");
  const queryLink = page.locator("#query");
  const directHref = await directLink.getAttribute("href");
  const aliasHref = await aliasLink.getAttribute("href");

  assert.equal(directHref, "/teams/7/items/8?score=43");
  assert.equal(aliasHref, "/teams/7/old-items/8?score=99#old");
  await aliasLink.click();
  await page.waitForURL(baseUrl + "/teams/7/items/8");
  await page.waitForFunction(
    () => document.querySelector("#resolved")?.textContent === "team=7;item=8;score=undefined",
  );

  const idView = page.locator("#parsed-id");
  const scoreView = page.locator("#parsed-score");
  const aliasId = await idView.textContent();
  const aliasScore = await scoreView.textContent();

  assert.equal(aliasId, "8");
  assert.equal(aliasScore, "");
  assert.equal(documents, 1);

  const aliasIdentity = await page.evaluate(() => {
    return (
      window.proofOriginalNodes[0] === document &&
      window.proofOriginalNodes[1] === document.querySelector("proof-item") &&
      window.proofOriginalNodes[2] === document.querySelector("#item-article") &&
      window.proofOriginalInstance === window.proofItemInstance
    );
  });

  assert.equal(aliasIdentity, true);
  await queryLink.click();
  await page.waitForURL(baseUrl + "/teams/7/items/8?score=44");
  await page.waitForFunction(
    () => document.querySelector("#resolved")?.textContent === "team=7;item=8;score=44",
  );

  const queryScore = await scoreView.textContent();
  const final = await page.evaluate(() => {
    const selectors = [
      "proof-item",
      "#item-article",
      "#parsed",
      "#resolved",
      "#parsed-team",
      "#parsed-id",
      "#parsed-score",
    ];
    let retained = window.proofOriginalNodes[0] === document;

    for (let index = 0; index < selectors.length; index += 1) {
      if (window.proofOriginalNodes[index + 1] !== document.querySelector(selectors[index])) {
        retained = false;
      }
    }

    return {
      url: location.href,
      retainedNodes: retained,
      retainedComponent: window.proofOriginalInstance === window.proofItemInstance,
      parsed: document.querySelector("#parsed").textContent,
      resolved: document.querySelector("#resolved").textContent,
      html: document.documentElement.outerHTML,
    };
  });

  assert.equal(queryScore, "44");
  assert.equal(final.retainedNodes, true);
  assert.equal(final.retainedComponent, true);
  assert.equal(documents, 1);
  assert.deepEqual(errors, []);
  await save("browser-observations.json", {
    hydrated,
    directHref,
    aliasHref,
    aliasIdentity,
    queryScore,
    final,
    documents,
    errors,
    consoleMessages,
    requests,
  });
  await writeFile(join(evidence, "browser-after-navigation.html"), final.html);
  await context.close();
} catch (error) {
  browserFailures.push(error);
} finally {
  try {
    allowScripts?.();
    await browser?.close();
  } catch (error) {
    browserFailures.push(error);
  } finally {
    try {
      subscription?.unsubscribe();
    } catch (error) {
      browserFailures.push(error);
    } finally {
      try {
        await serve.stop();
      } catch (error) {
        browserFailures.push(error);
      } finally {
        try {
          await save("serve-report.json", { outputs, logs });
        } catch (error) {
          browserFailures.push(error);
        }
      }
    }
  }
}

if (browserFailures.length > 0) {
  process.exitCode = 1;

  throw new AggregateError(
    browserFailures,
    "Native browser proof or cleanup failed; failures retained",
  );
}

console.log(
  "Native SSR HTTP302/delay/matrix/concurrency + exact-Node hydration/SPA/query/lazy browser closure proof passed",
);
