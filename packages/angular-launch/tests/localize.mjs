// Proves translated RPC redirects on generated output, in a real en + de `localize: true` build
// of examples/angular-launch/localize-proof with SSR: generation determinism, per-locale word
// tables and the host's source-text $localize, raw RPC frames and SSR redirects across locales
// in one process, every probe redirect caught by a real generated client next to that build's
// own createUrl, redirects into named outlets (canonical frame, caught RpcRedirect.to, SSR 302
// and the committed browser URL with what each outlet renders), Chromium RPC redirects, streams
// and channels, and ng serve with a catalog edit.
//
// Usage: node tests/localize.mjs /absolute/owned/absent-evidence-directory
// `pnpm run test:localize` runs it under the machine-wide gate lock, which every build and
// browser step here needs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rename, rmdir, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "@angular/compiler";
import { DefaultUrlSerializer } from "@angular/router";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");
const example = join(repository, "examples/angular-launch");

if (process.argv.length !== 3 || !isAbsolute(process.argv[2])) {
  throw new Error("Usage: node tests/localize.mjs /absolute/owned/absent-evidence-directory");
}

const evidence = resolve(process.argv[2]);

await mkdir(evidence);

const require = createRequire(join(packageDirectory, "package.json"));
const { chromium } = require("playwright");
const { Window } = require("happy-dom");
const exampleManifest = JSON.parse(await readFile(join(example, "package.json"), "utf8"));
const ng = join(example, "node_modules/@angular/cli/bin/ng.js");
const meaning = "URL path segment";

async function save(name, value) {
  await writeFile(join(evidence, name), JSON.stringify(value, null, 2) + "\n");
}

// A copy of the fixture at consumer/<name>, with the Launch example's installed dependencies
// linked in.
async function consumer(name) {
  const fixture = join(evidence, "consumer", name);

  await cp(join(example, "localize-proof"), fixture, {
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

function environment() {
  return { ...process.env, NG_CLI_ANALYTICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" };
}

async function cli(fixture, name, args) {
  const child = spawn(process.execPath, [ng, ...args], {
    cwd: fixture,
    env: environment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";

  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  const code = await new Promise((done, fail) => {
    child.on("error", fail);
    child.on("close", done);
  });

  await writeFile(join(evidence, `${name}.log`), output);
  assert.equal(code, 0, `ng ${args.join(" ")} exited with ${code}:\n${output}`);

  return output;
}

// A long-running child in its own process group, so stopping it also stops what it started.
function background(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { child, output: "", closed: undefined };

  state.closed = new Promise((done) => child.once("close", done));
  child.stdout.on("data", (chunk) => (state.output += chunk));
  child.stderr.on("data", (chunk) => (state.output += chunk));

  return state;
}

async function stop(state, log) {
  const { child } = state;

  if (child.exitCode === null && child.signalCode === null) {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }, 5000);

    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }

    await state.closed;
    clearTimeout(timer);
  }

  await writeFile(join(evidence, log), state.output);
}

async function waitFor(predicate, message, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await predicate();

    if (value) {
      return value;
    }

    await new Promise((done) => setTimeout(done, 100));
  }

  throw new Error(message);
}

async function files(directory) {
  const result = [];

  for (const entry of await readdir(directory, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      result.push(join(entry.parentPath, entry.name));
    }
  }

  return result;
}

// What a document shows: the primary page with its values, and each named outlet's page with
// its values. Runs in Node on the raw HTML and in Chromium on the live page.
function shown(document) {
  const result = { page: document.querySelector("#page")?.getAttribute("data-id") ?? null };
  const values = document.querySelector("#values");

  if (values) {
    result.values = JSON.parse(values.textContent);
  }

  for (const outlet of ["detail", "chat", "aside"]) {
    const section = document.querySelector(`#${outlet}`);

    if (section) {
      result[outlet] = [
        section.getAttribute("data-id"),
        JSON.parse(section.querySelector(".values").textContent),
      ];
    }
  }

  return result;
}

// Angular's own form of a URL, which it commits and writes into a Location: it unescapes some
// encoded characters a createUrl string keeps.
const serializer = new DefaultUrlSerializer();

function committed(url) {
  return serializer.serialize(serializer.parse(url));
}

// Every redirect into a named outlet the probe makes, plus two primary ones that test the
// same byte-for-byte rules: the canonical frame, each build's createUrl, and what renders there.
const outletCases = {
  nested: {
    frame: { to: "/products/(detail:item/3)", words: [0, 1] },
    de: "/produkte/(detail:artikel/3)",
    en: "/products/(detail:item/3)",
    shown: { page: "products", values: { tag: [] }, detail: ["products/item/$id", { id: "3" }] },
  },
  "root-branch": {
    frame: { to: "/(chat:chat/7)", words: [0] },
    de: "/(chat:plaudern/7)",
    en: "/(chat:chat/7)",
    shown: { page: null, chat: ["chat/$id", { id: "7" }] },
  },
  "root-branch-word": {
    frame: { to: "/(chat:chat/chat)", words: [0] },
    de: "/(chat:plaudern/chat)",
    en: "/(chat:chat/chat)",
    shown: { page: null, chat: ["chat/$id", { id: "chat" }] },
  },
  "dynamic-anchor": {
    frame: { to: "/teams/products/(detail:item/item)", words: [0, 2] },
    de: "/mannschaften/products/(detail:artikel/item)",
    en: "/teams/products/(detail:item/item)",
    shown: {
      page: "teams/$team",
      values: { team: "products" },
      detail: ["teams/$team/item/$id", { team: "products", id: "item" }],
    },
  },
  shelf: {
    frame: { to: "/products/(detail:shelf/shelf/item/products)", words: [0, 1] },
    de: "/produkte/(detail:regal/shelf/item/products)",
    en: "/products/(detail:shelf/shelf/item/products)",
    shown: {
      page: "products",
      values: { tag: [] },
      detail: ["products/shelf/$rest[]", { rest: ["shelf", "item", "products"] }],
    },
  },
  "shelf-empty": {
    frame: { to: "/products/(detail:shelf)", words: [0, 1] },
    de: "/produkte/(detail:regal)",
    en: "/products/(detail:shelf)",
    shown: {
      page: "products",
      values: { tag: [] },
      detail: ["products/shelf/$rest[]", { rest: [] }],
    },
  },
  encoded: {
    frame: {
      to: "/products/(detail:item/a%2Fb%3Ac%28d%29e%25f%26g%40h%24i%2Cj%20%C3%A4)",
      words: [0, 1],
    },
    de: "/produkte/(detail:artikel/a%2Fb%3Ac%28d%29e%25f%26g%40h%24i%2Cj%20%C3%A4)",
    en: "/products/(detail:item/a%2Fb%3Ac%28d%29e%25f%26g%40h%24i%2Cj%20%C3%A4)",
    shown: {
      page: "products",
      values: { tag: [] },
      detail: ["products/item/$id", { id: "a/b:c(d)e%f&g@h$i,j ä" }],
    },
  },
  "no-static": {
    frame: { to: "/(aside:chat)" },
    de: "/(aside:chat)",
    en: "/(aside:chat)",
    shown: { page: null, aside: ["$note", { note: "chat" }] },
  },
  lookalike: {
    frame: { to: "/account/%28detail%3Aitem%29/sign-in", words: [0, 2] },
    de: "/konto/%28detail%3Aitem%29/anmelden",
    en: "/account/%28detail%3Aitem%29/sign-in",
    shown: { page: "account/$id/sign-in", values: { id: "(detail:item)" } },
  },
  query: {
    frame: {
      to: "/products?tag=a&tag=b%26c&tag=a&tag=%C3%A4#%C3%BCber%20%26%20%28uns%29",
      words: [0],
    },
    de: "/produkte?tag=a&tag=b%26c&tag=a&tag=%C3%A4#%C3%BCber%20%26%20%28uns%29",
    en: "/products?tag=a&tag=b%26c&tag=a&tag=%C3%A4#%C3%BCber%20%26%20%28uns%29",
    shown: { page: "products", values: { tag: ["a", "b&c", "a", "ä"] } },
  },
};
const jumpWord = { de: "springen", en: "jump" };

// What the raw HTML says before any client code runs.
function inspect(body) {
  const window = new Window();
  const template = window.document.createElement("template");

  template.innerHTML = body;

  const document = template.content;
  const text = (selector) => document.querySelector(selector)?.textContent ?? null;
  const result = {
    page: document.querySelector("#page")?.getAttribute("data-id") ?? null,
    values: text("#values"),
    caught: text("#caught"),
    own: text("#own"),
    ownLink: document.querySelector("#own-link")?.getAttribute("href") ?? null,
    guardedLink: document.querySelector("#guarded")?.getAttribute("href") ?? null,
    shown: shown(document),
  };

  window.close();

  return result;
}

// 1. Generation is deterministic: a build writes the generated files, and the ci configuration
// then checks them without writing.
const app = await consumer("app");
const buildLog = await cli(app, "build", ["build"]);

await cli(app, "build-ci", ["build", "--configuration", "ci"]);

for (const file of ["redirects.generated.ts", "server.generated.ts"]) {
  await cp(join(app, "generated", file), join(evidence, file));
}

const table = await readFile(join(app, "generated/redirects.generated.ts"), "utf8");
const serverGenerated = await readFile(join(app, "generated/server.generated.ts"), "utf8");

assert.equal(serverGenerated.split("\n")[1], "import '@loozo/angular-launch/_source-text';");
assert.match(serverGenerated, /\{ translateSegments: true \}\);/);
assert.match(
  table,
  /words: \["account", "anmelden", "chat", "docs", "guarded", "help", "item", "jump", "lazy", "live", "manuals", "missing", "not-found", "old", "probe", "products", "shelf", "sign-in", "start", "teams"\],/,
);

// 2. Build output: no init warning; each locale's table holds its words, inlined; the host has
// the source-text installer and no table.
assert.doesNotMatch(buildLog, /Direct import of '@angular\/localize\/init'/);

const dist = join(app, "dist/proof");
const bundles = {};

for (const [target, extension] of [
  ["browser", ".js"],
  ["server", ".mjs"],
]) {
  for (const [locale, words] of [
    ["en", ["sign-in", "guarded", "lazy", "help", "docs", "old", "products", "teams"]],
    [
      "de",
      [
        "anmelden",
        "geschuetzt",
        "spaet",
        "hilfe",
        "dokumente",
        "empfangen",
        "produkte",
        "plaudern",
      ],
    ],
  ]) {
    let code = "";

    for (const file of await files(join(dist, target, locale))) {
      if (file.endsWith(extension)) {
        code += await readFile(file, "utf8");
      }
    }

    // Every $localize message was inlined: none keeps its metadata block.
    assert.equal(code.includes(meaning), false, `${target}/${locale} keeps a $localize message`);

    for (const word of words) {
      assert.ok(code.includes(`"${word}"`), `${target}/${locale} lacks ${word}`);
    }

    bundles[`${target}/${locale}`] = words;
  }
}

const host = await readFile(join(dist, "server/server.mjs"), "utf8");

assert.ok(host.includes("Unterminated $localize metadata block"), "the host has the installer");
assert.equal(host.includes("geschuetzt"), false, "the host has no German table");
await save("bundles.json", bundles);

// 3–5. Raw HTTP in one fresh process, locales interleaved, then Chromium.
const server = background(process.execPath, [join(dist, "server/server.mjs")], {
  cwd: app,
  env: { ...process.env, PORT: "0" },
});
let browser;

try {
  const origin = await waitFor(
    () => /LAUNCH_READY (http:\/\/127\.0\.0\.1:\d+)/.exec(server.output)?.[1],
    `server never started:\n${server.output}`,
    60000,
  );
  const http = [];

  async function fetchRaw(path, init = {}) {
    const response = await fetch(origin + path, { redirect: "manual", ...init });
    const body = await response.text();
    const record = {
      method: init.method ?? "GET",
      path,
      status: response.status,
      location: response.headers.get("location"),
    };

    if (response.headers.get("content-type")?.includes("json")) {
      record.body = body;
    } else {
      record.html = inspect(body);
    }

    http.push(record);

    return record;
  }

  // 3. The wire frame is canonical, with its words, whichever locale's page calls.
  for (const page of ["/de/", "/en/", "/de/geschuetzt"]) {
    const frame = await fetchRaw("/_rpc/session/current", {
      method: "POST",
      headers: { "content-type": "application/json", origin, referer: origin + page },
      body: '{"input":null}',
    });

    assert.equal(frame.status, 303, page);
    assert.equal(frame.location, null);
    assert.equal(frame.body, '{"redirect":{"to":"/sign-in","words":[0]}}', page);
  }

  // 3b. Redirects into named outlets: the frame counts the anchor's segments, then the group's,
  // never the outlet label; a branch without a static segment has no words.
  const outlets = { frames: {}, ssr: {}, browser: {} };

  for (const [target, { frame: expected }] of Object.entries(outletCases)) {
    const frame = await fetchRaw("/_rpc/probe/go", {
      method: "POST",
      headers: { "content-type": "application/json", origin, referer: origin + "/de/" },
      body: JSON.stringify({ input: target }),
    });

    assert.equal(frame.status, 303, target);
    assert.equal(frame.body, JSON.stringify({ redirect: expected }), target);
    outlets.frames[target] = JSON.parse(frame.body);
  }

  // 4. Final SSR Locations: Angular's final URL after every route redirect.
  const wireBefore = server.output.split("PROOF_WIRE").length;

  for (const [path, location] of [
    ["/de/geschuetzt", "/de/anmelden"],
    ["/en/guarded", "/en/sign-in"],
    ["/de/spaet/geschuetzt", "/de/anmelden"],
    ["/en/lazy/guarded", "/en/sign-in"],
    ["/de/springen?target=docs-old", "/de/dokumente"],
    ["/en/jump?target=docs-old", "/en/docs"],
    ["/de/springen?target=account", "/de/konto/sign-in/anmelden"],
    ["/de/springen?target=anmelden", "/de/empfangen"],
  ]) {
    const page = await fetchRaw(path);

    assert.equal(page.status, 302, path);
    assert.equal(page.location, location, path);
  }

  // Interceptors in the rendering server app saw the wire body, words included.
  assert.ok(server.output.split("PROOF_WIRE").length > wireBefore);
  assert.match(server.output, /PROOF_WIRE \{"redirect":\{"to":"\/sign-in","words":\[0\]\}\}/);

  // 4b. A resolver's redirect into a named outlet, rendered on the server: the 302 goes to
  // Angular's form of the build's createUrl, and that URL renders the branch beside its anchor.
  for (const [target, cases] of Object.entries(outletCases)) {
    for (const locale of ["de", "en"]) {
      const path = `/${locale}/${jumpWord[locale]}?target=${target}`;
      const redirected = await fetchRaw(path);
      const location = `/${locale}${committed(cases[locale])}`;

      assert.equal(redirected.status, 302, path);
      assert.equal(redirected.location, location, path);

      const landed = await fetchRaw(location);

      assert.equal(landed.status, 200, location);
      assert.deepEqual(landed.html.shown, cases.shown, location);
      outlets.ssr[`${locale} ${target}`] = {
        location,
        status: landed.status,
        shown: landed.html.shown,
      };
    }
  }

  const missing = await fetchRaw("/de/vermisst");

  assert.equal(missing.status, 404);
  assert.equal(missing.html.page, "not-found");

  for (const [path, page] of [
    ["/de/anmelden", "sign-in"],
    ["/de/konto/sign-in/anmelden", "account/$id/sign-in"],
    ["/de/empfangen", "anmelden"],
    ["/de/handbuecher/anfang", "manuals/start"],
    ["/en/manuals/start", "manuals/start"],
  ]) {
    const found = await fetchRaw(path);

    assert.equal(found.status, 200, path);
    assert.equal(found.html.page, page, path);
  }

  // 5. The redirect a real generated client caught equals the page's own createUrl, in both
  // locales, rendered on the server.
  const probes = {
    "sign-in": ["/anmelden", "/sign-in"],
    help: ["/hilfe/sign-in", "/help/sign-in"],
    account: ["/konto/sign-in/anmelden", "/account/sign-in/sign-in"],
    "docs-old": ["/dokumente/alt", "/docs/old"],
    "manuals-start": ["/handbuecher/anfang", "/manuals/start"],
    anmelden: ["/empfangen", "/anmelden"],
  };

  for (const [target, { de, en }] of Object.entries(outletCases)) {
    probes[target] = [de, en];
  }

  for (const [target, [german, english]] of Object.entries(probes)) {
    for (const [path, expected] of [
      [`/de/sonde?target=${target}`, german],
      [`/en/probe?target=${target}`, english],
    ]) {
      const probe = await fetchRaw(path);

      assert.equal(probe.status, 200, path);
      assert.equal(probe.html.caught, expected, path);
      assert.equal(probe.html.own, expected, path);
    }
  }

  await save("http.json", http);

  // 6. Chromium: RPC redirects in the browser, after hydration.
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  const flows = {};

  async function flow(name, run) {
    const video = join(evidence, `video-${name}`);
    const context = await browser.newContext({
      colorScheme: "dark",
      viewport: { width: 960, height: 540 },
      recordVideo: { dir: video, size: { width: 960, height: 540 } },
    });
    const page = await context.newPage();
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });

    try {
      flows[name] = { ...(await run(page)), errors };
      await page.screenshot({ path: join(evidence, `${name}.png`) });
    } finally {
      await context.close();
    }

    const [recording] = await readdir(video);

    await rename(join(video, recording), join(evidence, `${name}.webm`));
    await rmdir(video);
    assert.deepEqual(errors, [], name);
  }

  async function settled(page) {
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      globalThis.proofDocument = "same";
    });
  }

  async function marker(page) {
    await page.waitForSelector("#page");

    return {
      url: new URL(page.url()).pathname,
      page: await page.getAttribute("#page", "data-id"),
      values: await page.evaluate(() => document.querySelector("#values")?.textContent ?? null),
      document: await page.evaluate(() => globalThis.proofDocument),
      wire: await page.evaluate(() => globalThis.proofWire ?? []),
    };
  }

  for (const [name, start, link, url] of [
    ["de-guarded", "/de/", "#guarded", "/de/anmelden"],
    ["de-lazy-guarded", "/de/", "#lazy-guarded", "/de/anmelden"],
    ["en-guarded", "/en/", "#guarded", "/en/sign-in"],
  ]) {
    await flow(name, async (page) => {
      await page.goto(origin + start);
      await settled(page);
      await page.waitForTimeout(400);
      await page.click(link);
      await page.waitForURL(`**${url}`);

      const result = await marker(page);

      await page.waitForTimeout(400);
      assert.equal(result.url, url, name);
      assert.equal(result.page, "sign-in", name);
      // The same document: the client navigated, nothing reloaded.
      assert.equal(result.document, "same", name);
      assert.deepEqual(result.wire, [{ redirect: { to: "/sign-in", words: [0] } }], name);

      return result;
    });
  }

  for (const [name, path, expected] of [
    ["de-live", "/de/direkt", "/anmelden"],
    ["en-live", "/en/live", "/sign-in"],
  ]) {
    await flow(name, async (page) => {
      await page.goto(origin + path);

      const stream = await waitFor(
        async () => (await page.textContent("#stream")) || undefined,
        `${name}: no stream result`,
      );
      const channel = await waitFor(
        async () => (await page.textContent("#channel")) || undefined,
        `${name}: no channel result`,
      );

      assert.equal(stream, expected, name);
      assert.equal(channel, expected, name);

      return { stream, channel };
    });
  }

  // A resolver's RPC redirect into a named outlet, in the browser: the client navigation
  // commits Angular's form of the build's createUrl and renders the branch beside its anchor,
  // in one document; the interceptor saw each canonical frame.
  for (const locale of ["de", "en"]) {
    await flow(`${locale}-outlets`, async (page) => {
      const result = {};

      await page.goto(`${origin}/${locale}/`);
      await settled(page);
      await page.waitForTimeout(400);

      for (const [target, cases] of Object.entries(outletCases)) {
        const at = committed(cases[locale]);

        await page.evaluate(
          (url) => void globalThis.proofNavigate(url),
          `/${jumpWord[locale]}?target=${target}`,
        );
        await page.waitForFunction(
          (expected) => document.querySelector("#at")?.textContent === expected,
          at,
        );

        const observed = await page.evaluate(
          `({ shown: (${shown.toString()})(document), url: location.pathname + location.search + location.hash, document: globalThis.proofDocument })`,
        );

        assert.equal(observed.url, `/${locale}${at}`, `${locale} ${target}`);
        assert.deepEqual(observed.shown, cases.shown, `${locale} ${target}`);
        assert.equal(observed.document, "same", `${locale} ${target}`);
        result[target] = { at, ...observed };
      }

      const wire = await page.evaluate(() => globalThis.proofWire ?? []);
      const frames = [];

      for (const { frame } of Object.values(outletCases)) {
        frames.push({ redirect: frame });
      }

      assert.deepEqual(wire, frames, locale);
      outlets.browser[locale] = result;

      return result;
    });
  }

  await save("outlets.json", outlets);

  for (const [target, [german]] of Object.entries(probes)) {
    await flow(`de-probe-${target}`, async (page) => {
      await page.goto(`${origin}/de/sonde?target=${target}`);
      // After hydration the browser calls again; its own interceptor records the frame.
      await waitFor(
        () => page.evaluate(() => (globalThis.proofWire ?? []).length > 0),
        `${target}: the browser never called`,
      );
      await page.waitForTimeout(200);

      const caught = await page.textContent("#caught");
      const own = await page.textContent("#own");

      assert.equal(caught, german, target);
      assert.equal(own, german, target);

      if (target !== "manuals-start") {
        return { caught, own };
      }

      // The German link to manuals/start reaches its page after hydration.
      await page.click("#own-link");
      await page.waitForURL("**/de/handbuecher/anfang");

      const followed = await marker(page);

      assert.equal(followed.page, "manuals/start");
      assert.deepEqual(JSON.parse(followed.values), {});

      return { caught, own, followed };
    });
  }

  await save("browser.json", { flows });
} finally {
  await browser?.close();
  await stop(server, "server.log");
}

// 7. ng serve: the host evaluates destinations under Vite's SSR loader; a bad catalog edit is
// logged and the server keeps serving.
const served = await consumer("serve");
const catalog = join(served, "src/locale/messages.de.xlf");
const original = await readFile(catalog, "utf8");
const serve = background(process.execPath, [ng, "serve"], { cwd: served, env: environment() });

try {
  const base = await waitFor(
    () => /Local:\s+(http:\/\/127\.0\.0\.1:\d+\/\S*)/.exec(serve.output)?.[1],
    `ng serve never started:\n${serve.output}`,
    240000,
  );
  const guarded = await fetch(new URL("geschuetzt", base.endsWith("/") ? base : `${base}/`), {
    redirect: "manual",
  });
  const location = guarded.headers.get("location");

  await save("serve.json", { base, status: guarded.status, location });
  assert.equal(guarded.status, 302);
  assert.match(location, /\/anmelden$/);

  const before = serve.output.length;

  await writeFile(catalog, original.replace("<target>geschuetzt</target>", "<target>a/b</target>"));
  await waitFor(
    () =>
      /Locale de: route\.segment\.guarded translates to "a\/b"/.test(serve.output.slice(before)),
    `the bad catalog edit wasn't reported:\n${serve.output.slice(before)}`,
  );

  const still = await fetch(new URL("anmelden", base.endsWith("/") ? base : `${base}/`));

  assert.equal(still.status, 200);
  await writeFile(catalog, original);
} finally {
  await stop(serve, "serve.log");
}

console.log(`Translated Launch redirects: PASS (${evidence})`);
