// The sibling pathless groups tree (SPEC §10) that the navigation, SSR and outlets harnesses
// build: two `+group` folders under the root, with query-driven guards and evaluation markers,
// so one build serves every case and each URL runs in a fresh browser context.
//
// src/routes/
//   +authenticated/  canMatch: ?auth=deny refuses, ?auth=redirect redirects to /blocked
//     inbox, settings
//   +signed-in/      canMatch: ?signed=deny refuses
//     +index (index), profile
//   outside, blocked
import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");
const require = createRequire(join(packageDirectory, "package.json"));
const { Architect } = require("@angular-devkit/architect");
const { WorkspaceNodeModulesArchitectHost } = require("@angular-devkit/architect/node");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");
const { NodeJsSyncHost } = nativeRequire("@angular-devkit/core/node");

async function write(directory, path, text) {
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(join(directory, path), text);
}

// A page that renders its label, then the outlets it names ("" for the primary one).
function leaf(label, outlets = []) {
  let template = `<p data-leaf="${label}">${label}</p>`;

  for (const outlet of outlets) {
    if (outlet === "") {
      template += "<router-outlet />";
    } else {
      template += `<router-outlet name="${outlet}" />`;
    }
  }

  if (outlets.length === 0) {
    return `import { Component } from '@angular/core';
@Component({ template: '${template}' })
export default class Leaf {}
`;
  }

  return `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
@Component({ imports: [RouterOutlet], template: '${template}' })
export default class Leaf {}
`;
}

// A group's layout at src/routes/<directory>, marked when its module evaluates.
function layout(directory, label) {
  return `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { mark } from '${"../".repeat(directory.split("/").length + 1)}proof';
mark('${label}:layout');
@Component({ imports: [RouterOutlet], template: '<section data-layout="${label}"><h2>${label} layout</h2><router-outlet /></section>' })
export default class Layout {}
`;
}

/**
 * A fixture directory under `evidence` holding the tree, copied from `app` (an example app's
 * directory below examples/angular-router, "" for the plain one) with the app's own routes
 * removed. The shell renders a `chat` outlet and exposes the router, and in the browser the
 * active route it reads before the initial navigation starts (the hydration seed's handle).
 *
 * - `index`: `+signed-in/+index`, the winner of `/`.
 * - `catchall`: `+authenticated/$rest[]`, a not-found page inside the authenticated layout.
 * - `rootCatchall`: a root `$rest[]` not-found page.
 * - `products`: `products` with `+a/inbox` and `+b/profile` below it, and no index.
 * - `initializer`: an environment initializer in `+authenticated`'s providers.
 * - `chat`: a root `chat/$id` branch (numberParam) whose guard refuses unless ?aux=allow;
 *   `"exact"` adds a primary `+authenticated/chat/$id` page (stringParam), and `"anchored"` a
 *   `detail` branch below `+authenticated/products`.
 */
export async function siblingFixture(
  evidence,
  name,
  {
    app = "",
    index = true,
    catchall = false,
    rootCatchall = false,
    products = false,
    initializer = false,
    chat,
  } = {},
) {
  const directory = join(evidence, name);

  await cp(join(repository, "examples/angular-router", app), directory, {
    recursive: true,
    filter: (path) =>
      !/(?:^|\/)(?:node_modules|dist|\.angular|out-tsc|generated|routes|localize-proof|outlets-proof|ssr-proof)(?:\/|$)/.test(
        path.slice(join(repository, "examples/angular-router", app).length),
      ),
  });

  const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));

  for (const dependency of new Set([
    ...Object.keys(metadata.dependencies),
    ...Object.keys(metadata.devDependencies),
    "@loozo/angular-router",
  ])) {
    const link = join(directory, "node_modules", dependency);
    let target = join(packageDirectory, "node_modules", dependency);

    if (dependency === "@loozo/angular-router") {
      target = packageDirectory;
    }

    await mkdir(dirname(link), { recursive: true });
    await symlink(target, link, "dir");
  }

  await write(
    directory,
    "src/proof.ts",
    `import { inject } from '@angular/core';
import { Router } from '@angular/router';
// What ran, in order: guard calls and module evaluations.
export const proof = ((globalThis as any).proof ??= { calls: [] as string[], evaluated: [] as string[] });
export function mark(name: string) { proof.evaluated.push(name); }
// A query value of the navigation being recognized; call it from a guard's injection context.
export function query(name: string): string | null {
  return inject(Router).currentNavigation()?.extractedUrl.queryParamMap.get(name) ?? null;
}
`,
  );

  let indexImport = "";
  let indexLabel = "";
  let indexLink = "";

  if (index) {
    indexImport =
      "import { destination as index } from './routes/+signed-in/+index/destination.generated.js';\n";
    indexLabel = "\n        if (route.is(index)) return 'index';";
    indexLink =
      "\n      if (first?.is(index)) proofGlobal.proofFirstLink = router.serializeUrl(first.link({}));";
  }

  await write(
    directory,
    "src/shell.ts",
    `import { ApplicationRef, Component, PLATFORM_ID, afterNextRender, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { injectActiveRoute } from '../generated/routes.generated.js';
import { destination as signedIn } from './routes/+signed-in/destination.generated.js';
import { destination as profile } from './routes/+signed-in/profile/destination.generated.js';
${indexImport}import { proof } from './proof';
@Component({ selector: 'proof-app', imports: [RouterOutlet], template: '<h1>Sibling groups</h1><router-outlet /><router-outlet name="chat" />' })
export default class Shell {
  readonly active = injectActiveRoute();
  constructor() {
    const router = inject(Router);
    const application = inject(ApplicationRef);
    const proofGlobal = globalThis as any;
    proofGlobal.proofRouter = router;
    proofGlobal.navigationErrors = [];
    router.events.subscribe((event) => {
      // NavigationEnd, NavigationCancel, NavigationError
      if (event.type === 1 || event.type === 2 || event.type === 3) {
        proofGlobal.settled = true;
      }
      if (event.type === 3) {
        proofGlobal.navigationErrors.push(String((event as any).error?.message ?? (event as any).error));
      }
    });
    proof.calls.push('shell');
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // What the shell reads before the client's initial navigation starts.
      const first = this.active();
      proofGlobal.proofShell = this;
      proofGlobal.proofStart = { navigated: router.navigated, navigating: router.currentNavigation() !== null };
      proofGlobal.proofFirst = first;
      proofGlobal.proofFirstChain = first?.chain.map((route) => {
        if (route.is(signedIn)) return 'signed-in';
        if (route.is(profile)) return 'profile';${indexLabel}
        return 'other';
      });
      if (first?.is(profile)) proofGlobal.proofFirstLink = router.serializeUrl(first.link({}));${indexLink}
    }
    afterNextRender(() => {
      void application.whenStable().then(() => {
        document.documentElement.dataset.proofStable = 'true';
      });
    });
  }
}
`,
  );

  for (const file of ["src/main.ts", "src/main.server.ts"]) {
    try {
      const text = await readFile(join(directory, file), "utf8");

      await writeFile(join(directory, file), text.replace(/["']\.\/app\.js["']/, '"./shell.js"'));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  // The shell replaces the app's own root component, which may link to routes this tree drops.
  await rm(join(directory, "src/app.ts"), { force: true });

  const providers = initializer
    ? ".providers([provideEnvironmentInitializer(() => mark('authenticated:init'))])"
    : "";

  await write(
    directory,
    "src/routes/+authenticated/route.ts",
    `import { inject, provideEnvironmentInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { defineRoute } from '@loozo/angular-router';
import { mark, proof, query } from '../../proof';
mark('authenticated:route');
export default defineRoute('', {})${providers}.canMatch([() => {
  proof.calls.push('authenticated:canMatch');
  const auth = query('auth');
  if (auth === 'deny') return false;
  if (auth === 'redirect') return inject(Router).parseUrl('/blocked');
  return true;
}]);
`,
  );
  await write(
    directory,
    "src/routes/+signed-in/route.ts",
    `import { defineRoute } from '@loozo/angular-router';
import { mark, proof, query } from '../../proof';
mark('signed-in:route');
export default defineRoute('', {}).canMatch([() => {
  proof.calls.push('signed-in:canMatch');
  return query('signed') !== 'deny';
}]);
`,
  );
  await write(
    directory,
    "src/routes/+authenticated/page.ts",
    layout("+authenticated", "authenticated"),
  );
  await write(directory, "src/routes/+signed-in/page.ts", layout("+signed-in", "signed-in"));

  const pages = {
    "+authenticated/settings": leaf("settings"),
    "+signed-in/profile": leaf("profile"),
    outside: leaf("outside"),
    blocked: leaf("blocked"),
  };

  if (index) {
    pages["+signed-in/+index"] = leaf("index");
    // The typed `..` exists only where `/` has a winner, so the inbox exposes its handle then.
    pages["+authenticated/inbox"] = `import { Component } from '@angular/core';
import { injectRoute } from './route.generated';
@Component({ template: '<p data-leaf="inbox">inbox</p>' })
export default class Inbox {
  readonly handle = injectRoute();
  constructor() { (globalThis as any).proofInbox = { up: () => this.handle.navigate({ to: '..' }) }; }
}
`;
  } else {
    pages["+authenticated/inbox"] = leaf("inbox");
  }

  if (catchall) {
    pages["+authenticated/$rest[]"] = leaf("not-found");
    await write(
      directory,
      "src/routes/+authenticated/$rest[]/route.ts",
      `import { defineRoute, stringParam } from '@loozo/angular-router';\nimport parent from '../route.js';\nexport default defineRoute('$rest[]', { parent, params: { rest: stringParam } });\n`,
    );
  }

  if (rootCatchall) {
    pages["$rest[]"] = leaf("missing");
    await write(
      directory,
      "src/routes/$rest[]/route.ts",
      `import { defineRoute, stringParam } from '@loozo/angular-router';\nexport default defineRoute('$rest[]', { params: { rest: stringParam } });\n`,
    );
  }

  if (products) {
    pages.products = leaf("products", [""]);
    pages["products/+a/inbox"] = leaf("products-inbox");
    pages["products/+b/profile"] = leaf("products-profile");
    await write(directory, "src/routes/products/+a/page.ts", layout("products/+a", "products-a"));
    await write(directory, "src/routes/products/+b/page.ts", layout("products/+b", "products-b"));
  }

  if (chat) {
    pages["chat/$id"] = leaf("chat-panel");
    await write(
      directory,
      "src/routes/chat/$id/route.ts",
      `import { defineRoute, numberParam } from '@loozo/angular-router';
import { proof, query } from '../../../proof';
export default defineRoute('chat/$id', { outlet: 'chat', params: { id: numberParam } }).canMatch([() => {
  const allowed = query('aux') === 'allow';
  proof.calls.push('chat:canMatch:' + allowed);
  return allowed;
}]);
`,
    );
  }

  if (chat === "exact") {
    pages["+authenticated/chat/$id"] = leaf("authenticated-chat");
    await write(
      directory,
      "src/routes/+authenticated/chat/$id/route.ts",
      `import { defineRoute, stringParam } from '@loozo/angular-router';\nimport parent from '../../route.js';\nexport default defineRoute('chat/$id', { parent, params: { id: stringParam } });\n`,
    );
  }

  if (chat === "anchored") {
    pages["+authenticated/products"] = leaf("authenticated-products", ["detail"]);
    pages["+authenticated/products/item/$id"] = leaf("detail-panel");
    await write(
      directory,
      "src/routes/+authenticated/products/item/$id/route.ts",
      `import { defineRoute, numberParam } from '@loozo/angular-router';\nimport parent from '../../route.js';\nexport default defineRoute('item/$id', { parent, outlet: 'detail', params: { id: numberParam } });\n`,
    );
  }

  for (const [path, text] of Object.entries(pages)) {
    await write(directory, `src/routes/${path}/page.ts`, text);
  }

  return directory;
}

/** Builds a fixture with the router's application builder; fails on an unsuccessful build. */
export async function buildFixture(directory, options = {}) {
  const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
  const { workspace } = await core.workspaces.readWorkspace(directory, host);
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  const architect = new Architect(
    new WorkspaceNodeModulesArchitectHost(workspace, directory),
    registry,
  );
  const logger = new core.logging.Logger("sibling-groups");
  const logs = [];

  logger.subscribe((entry) => logs.push(entry));

  const run = await architect.scheduleTarget(
    { project: "proof", target: "build" },
    { statsJson: true, ...options },
    { logger },
  );

  try {
    const output = await run.result;

    await writeFile(
      join(directory, "build-report.json"),
      JSON.stringify({ output, logs }, null, 2),
    );
    assert.equal(output.success, true, JSON.stringify(logs));
  } finally {
    await run.stop();
  }
}

/** Each emitted browser chunk's generated children tables and route source modules. */
export async function chunkSources(directory) {
  const stats = JSON.parse(
    await readFile(join(directory, "dist/proof/browser-stats.json"), "utf8"),
  );
  const result = {};

  for (const [file, output] of Object.entries(stats.outputs)) {
    const inputs = [];

    for (const input of Object.keys(output.inputs)) {
      if (input.includes("src/routes/")) {
        inputs.push(input.slice(input.indexOf("src/routes/")));
      }
    }

    result[file] = inputs;
  }

  return result;
}

/** The children tables among requested chunk paths. */
export function requestedTables(chunks, requests) {
  const tables = new Set();

  for (const request of requests) {
    for (const input of chunks[request] ?? []) {
      if (input.endsWith("children.generated.ts")) {
        tables.add(input);
      }
    }
  }

  return [...tables].sort();
}

/** A static server for a fixture's browser files that answers every page with index.html. */
export async function staticServer(directory) {
  const browserFiles = join(directory, "dist/proof/browser");
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;

    try {
      if (path.endsWith(".js") || path.endsWith(".css")) {
        let type = "text/css";

        if (path.endsWith(".js")) {
          type = "text/javascript";
        }

        const body = await readFile(join(browserFiles, path));

        response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);

        return;
      }

      const body = await readFile(join(browserFiles, "index.html"));

      response
        .writeHead(200, { "content-type": "text/html", "cache-control": "no-store" })
        .end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((done) => server.listen(0, "127.0.0.1", done));

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  };
}

/**
 * Opens `url` cold in a fresh context and reports what settled: the router URL, the rendered
 * layouts and leaves in document order, guard calls, evaluated modules, requested children
 * tables, navigation errors and page errors. `screenshot` saves the settled page.
 */
export async function visitCold(browser, base, chunks, url, { screenshot } = {}) {
  const context = await browser.newContext({ colorScheme: "dark" });
  const tab = await context.newPage();
  const requests = [];
  const pageErrors = [];

  tab.on("request", (request) => {
    const path = new URL(request.url()).pathname.slice(1);

    if (path.endsWith(".js")) {
      requests.push(path);
    }
  });
  tab.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    await tab.goto(base + url);
    await tab.waitForFunction(() => window.settled === true);
    await tab.waitForTimeout(100);

    const seen = await tab.evaluate(() => ({
      url: window.proofRouter.url,
      rendered: [...document.querySelectorAll("[data-layout], [data-leaf]")].map(
        (node) => node.getAttribute("data-layout") ?? node.getAttribute("data-leaf"),
      ),
      calls: [...window.proof.calls],
      evaluated: [...window.proof.evaluated],
      navigationErrors: [...window.navigationErrors],
    }));

    seen.tables = requestedTables(chunks, requests);
    seen.pageErrors = pageErrors;

    if (screenshot) {
      await tab.screenshot({ path: screenshot, fullPage: true });
    }

    return { seen, tab, close: () => context.close() };
  } catch (error) {
    await context.close();

    throw error;
  }
}

/** The NG04002 code of each navigation error, or the message when it has none. */
export function errorCodes(seen) {
  const codes = [];

  for (const message of seen.navigationErrors) {
    const code = /NG0\d+/.exec(message);

    if (code) {
      codes.push(code[0]);
    } else {
      codes.push(message);
    }
  }

  return codes;
}
