// Proves translated static segments on the generator's real output, in a real en + de
// `localize: true` build of examples/angular-router/localize-proof: committed outputs, per-locale
// bundles and prerender paths, raw server rendering across locales in one process, Chromium
// hydration and a lazy children table, extraction, the strict build → extract → translate flow,
// and ng serve after bad catalog edits and their repair. Each step also proves the language
// switcher and hreflang alternates from localeUrls and the builders' locale table.
//
// Usage: node tests/localize.mjs /absolute/owned/absent-evidence-directory
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { get } from "node:http";
import { connect, createServer } from "node:net";
import { cp, mkdir, readdir, readFile, rename, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");

if (process.argv.length !== 3 || !isAbsolute(process.argv[2])) {
  throw new Error("Usage: node tests/localize.mjs /absolute/owned/absent-evidence-directory");
}

const evidence = resolve(process.argv[2]);

await mkdir(evidence);

const require = createRequire(join(packageDirectory, "package.json"));
const { chromium } = require("playwright");
const { Window } = require("happy-dom");
const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
const ng = join(packageDirectory, "node_modules/@angular/cli/bin/ng.js");
const productId = "src/routes/products/$productId/route.ts";
const membersId = "src/routes/teams/$teamId/members/route.ts";
const meaning = "URL path segment";
const site = "https://example.test";

async function save(name, value) {
  await writeFile(join(evidence, name), JSON.stringify(value, null, 2) + "\n");
}

// A copy of the example at consumer/<name>, committed generated files included, with the
// workspace's installed dependencies linked in.
async function consumer(name) {
  const fixture = join(evidence, "consumer", name);

  await cp(join(repository, "examples/angular-router/localize-proof"), fixture, {
    recursive: true,
    filter: (path) => !/(?:^|\/)(?:node_modules|dist|\.angular|out-tsc)(?:\/|$)/.test(path),
  });

  for (const dependency of new Set([
    ...Object.keys(metadata.dependencies),
    ...Object.keys(metadata.devDependencies),
    "@loozo/angular-router",
  ])) {
    const link = join(fixture, "node_modules", dependency);

    await mkdir(dirname(link), { recursive: true });

    let target = join(packageDirectory, "node_modules", dependency);

    if (dependency === "@loozo/angular-router") {
      target = packageDirectory;
    }

    await symlink(target, link, "dir");
  }

  return fixture;
}

function environment() {
  return { ...process.env, NG_CLI_ANALYTICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" };
}

// Runs the Angular CLI to completion and keeps its log.
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

  return { code, output };
}

async function succeeds(fixture, name, args) {
  const result = await cli(fixture, name, args);

  assert.equal(
    result.code,
    0,
    `ng ${args.join(" ")} exited with ${result.code}:\n${result.output}`,
  );

  return result.output;
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

async function freePort() {
  const reservation = createServer();

  await new Promise((done) => reservation.listen(0, "127.0.0.1", done));

  const { port } = reservation.address();

  await new Promise((done) => reservation.close(done));

  return port;
}

// TCP readiness only: an HTTP probe would render a page before the ordered requests.
async function listening(port, state) {
  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    assert.equal(state.child.exitCode, null, `server exited:\n${state.output}`);

    const open = await new Promise((done) => {
      const socket = connect(port, "127.0.0.1");

      socket.once("connect", () => {
        socket.destroy();
        done(true);
      });
      socket.once("error", () => done(false));
    });

    if (open) {
      return;
    }

    await new Promise((done) => setTimeout(done, 100));
  }

  throw new Error(`Nothing listened on ${port}:\n${state.output}`);
}

function request(url, timeoutMs = 30000) {
  return new Promise((done, fail) => {
    const pending = get(url, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.once("error", fail);
      response.once("end", () =>
        done({ url, status: response.statusCode, headers: response.headers, body }),
      );
    });
    const timer = setTimeout(() => pending.destroy(new Error(`Timed out: ${url}`)), timeoutMs);

    pending.once("close", () => clearTimeout(timer));
    pending.once("error", fail);
  });
}

// What the raw HTML says before any client code runs.
function inspect(body) {
  const window = new Window();
  const template = window.document.createElement("template");

  template.innerHTML = body;

  const document = template.content;
  const text = (id) => document.querySelector(`#${id}`)?.textContent ?? null;
  const href = (id) => document.querySelector(`#${id}`)?.getAttribute("href") ?? null;
  const result = {
    product: document.querySelector("#product") !== null,
    productId: text("product-id"),
    createUrl: text("create-url"),
    nextProduct: href("next-product"),
    productsLink: href("products-link"),
    teamsLink: href("teams-link"),
    team: document.querySelector("#team") !== null,
    membersLink: href("members-link"),
    members: document.querySelector("#members") !== null,
    membersSelf: href("members-self"),
    offers: document.querySelector("#offers") !== null,
    missing: document.querySelector("#missing") !== null,
    productsPage: text("products-page"),
    // The language switcher: [locale, href, aria-current] per link.
    switcher: [...document.querySelectorAll("nav[aria-label='Language'] a")].map((link) => [
      link.getAttribute("hreflang"),
      link.getAttribute("href"),
      link.getAttribute("aria-current"),
    ]),
    // The snippet's alternates, and how many alternate links the document has in all.
    alternates: [...document.querySelectorAll("link[data-hreflang]")].map((link) => [
      link.getAttribute("hreflang"),
      link.getAttribute("href"),
    ]),
    alternateLinks: document.querySelectorAll("link[rel='alternate']").length,
    lazyLocaleUrls: document.querySelector("#members")?.getAttribute("data-locale-urls") ?? null,
  };

  window.close();

  return result;
}

async function files(directory) {
  const result = [];

  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else {
        result.push(path);
      }
    }
  }

  await visit(directory);

  return result;
}

async function exists(path) {
  try {
    await stat(path);

    return true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    return false;
  }
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Every translated text a bundle passes for a destination: the array after its canonical id.
function translatedArguments(code, id) {
  // Minifiers quote with ", ' or a backtick.
  const pattern = new RegExp(`["'\`]${escape(id)}["'\`],\\[["'\`]([^"'\`]*)["'\`]\\]`, "g");
  const result = [];

  for (const match of code.matchAll(pattern)) {
    result.push(match[1]);
  }

  return result;
}

// The locale table objects a bundle holds: the builders' define, inlined by esbuild as an object
// literal. Minifiers may quote keys and strings with ", ' or a backtick.
function localeTables(code) {
  const tables = [];
  const start = /locales:\[\{code:/g;

  for (const match of code.matchAll(start)) {
    const open = code.lastIndexOf("{", match.index);
    let depth = 0;
    let quote;
    let end = open;

    for (; end < code.length; end += 1) {
      const character = code[end];

      if (quote) {
        if (character === "\\") {
          end += 1;
        } else if (character === quote) {
          quote = undefined;
        }

        continue;
      }

      if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{" || character === "[") {
        depth += 1;
      } else if (character === "}" || character === "]") {
        depth -= 1;

        if (depth === 0) {
          break;
        }
      }
    }

    tables.push(new Function(`return (${code.slice(open, end + 1)});`)());
  }

  return tables;
}

// What a page in both locales links to: [en, de] document URLs, the current one marked.
function expectSwitcher(html, en, de, current, label) {
  const marks = { en: null, de: null };

  marks[current] = "page";
  assert.deepEqual(
    html.switcher,
    [
      ["en", en, marks.en],
      ["de", de, marks.de],
    ],
    label,
  );
}

// The snippet's three alternates, absolute on the public origin, and no other alternate link.
function expectAlternates(html, en, de, label) {
  assert.deepEqual(
    html.alternates,
    [
      ["en", site + en],
      ["de", site + de],
      ["x-default", site + en],
    ],
    label,
  );
  assert.equal(html.alternateLinks, 3, label);
}

const germanWords = [
  ["members", "mitglieder"],
  ["old-products", "alte-produkte"],
  ["products", "produkte"],
];

// 1. Committed outputs are current, and the ci configuration builds them.
const app = await consumer("app");
const buildLog = await succeeds(app, "build-ci", ["build", "--configuration", "ci"]);
const dist = join(app, "dist/proof");

// Angular logs a page's render error during prerendering and still passes the build.
assert.doesNotMatch(buildLog, /^ERROR/m);

// 2. Build output: prerender paths, server route patterns and each locale's segment text.
const prerendered = JSON.parse(await readFile(join(dist, "prerendered-routes.json"), "utf8"));

assert.deepEqual(Object.keys(prerendered.routes).sort(), ["/de/produkte/1", "/en/products/1"]);
assert.equal(await exists(join(dist, "browser/en/products/1/index.html")), true);
assert.equal(await exists(join(dist, "browser/de/produkte/1/index.html")), true);
assert.equal(await exists(join(dist, "browser/de/products")), false);
assert.equal(await exists(join(dist, "browser/en/produkte")), false);
assert.equal(await exists(join(dist, "browser/en/products/2")), false);
assert.equal(await exists(join(dist, "browser/de/produkte/2")), false);
assert.match(buildLog, /^prerender en products\/:productId$/m);
assert.match(buildLog, /^prerender de produkte\/:productId$/m);

const stats = JSON.parse(await readFile(join(dist, "browser-stats.json"), "utf8"));
const outputs = Object.entries(stats.outputs);
let browserMain;
let childrenChunk;

for (const [file, output] of outputs) {
  if (file.endsWith(".js") && output.entryPoint?.endsWith("src/main.ts")) {
    browserMain = file;
  }

  const inputs = Object.keys(output.inputs);

  if (
    file.endsWith(".js") &&
    inputs.some((input) =>
      input.endsWith("src/routes/teams/$teamId/members/destination.generated.ts"),
    )
  ) {
    childrenChunk = file;
  }
}

assert.ok(browserMain);
assert.ok(childrenChunk);

// The members destination is outside the browser's eager closure: only its lazy table reads it.
const eager = new Set();
const queue = [browserMain];

while (queue.length > 0) {
  const file = queue.shift();

  if (eager.has(file)) {
    continue;
  }

  eager.add(file);

  for (const imported of stats.outputs[file].imports) {
    if (imported.kind === "dynamic-import" || imported.external) {
      continue;
    }

    let next = imported.path;

    if (!stats.outputs[next]) {
      next = posix.normalize(posix.join(posix.dirname(file), next));
    }

    queue.push(next);
  }
}

assert.equal(eager.has(childrenChunk), false);

const bundleEvidence = {};

for (const [target, extension] of [
  ["browser", ".js"],
  ["server", ".mjs"],
]) {
  for (const [locale, products, members] of [
    ["en", "products", "members"],
    ["de", "produkte", "mitglieder"],
  ]) {
    const productTexts = [];
    const memberFiles = [];
    const tables = [];

    for (const file of await files(join(dist, target, locale))) {
      if (!file.endsWith(extension)) {
        continue;
      }

      const code = await readFile(file, "utf8");

      // Every $localize message was inlined: none keeps its metadata block.
      assert.equal(code.includes(meaning), false, `${file} keeps a $localize message`);
      productTexts.push(...translatedArguments(code, productId));

      for (const table of localeTables(code)) {
        tables.push({ file: basename(file), table });
      }

      const memberTexts = translatedArguments(code, membersId);

      if (memberTexts.length > 0) {
        assert.deepEqual(memberTexts, [members], file);
        memberFiles.push(basename(file));
      }
    }

    assert.ok(productTexts.length > 0, `${target}/${locale} has the product destination`);
    assert.deepEqual(new Set(productTexts), new Set([products]), `${target}/${locale}`);
    assert.equal(memberFiles.length, 1, `${target}/${locale} members destination files`);
    assert.match(memberFiles[0], /^chunk-/);

    if (target === "browser") {
      assert.equal(memberFiles[0], basename(childrenChunk));
    }

    // One shared table per locale bundle set: every configured locale, whatever this build is.
    assert.equal(tables.length, 1, `${target}/${locale} locale tables`);
    assert.deepEqual(
      tables[0].table,
      {
        locales: [
          { code: "en", baseHref: "/en/", words: [] },
          { code: "de", baseHref: "/de/", words: germanWords },
        ],
      },
      `${target}/${locale}`,
    );

    bundleEvidence[`${target}/${locale}`] = {
      products: productTexts,
      members: memberFiles,
      tables,
    };
  }
}

await save("bundles.json", { browserMain, childrenChunk, ...bundleEvidence });

// Prerendered pages hold the switcher and the alternates before any script runs.
const prerenderEvidence = {};

for (const [locale, path] of [
  ["en", "en/products/1"],
  ["de", "de/produkte/1"],
]) {
  const html = inspect(await readFile(join(dist, "browser", path, "index.html"), "utf8"));

  expectSwitcher(html, "/en/products/1", "/de/produkte/1", locale, path);
  expectAlternates(html, "/en/products/1", "/de/produkte/1", path);
  prerenderEvidence[path] = html;
}

await save("prerender.json", prerenderEvidence);

// 3. Raw server rendering: one fresh process, requests across locales in order.
const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = background(process.execPath, [join(dist, "server/server.mjs")], {
  cwd: app,
  env: { ...process.env, PORT: String(port) },
});
let browser;

try {
  await listening(port, server);

  const responses = [];

  async function render(path) {
    const response = await request(origin + path);

    responses.push({
      path,
      status: response.status,
      location: response.headers.location,
      html: inspect(response.body),
    });
    await writeFile(join(evidence, `http${path.replaceAll("/", "_")}.html`), response.body);

    return { ...response, html: inspect(response.body) };
  }

  const enPrerendered = await render("/en/products/1");

  assert.equal(enPrerendered.status, 200);
  assert.equal(enPrerendered.html.productId, "1");
  assert.equal(enPrerendered.html.nextProduct, "/en/products/2");
  expectSwitcher(enPrerendered.html, "/en/products/1", "/de/produkte/1", "en");

  const dePrerendered = await render("/de/produkte/1");

  assert.equal(dePrerendered.status, 200);
  assert.equal(dePrerendered.html.productId, "1");
  assert.equal(dePrerendered.html.nextProduct, "/de/produkte/2");

  // A lazy English page after German initialized in this process.
  const enMembers = await render("/en/teams/7/members");

  assert.equal(enMembers.status, 200);
  assert.equal(enMembers.html.members, true);
  assert.equal(enMembers.html.membersSelf, "/en/teams/7/members");
  assert.equal(enMembers.html.teamsLink, "/en/teams/7");
  assert.equal(enMembers.html.productsLink, "/en/products");
  // The lazy entry's switcher and alternates, and the lazy page's own localeUrls call.
  expectSwitcher(enMembers.html, "/en/teams/7/members", "/de/teams/7/mitglieder", "en");
  expectAlternates(enMembers.html, "/en/teams/7/members", "/de/teams/7/mitglieder");
  assert.deepEqual(JSON.parse(enMembers.html.lazyLocaleUrls), [
    { locale: "en", url: "/en/teams/7/members" },
    { locale: "de", url: "/de/teams/7/mitglieder" },
  ]);

  // Product 2 isn't prerendered, so these are live server renders.
  const enLive = await render("/en/products/2");

  assert.equal(enLive.status, 200);
  assert.equal(enLive.html.productId, "2");
  assert.equal(enLive.html.nextProduct, "/en/products/3");
  assert.equal(enLive.html.createUrl, "/products/2");
  assert.equal(enLive.html.productsLink, "/en/products");

  const deLive = await render("/de/produkte/2");

  assert.equal(deLive.status, 200);
  assert.equal(deLive.html.productId, "2");
  assert.equal(deLive.html.nextProduct, "/de/produkte/3");
  assert.equal(deLive.html.createUrl, "/produkte/2");
  assert.equal(deLive.html.productsLink, "/de/produkte");
  expectSwitcher(deLive.html, "/en/products/2", "/de/produkte/2", "de");
  expectAlternates(deLive.html, "/en/products/2", "/de/produkte/2");

  const deMembers = await render("/de/teams/7/mitglieder");

  assert.equal(deMembers.status, 200);
  assert.equal(deMembers.html.members, true);
  assert.equal(deMembers.html.membersSelf, "/de/teams/7/mitglieder");
  expectSwitcher(deMembers.html, "/en/teams/7/members", "/de/teams/7/mitglieder", "de");
  expectAlternates(deMembers.html, "/en/teams/7/members", "/de/teams/7/mitglieder");
  assert.equal(deMembers.html.lazyLocaleUrls, enMembers.html.lazyLocaleUrls);

  // Declared search keys carry over; a value equal to its fallback is the same page without it.
  const secondPage = await render("/de/produkte?page=2");

  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.html.productsPage, "2");
  expectSwitcher(secondPage.html, "/en/products?page=2", "/de/produkte?page=2", "de");
  expectAlternates(secondPage.html, "/en/products?page=2", "/de/produkte?page=2");

  for (const path of ["/de/produkte", "/de/produkte?page=1"]) {
    const firstPage = await render(path);

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.html.productsPage, "1");
    expectSwitcher(firstPage.html, "/en/products", "/de/produkte", "de", path);
    expectAlternates(firstPage.html, "/en/products", "/de/produkte", path);
  }

  // The English word in the German build reaches the root catchall, not the product.
  const wrongWord = await render("/de/products/2");

  assert.equal(wrongWord.status, 200);
  assert.equal(wrongWord.html.missing, true);
  assert.equal(wrongWord.html.product, false);
  // The catchall keeps its captured values in every locale, and the snippet emits no alternates.
  expectSwitcher(wrongWord.html, "/en/products/2", "/de/products/2", "de");
  assert.deepEqual(wrongWord.html.alternates, []);
  assert.equal(wrongWord.html.alternateLinks, 0);

  const redirect = await render("/de/alte-produkte/1");

  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.location, "/de/produkte/1");

  await save("http.json", responses);

  // 4. Chromium: hydrate the live German render, then reach the lazy child by typed links.
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  const video = join(evidence, "video");
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 960, height: 600 },
    recordVideo: { dir: video, size: { width: 960, height: 600 } },
  });
  const page = await context.newPage();
  const errors = [];
  const requests = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("request", (sent) => requests.push({ url: sent.url(), type: sent.resourceType() }));

  await page.goto(`${origin}/de/produkte/2`);
  await page.waitForSelector("html[data-proof-stable='true']", { state: "attached" });

  // The switcher's links and the head's alternates, as the browser has them now.
  const languageState = () =>
    page.evaluate(() => ({
      path: location.pathname,
      token: window.proofDocument,
      switcher: [...document.querySelectorAll("nav[aria-label='Language'] a")].map((link) => [
        link.getAttribute("hreflang"),
        link.getAttribute("href"),
        link.getAttribute("aria-current"),
      ]),
      alternates: [...document.head.querySelectorAll("link[data-hreflang]")].map((link) => [
        link.getAttribute("hreflang"),
        link.getAttribute("href"),
      ]),
      alternateLinks: document.head.querySelectorAll("link[rel='alternate']").length,
      lazyLocaleUrls: document.getElementById("members")?.getAttribute("data-locale-urls") ?? null,
    }));
  const waitForSwitcher = (href) =>
    page.waitForFunction(
      (expected) => document.getElementById("locale-en")?.getAttribute("href") === expected,
      href,
    );

  const hydrated = await page.evaluate(() => {
    const switcher = [...document.querySelectorAll("nav[aria-label='Language'] a")];

    return {
      retained:
        window.proofServerProduct !== null &&
        window.proofServerProduct === document.getElementById("product"),
      // With provideActiveRouteHydration() the seeded switcher keeps the server's anchors.
      switcherRetained:
        window.proofServerSwitcher.length === 2 &&
        switcher.length === 2 &&
        window.proofServerSwitcher.every((link, index) => link === switcher[index]),
      token: window.proofDocument,
      errors: window.proofErrors,
      productId: document.getElementById("product-id")?.textContent,
    };
  });
  const hydratedLanguage = await languageState();

  await page.screenshot({ path: join(evidence, "de-product-hydrated.png") });
  await page.waitForTimeout(600);

  const chunkRequests = () =>
    requests.filter((sent) => new URL(sent.url).pathname.endsWith(`/${basename(childrenChunk)}`));

  assert.equal(chunkRequests().length, 0);

  await page.click("#teams-link");
  await page.waitForSelector("#team");
  assert.equal(new URL(page.url()).pathname, "/de/teams/7");
  await waitForSwitcher("/en/teams/7");

  const teamLanguage = await languageState();

  await page.waitForTimeout(600);
  await page.click("#members-link");
  await page.waitForSelector("#members");
  assert.equal(new URL(page.url()).pathname, "/de/teams/7/mitglieder");
  await waitForSwitcher("/en/teams/7/members");

  const membersLanguage = await languageState();

  await page.waitForTimeout(600);
  await page.screenshot({ path: join(evidence, "de-lazy-child.png") });

  const after = await page.evaluate(() => ({
    token: window.proofDocument,
    errors: window.proofErrors,
  }));
  const documents = requests.filter((sent) => sent.type === "document");
  const clientDocuments = documents.length;
  // Before the English document fetches its own copy of the chunk.
  const lazyChunkRequests = chunkRequests().length;

  // The switcher's English link is a document navigation into the English build.
  await page.click("#locale-en");
  await page.waitForURL("**/en/teams/7/members");
  await page.waitForSelector("html[data-proof-stable='true']", { state: "attached" });
  await page.waitForSelector("#members");
  await waitForSwitcher("/en/teams/7/members");

  const englishLanguage = await languageState();
  const english = await page.evaluate(() => ({
    locale: document.getElementById("locale")?.textContent,
    errors: window.proofErrors,
  }));

  await page.waitForTimeout(600);
  await page.screenshot({ path: join(evidence, "en-after-switch.png") });

  const switchedDocuments = requests.filter((sent) => sent.type === "document").length;
  const language = {
    hydrated: hydratedLanguage,
    team: teamLanguage,
    members: membersLanguage,
    english: englishLanguage,
  };

  await save("browser.json", { hydrated, after, english, language, errors, requests });
  await context.close();

  const [recording] = await readdir(video);

  await rename(join(video, recording), join(evidence, "de-hydration-lazy-click.webm"));

  assert.equal(hydrated.retained, true);
  assert.equal(hydrated.switcherRetained, true);
  assert.equal(hydrated.productId, "2");
  assert.equal(after.token, hydrated.token);
  assert.equal(clientDocuments, 1);
  assert.equal(lazyChunkRequests, 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(after.errors, []);

  expectSwitcher(hydratedLanguage, "/en/products/2", "/de/produkte/2", "de", "hydrated");
  expectAlternates(hydratedLanguage, "/en/products/2", "/de/produkte/2", "hydrated");
  expectSwitcher(teamLanguage, "/en/teams/7", "/de/teams/7", "de", "team");
  expectAlternates(teamLanguage, "/en/teams/7", "/de/teams/7", "team");
  expectSwitcher(membersLanguage, "/en/teams/7/members", "/de/teams/7/mitglieder", "de", "members");
  expectAlternates(membersLanguage, "/en/teams/7/members", "/de/teams/7/mitglieder", "members");
  assert.equal(teamLanguage.token, hydrated.token);
  assert.equal(membersLanguage.token, hydrated.token);

  assert.equal(switchedDocuments, 2);
  assert.notEqual(englishLanguage.token, hydrated.token);
  assert.equal(englishLanguage.path, "/en/teams/7/members");
  assert.equal(english.locale, "en");
  assert.deepEqual(english.errors, []);
  expectSwitcher(englishLanguage, "/en/teams/7/members", "/de/teams/7/mitglieder", "en", "english");
  expectAlternates(englishLanguage, "/en/teams/7/members", "/de/teams/7/mitglieder", "english");
} finally {
  await browser?.close();
  await stop(server, "server.log");
}

// 5. Extraction lists route words, the lazy-only one included, with their notes.
const extracted = join(evidence, "i18n");

await succeeds(app, "extract-i18n", ["extract-i18n", `--output-path=${extracted}`]);

const messages = await readFile(join(extracted, "messages.xlf"), "utf8");

for (const word of ["products", "members", "teams", "old-products"]) {
  const unit = messages.match(
    new RegExp(`<trans-unit id="route\\.segment\\.${escape(word)}"[^>]*>([^]*?)</trans-unit>`),
  );

  assert.ok(unit, `route.segment.${word} is extracted`);
  assert.match(unit[1], new RegExp(`<source>${escape(word)}</source>`));
  assert.match(unit[1], /<note priority="1" from="meaning">URL path segment<\/note>/);
  assert.match(
    unit[1],
    /<note priority="1" from="description">One segment of page URLs, without (?:"|&quot;)\/(?:"|&quot;)\. Changing it changes links and bookmarks\.<\/note>/,
  );
}

// 6. Strict refresh: a new route word fails Angular's build, not generation, so it can be
// extracted, translated and built.
const strict = await consumer("strict");
const catalog = join(strict, "src/locale/messages.de.xlf");

await mkdir(join(strict, "src/routes/offers"));
await writeFile(
  join(strict, "src/routes/offers/page.ts"),
  `import { Component } from "@angular/core";

@Component({ template: \`<p id="offers">Offers</p>\` })
export default class Offers {}
`,
);

const missing = await cli(strict, "strict-build-missing", ["build"]);

assert.notEqual(missing.code, 0);
assert.match(missing.output, /route\.segment\.offers/);
assert.equal(await exists(join(strict, "src/routes/offers/destination.generated.ts")), true);

const strictExtracted = join(evidence, "strict-i18n");

await succeeds(strict, "strict-extract-i18n", ["extract-i18n", `--output-path=${strictExtracted}`]);
assert.match(
  await readFile(join(strictExtracted, "messages.xlf"), "utf8"),
  /<trans-unit id="route\.segment\.offers"/,
);

const original = await readFile(catalog, "utf8");

await writeFile(
  catalog,
  original.replace(
    "    </body>",
    `      <trans-unit id="route.segment.offers" datatype="html">
        <source>offers</source>
        <target>angebote</target>
      </trans-unit>
    </body>`,
  ),
);
await succeeds(strict, "strict-build", ["build"]);

// The new word is in the table the passing build defined.
const strictTables = [];

for (const file of await files(join(strict, "dist/proof/browser/de"))) {
  if (file.endsWith(".js")) {
    strictTables.push(...localeTables(await readFile(file, "utf8")));
  }
}

assert.equal(strictTables.length, 1);
assert.deepEqual(strictTables[0].locales[1].words, [
  ["members", "mitglieder"],
  ["offers", "angebote"],
  ["old-products", "alte-produkte"],
  ["products", "produkte"],
]);

const strictPort = await freePort();
const strictServer = background(process.execPath, [join(strict, "dist/proof/server/server.mjs")], {
  cwd: strict,
  env: { ...process.env, PORT: String(strictPort) },
});

try {
  await listening(strictPort, strictServer);

  // Under the ** Server policy: a live render, not a prerendered file.
  const offers = await request(`http://127.0.0.1:${strictPort}/de/angebote`);

  await writeFile(join(evidence, "strict-de-angebote.html"), offers.body);
  assert.equal(offers.status, 200);

  const offersHtml = inspect(offers.body);

  assert.equal(offersHtml.offers, true);
  expectSwitcher(offersHtml, "/en/offers", "/de/angebote", "de");
} finally {
  await stop(strictServer, "strict-server.log");
}

// 7. ng serve (de only) after a bad catalog edit, a source save, and the repair; then a valid
// translation edit, which the running dev server's locale table doesn't follow until a restart.
const served = await consumer("serve");
const serveCatalog = join(served, "src/locale/messages.de.xlf");
const serveCatalogText = await readFile(serveCatalog, "utf8");
const shell = join(served, "src/app.ts");
const shellText = await readFile(shell, "utf8");
let dev = background(process.execPath, [ng, "serve"], { cwd: served, env: environment() });
let devLog = "serve.log";
const observations = [];

function builds() {
  return dev.output.match(/Application bundle generation complete/g)?.length ?? 0;
}

async function until(predicate, description, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${description}:\n${dev.output}`);
    assert.equal(dev.child.exitCode, null, `ng serve exited:\n${dev.output}`);
    await new Promise((done) => setTimeout(done, 100));
  }
}

let saves = 0;

// Changes a source file Angular builds, so its watcher rebuilds.
async function saveSource() {
  const before = builds();

  saves += 1;
  await writeFile(shell, `${shellText}\n// save ${saves}\n`);
  await until(() => builds() > before, `the rebuild after save ${saves}`);
}

async function translateTeams(target) {
  await writeFile(
    serveCatalog,
    serveCatalogText.replace("<target>teams</target>", `<target>${target}</target>`),
  );
}

const tableWarning =
  /Locale words changed \(([^)]*)\)\. Links from localeUrls keep the words ng serve started with until you restart it\./;

try {
  await until(() => /http:\/\/127\.0\.0\.1:\d+\//.test(dev.output), "the dev server");

  let base = dev.output.match(/http:\/\/127\.0\.0\.1:\d+\//)[0];

  async function look(step, path) {
    const response = await request(new URL(path.slice(1), base).href, 60000);
    const result = { step, path, status: response.status, html: inspect(response.body) };

    observations.push(result);
    await writeFile(join(evidence, `serve-${observations.length}.html`), response.body);

    return { ...result, body: response.body };
  }

  const initial = await look("initial", "/produkte/1");

  assert.equal(initial.status, 200);
  assert.equal(initial.html.productId, "1");
  // The served locale's output is flat: its own link has no prefix; English keeps its build's.
  expectSwitcher(initial.html, "/en/products/1", "/produkte/1", "de");

  // A collision: logged at once, and the server keeps serving the catalog it built with.
  const beforeCollision = builds();
  const collisionLog = dev.output.length;

  await translateTeams("produkte");
  await until(
    () => /Locale de: .*Ordinary route collision\/overlap/.test(dev.output.slice(collisionLog)),
    "the logged collision",
  );
  await new Promise((done) => setTimeout(done, 3000));
  // Angular's dev server doesn't watch catalogs: no rebuild follows a catalog edit.
  assert.equal(builds(), beforeCollision);

  const unchanged = await look("collision, before a source save", "/produkte/1");

  assert.equal(unchanged.status, 200);
  assert.equal(unchanged.html.productId, "1");

  // After a rebuild the collided catalog is served: the earlier route-config entry wins.
  await saveSource();

  const collided = await look("collision, after a source save", "/produkte/7");

  assert.equal(collided.status, 200);
  assert.equal(collided.html.productId, "7");
  assert.equal(collided.html.team, false);

  // A shape-invalid translation: logged at once, and after a rebuild the destination throws.
  const invalidLog = dev.output.length;

  await translateTeams("a/b");
  await until(
    () =>
      /Locale de: route\.segment\.teams translates to "a\/b" .*can't contain "\/"/.test(
        dev.output.slice(invalidLog),
      ),
    "the logged grammar error",
  );
  await saveSource();

  const broken = await look("invalid, after a source save", "/produkte/1");
  const thrown =
    /Translated segment 1 of src\/routes\/teams\/\$teamId\/route\.ts is not a valid static segment: "a\/b"/;

  assert.notEqual(broken.status, 200);
  assert.ok(thrown.test(broken.body) || thrown.test(dev.output.slice(invalidLog)), broken.body);

  // The repair: the next regeneration passes, and the next rebuild serves both routes again.
  const repairLog = dev.output.length;

  await writeFile(serveCatalog, serveCatalogText);
  await new Promise((done) => setTimeout(done, 3000));
  assert.doesNotMatch(dev.output.slice(repairLog), /Locale de:/);
  await saveSource();

  const product = await look("repaired", "/produkte/1");
  const team = await look("repaired", "/teams/7");

  assert.equal(product.status, 200);
  assert.equal(product.html.productId, "1");
  assert.equal(team.status, 200);
  assert.equal(team.html.team, true);
  // Failed passes and the repair leave the table as it started.
  assert.doesNotMatch(dev.output, tableWarning);

  // A valid new translation: the regeneration warns, naming the word.
  const editLog = dev.output.length;

  await writeFile(
    serveCatalog,
    serveCatalogText.replace("<target>mitglieder</target>", "<target>mitwirkende</target>"),
  );
  await until(() => tableWarning.test(dev.output.slice(editLog)), "the locale table warning");
  assert.equal(dev.output.slice(editLog).match(tableWarning)[1], "route.segment.members in de");
  await saveSource();

  // The rebuilt page has the new word; the running dev server's links keep the old one.
  const stale = await look("new word, before a restart", "/teams/7/mitwirkende");

  assert.equal(stale.status, 200);
  assert.equal(stale.html.members, true);
  expectSwitcher(stale.html, "/en/teams/7/members", "/teams/7/mitglieder", "de");

  // A restart defines the new table.
  await stop(dev, devLog);
  dev = background(process.execPath, [ng, "serve"], { cwd: served, env: environment() });
  devLog = "serve-restart.log";
  await until(() => /http:\/\/127\.0\.0\.1:\d+\//.test(dev.output), "the restarted dev server");
  base = dev.output.match(/http:\/\/127\.0\.0\.1:\d+\//)[0];

  const restarted = await look("new word, after a restart", "/teams/7/mitwirkende");

  assert.equal(restarted.status, 200);
  assert.equal(restarted.html.members, true);
  expectSwitcher(restarted.html, "/en/teams/7/members", "/teams/7/mitwirkende", "de");
  assert.doesNotMatch(dev.output, tableWarning);
} finally {
  await save("serve.json", observations);
  await stop(dev, devLog);
}

console.log(
  "Translated segments: committed outputs, per-locale bundles and locale tables, prerender, cross-locale SSR, the language switcher and hreflang alternates, hydration, extraction, the strict refresh flow and serve all passed",
);

// Sibling pathless groups with translated segments: each group's claims carry its descendants'
// messages, so a German word reaches the group whose route it translates, and a source word
// doesn't (it falls through to the root catchall).
const groups = await consumer("groups");
const groupCatalog = join(groups, "src/locale/messages.de.xlf");

for (const [path, text] of [
  [
    "+authenticated/route.ts",
    'import { defineRoute } from "@loozo/angular-router";\n\nexport default defineRoute("", {}).canMatch([() => true]);\n',
  ],
  [
    "+signed-in/route.ts",
    'import { defineRoute } from "@loozo/angular-router";\n\nexport default defineRoute("", {});\n',
  ],
]) {
  await mkdir(dirname(join(groups, "src/routes", path)), { recursive: true });
  await writeFile(join(groups, "src/routes", path), text);
}

for (const [directory, template] of [
  ["+authenticated", '<section data-layout="authenticated"><router-outlet /></section>'],
  ["+signed-in", '<section data-layout="signed-in"><router-outlet /></section>'],
  ["+authenticated/inbox", '<p data-leaf="inbox">inbox</p>'],
  ["+signed-in/profile", '<p data-leaf="profile">profile</p>'],
]) {
  let imports = "";
  let header = "";

  if (template.includes("router-outlet")) {
    header = 'import { RouterOutlet } from "@angular/router";\n';
    imports = "imports: [RouterOutlet], ";
  }

  await mkdir(join(groups, "src/routes", directory), { recursive: true });
  await writeFile(
    join(groups, "src/routes", directory, "page.ts"),
    `import { Component } from "@angular/core";\n${header}\n@Component({ ${imports}template: '${template}' })\nexport default class Page {}\n`,
  );
}

await writeFile(
  groupCatalog,
  (await readFile(groupCatalog, "utf8")).replace(
    "    </body>",
    `      <trans-unit id="route.segment.inbox" datatype="html">
        <source>inbox</source>
        <target>posteingang</target>
      </trans-unit>
      <trans-unit id="route.segment.profile" datatype="html">
        <source>profile</source>
        <target>profil</target>
      </trans-unit>
    </body>`,
  ),
);
await succeeds(groups, "build-groups", ["build"]);
assert.match(
  await readFile(join(groups, "generated/routes.generated.ts"), "utf8"),
  /\.\.\.owned\(\[\[\$localize`:URL path segment\|[^`]*@@route\.segment\.inbox:inbox`\]\], callbacks\(/,
);

const groupPort = await freePort();
const groupServer = background(process.execPath, [join(groups, "dist/proof/server/server.mjs")], {
  cwd: groups,
  env: { ...process.env, PORT: String(groupPort) },
});
const groupRenders = {};

try {
  await listening(groupPort, groupServer);

  for (const path of ["/de/posteingang", "/de/profil", "/en/inbox", "/en/profile", "/de/inbox"]) {
    const response = await request(`http://127.0.0.1:${groupPort}${path}`);

    groupRenders[path] = {
      status: response.status,
      rendered: [...response.body.matchAll(/data-(?:layout|leaf)="([^"]*)"/g)].map(
        (match) => match[1],
      ),
      missing: inspect(response.body).missing,
    };
  }
} finally {
  await save("groups.json", groupRenders);
  await stop(groupServer, "groups-server.log");
}

assert.deepEqual(groupRenders["/de/posteingang"].rendered, ["authenticated", "inbox"]);
assert.deepEqual(groupRenders["/de/profil"].rendered, ["signed-in", "profile"]);
assert.deepEqual(groupRenders["/en/inbox"].rendered, ["authenticated", "inbox"]);
assert.deepEqual(groupRenders["/en/profile"].rendered, ["signed-in", "profile"]);
assert.deepEqual(groupRenders["/de/inbox"].rendered, []);
assert.equal(groupRenders["/de/inbox"].missing, true);

console.log(
  "Translated segments: sibling pathless groups route each locale's words to their group",
);
