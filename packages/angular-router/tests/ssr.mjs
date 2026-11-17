import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { get } from "node:http";
import { createServer } from "node:net";
import { cp, lstat, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { emitPackage, extensionSource } from "./extension/emit.mjs";
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
await mkdir(join(fixture, "src/routes/$segments[]"));
await writeFile(
  join(fixture, "src/routes/$segments[]/route.ts"),
  `import { defineRoute, stringParam } from "@loozo/angular-router";

export default defineRoute("$segments[]", { params: { segments: stringParam } });
`,
);
await writeFile(
  join(fixture, "src/routes/$segments[]/page.ts"),
  `import { Component } from "@angular/core";

@Component({ template: '<p id="missing">Not found</p>' })
export default class Missing {}
`,
);
// Prototype-2 Q3's first ordering competition inside a group: an ordinary redirect beats an
// ordinary catchall page. (The second, a hoisted catchall redirect, would compete with this
// fixture's root not-found catchall, which the generator rejects; tests/navigation.mjs runs it.)
for (const [path, text] of [
  [
    "order/route.ts",
    'import { defineRoute } from "@loozo/angular-router";\n\nexport default defineRoute("order", {});\n',
  ],
  [
    "order/old/$id/route.ts",
    'import { defineRoute, numberParam } from "@loozo/angular-router";\nimport parent from "../../route.js";\nimport { destination as target } from "../../../handle-only/$id/destination.generated.js";\n\nexport default defineRoute("old/$id", { parent, params: { "id": numberParam } }).redirect({ to: target, params: { id: "id" }, search: { mode: "drop" }, fragment: { mode: "drop" } });\n',
  ],
  [
    "order/$rest[]/route.ts",
    'import { defineRoute, stringParam } from "@loozo/angular-router";\nimport parent from "../route.js";\n\nexport default defineRoute("$rest[]", { parent, params: { "rest": stringParam } });\n',
  ],
  [
    "order/$rest[]/page.ts",
    'import { Component } from "@angular/core";\n\n@Component({ template: \'<p id="order-rest">order rest</p>\' })\nexport default class OrderRest {}\n',
  ],
]) {
  await mkdir(dirname(join(fixture, "src/routes", path)), { recursive: true });
  await writeFile(join(fixture, "src/routes", path), text);
}

// Active-route hydration fixtures. Every guard below is browser-only and keyed on a query marker
// of the navigation it checks, so the server always renders item 7 with a seed while the
// client's navigation diverges.
const browserMarker = `import { PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Router } from "@angular/router";
`;

await writeFile(
  join(fixture, "src/routes/teams/$teamId/route.ts"),
  `${browserMarker}import { defineRoute, numberParam } from "@loozo/angular-router";

export default defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: { score: numberParam },
}).canMatch([
  () =>
    !isPlatformBrowser(inject(PLATFORM_ID)) ||
    !inject(Router).currentNavigation()?.extractedUrl.queryParamMap.has("refuse"),
]);
`,
);
await writeFile(
  join(fixture, "src/routes/teams/$teamId/items/$id/route.ts"),
  `${browserMarker}import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "../../route.js";
import { ItemCatalog } from "../../../../../catalog.js";

// Runs when the route copy evaluates: in the browser, when its children table loads.
(globalThis as { proofItemCopyEvaluated?: boolean }).proofItemCopyEvaluated = true;

export default defineRoute("items/$id", { parent: team, params: { id: numberParam } })
  .runGuardsAndResolvers("paramsOrQueryParamsChange")
  .canActivate([
    () => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return true;
      }

      const router = inject(Router);
      const markers = router.currentNavigation()?.extractedUrl.queryParamMap;

      if (markers?.has("reject")) {
        return false;
      }

      if (markers?.has("redirect")) {
        return router.parseUrl("/teams/7/items/8?score=42");
      }

      if (markers?.has("fail")) {
        throw new Error("proof-seed-guard-failure");
      }

      return true;
    },
  ])
  .resolve({
    item: ({ params, search }) => {
      const catalog = inject(ItemCatalog);

      return catalog({ teamId: params.teamId, id: params.id, score: search.score });
    },
  });
`,
);
await writeFile(
  join(fixture, "src/routes/handle-only/$id/route.ts"),
  `${browserMarker}import { defineRoute, numberParam, withFallback } from "@loozo/angular-router";

export default defineRoute("handle-only/$id", {
  params: { id: numberParam },
  search: { score: numberParam, page: withFallback(numberParam, 1) },
}).canActivate([
  () =>
    !isPlatformBrowser(inject(PLATFORM_ID)) ||
    !inject(Router).currentNavigation()?.extractedUrl.queryParamMap.has("race"),
]);
`,
);
// Resolver values JSON can't carry unchanged give no seed; a shared reference seeds.
await mkdir(join(fixture, "src/routes/values/$kind"), { recursive: true });
await writeFile(
  join(fixture, "src/routes/values/$kind/route.ts"),
  `import { defineRoute, stringParam } from "@loozo/angular-router";

export default defineRoute("values/$kind", { params: { kind: stringParam } }).resolve({
  value: ({ params }): unknown => {
    if (params.kind === "date") {
      return new Date(0);
    }

    if (params.kind === "bigint") {
      return 1n;
    }

    if (params.kind === "cycle") {
      const cycle: Record<string, unknown> = {};

      cycle["self"] = cycle;

      return cycle;
    }

    if (params.kind === "array") {
      return Object.assign([7], { total: 42 });
    }

    const shared = Object.assign(Object.create(null) as object, { x: 1 });

    return { a: shared, b: shared };
  },
});
`,
);
await writeFile(
  join(fixture, "src/routes/values/$kind/page.ts"),
  `import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({ template: '<p id="value-kind">{{ route.params().kind }}</p>' })
export default class Values {
  readonly route = injectRoute();
}
`,
);
await mkdir(join(fixture, "src/routes/titled/$id"), { recursive: true });
await writeFile(
  join(fixture, "src/routes/titled/$id/route.ts"),
  `import { defineRoute, numberParam } from "@loozo/angular-router";

export default defineRoute("titled/$id", { params: { id: numberParam } }).title(
  ({ params }) => \`Titled \${params.id}\`,
);
`,
);
await writeFile(
  join(fixture, "src/routes/titled/$id/page.ts"),
  `import { Component } from "@angular/core";

@Component({ template: '<p id="titled">titled</p>' })
export default class Titled {}
`,
);
// A native segment-consuming wrapper over the generated routes; a browser-only URL handling
// strategy that ignores "/" and "/legacy" on race=skip pages; and an app initializer, listed
// before the provider, that records router events and requests the race navigations.
await writeFile(
  join(fixture, "src/app.config.ts"),
  `import {
  PLATFORM_ID,
  inject,
  provideAppInitializer,
  provideEnvironmentInitializer,
  type ApplicationConfig,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import {
  EventType,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  PRIMARY_OUTLET,
  Router,
  UrlHandlingStrategy,
  provideRouter,
  type UrlTree,
} from "@angular/router";
import { provideClientHydration, withNoHttpTransferCache } from "@angular/platform-browser";
import { provideActiveRouteHydration, routes } from "../generated/routes.generated.js";

function race(): string | null {
  return new URLSearchParams(window.location.search).get("race");
}

function marked(name: string): boolean {
  return isPlatformBrowser(inject(PLATFORM_ID)) && new URLSearchParams(window.location.search).has(name);
}

export const config: ApplicationConfig = {
  providers: [
    provideRouter([{ path: "wrapped/:tenant", children: routes }, ...routes]),
    {
      provide: UrlHandlingStrategy,
      useFactory: (): UrlHandlingStrategy => {
        const skip = isPlatformBrowser(inject(PLATFORM_ID)) && race() === "skip";

        return {
          shouldProcessUrl: (url: UrlTree) => {
            if (!skip) {
              return true;
            }

            const primary = url.root.children[PRIMARY_OUTLET];

            return primary !== undefined && primary.segments[0]?.path !== "legacy";
          },
          extract: (url: UrlTree) => url,
          merge: (newUrlPart: UrlTree) => newUrlPart,
        };
      },
    },
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }

      const router = inject(Router);
      const proof = window as unknown as Record<string, unknown>;
      const events: { type: string; id?: number; code?: number; error?: string }[] = [];

      proof["proofEvents"] = events;
      router.events.subscribe((event) => {
        const entry: { type: string; id?: number; code?: number; error?: string } = {
          type: EventType[event.type],
        };

        if (event instanceof NavigationEnd) {
          entry.id = event.id;
        } else if (event instanceof NavigationCancel || event instanceof NavigationSkipped) {
          entry.id = event.id;
          entry.code = event.code;
        } else if (event instanceof NavigationError) {
          entry.id = event.id;
          entry.error = event.error instanceof Error ? event.error.message : String(event.error);
        }

        events.push(entry);
      });
      proof["proofWaiting"] = true;

      if (race() === "reject") {
        void router.navigateByUrl("/handle-only/1?race=reject");
      } else if (race() === "skip") {
        void router.navigateByUrl("/legacy");
      }
    }),
    // On reenter pages, a listener registered before the provider navigates again at the first
    // NavigationEnd; Angular delivers the nested same-URL skip before that NavigationEnd.
    provideEnvironmentInitializer(() => {
      if (!marked("reenter")) {
        return;
      }

      const router = inject(Router);
      let reentered = false;

      router.events.subscribe((event) => {
        if (event instanceof NavigationEnd && !reentered) {
          reentered = true;
          void router.navigateByUrl(event.urlAfterRedirects);
        }
      });
    }),
    provideClientHydration(withNoHttpTransferCache()),
    provideActiveRouteHydration(),
  ],
};
`,
);

// The shell reads the active route, server-side and through hydration.
await writeFile(
  join(fixture, "src/app.ts"),
  `import { ApplicationRef, Component, PLATFORM_ID, afterNextRender, computed, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { ActivationEnd, RouteConfigLoadEnd, Router, RouterOutlet } from "@angular/router";
import { injectActiveRoute } from "../generated/routes.generated.js";
import { destination as team } from "./routes/teams/$teamId/destination.generated.js";
import { destination as item } from "./routes/teams/$teamId/items/$id/destination.generated.js";

@Component({
  selector: "proof-app",
  imports: [RouterOutlet],
  template: \`
    <main>
      <h1>Router SSR proof</h1>
      <p id="active-route">{{ activeText() }}</p>
      <router-outlet />
    </main>
  \`,
})
export default class App {
  readonly application = inject(ApplicationRef);
  readonly router = inject(Router);
  readonly active = injectActiveRoute();
  // Never read by the template: adopts at the handover without a live consumer.
  readonly quiet = injectActiveRoute();
  readonly activeText = computed(() => {
    const route = this.active();

    if (!route) {
      return "none";
    }

    const teamId = route.chain.find((entry) => entry.is(team))?.params().teamId;

    if (route.is(item)) {
      return \`team \${teamId} item \${route.params().id}\`;
    }

    return "other";
  });

  constructor() {
    // The client's initial navigation: when each children table resolves, each route
    // activates and the app is stable, on one clock.
    const timeline: { event: string; path?: string; at: number }[] = [];

    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const proof = window as any;
      const first = this.active();

      // What the shell reads before the client's initial navigation starts.
      proof.proofStart = {
        navigated: this.router.navigated,
        navigating: this.router.currentNavigation() !== null,
      };
      proof.proofFirst = first;
      proof.proofQuietFirst = this.quiet();
      proof.proofFirstData = first?.data();

      if (first?.is(item)) {
        proof.proofFirstLink = this.router.serializeUrl(
          first.link({ params: { teamId: 7, id: 8 }, search: { score: 43 } }),
        );
      }

      proof.proofApp = this;
      proof.proofTimeline = timeline;
      this.router.events.subscribe((event) => {
        if (event instanceof RouteConfigLoadEnd) {
          timeline.push({ event: "config", path: event.route.path, at: performance.now() });
        } else if (event instanceof ActivationEnd) {
          timeline.push({ event: "activation", path: event.snapshot.routeConfig?.path, at: performance.now() });
        }
      });
    }

    afterNextRender(() => {
      void this.application.whenStable().then(() => {
        timeline.push({ event: "stable", at: performance.now() });
        document.documentElement.dataset.proofStable = "true";
      });
    });
  }
}
`,
);

// Route extension routes (plan scenarios 1 and 5): a handle-only page whose route builds
// no members, and two overlapping requests whose callbacks each see their own REQUEST.
await mkdir(join(fixture, "src/routes/ext-plain/$id"), { recursive: true });
await writeFile(
  join(fixture, "src/routes/ext-plain/$id/route.ts"),
  `import { numberParam, withFallback } from "@loozo/angular-router";
import { defineRoute } from "@fixture/route-extension";

export default defineRoute("ext-plain/$id", {
  params: { id: numberParam },
  search: { score: numberParam, page: withFallback(numberParam, 1) },
}).procedures(({ query }) => ({ account: { me: query(() => "me") } }));
`,
);
await writeFile(
  join(fixture, "src/routes/ext-plain/$id/page.ts"),
  `import { Component, inject } from "@angular/core";
import { inputProbe } from "@fixture/route-extension";
import { injectRoute } from "./route.generated.js";

@Component({
  template: \`
    <p id="ext-id">{{ route.params().id }}</p>
    <p id="ext-score">{{ route.search().score }}</p>
    <p id="ext-page">{{ route.search().page }}</p>
    <p id="ext-calls">{{ probe.calls }}</p>
  \`,
})
export default class ExtensionPlain {
  readonly route = injectRoute();
  readonly probe = inject(inputProbe);
}
`,
);
await writeFile(
  join(fixture, "src/barrier.ts"),
  `// Both concurrent requests must enter before either resolver finishes.
let entered = 0;
let release!: () => void;
const both = new Promise<void>((resolve) => {
  release = resolve;
});

export async function barrier(): Promise<void> {
  entered += 1;

  if (entered === 2) {
    release();
  }

  await Promise.race([
    both,
    new Promise((_, reject) => setTimeout(() => reject(new Error("barrier timed out")), 5000)),
  ]);
}
`,
);
await mkdir(join(fixture, "src/routes/ext-concurrent/$id"), { recursive: true });
await writeFile(
  join(fixture, "src/routes/ext-concurrent/$id/route.ts"),
  `import { numberParam } from "@loozo/angular-router";
import { defineRoute } from "@fixture/route-extension";
import { barrier } from "../../../barrier.js";

export default defineRoute("ext-concurrent/$id", { params: { id: numberParam } })
  .canMatch([({ request }) => request !== null])
  .canActivate([({ request }) => request !== null])
  .resolve({
    request: async ({ request }) => {
      await barrier();

      return request;
    },
  });
`,
);
await writeFile(
  join(fixture, "src/routes/ext-concurrent/$id/page.ts"),
  `import { Component, inject } from "@angular/core";
import { inputProbe } from "@fixture/route-extension";
import { injectRoute } from "./route.generated.js";

@Component({
  template: \`
    <p id="ext-request">{{ route.data().request }}</p>
    <p id="ext-calls">{{ probe.calls }}</p>
  \`,
})
export default class ExtensionConcurrent {
  readonly route = injectRoute();
  readonly probe = inject(inputProbe);
}
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

// The test route extension, installed as a published package: emitted JS and declarations.
await emitPackage(fixture, "@fixture/route-extension", { "index.ts": await extensionSource() });

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

    if (
      input.endsWith("src/routes/teams/$teamId/items/$id/page.ts") &&
      output.entryPoint !== "src/main.ts"
    ) {
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
      input.endsWith("src/routes/teams/$teamId/items/$id/page.ts"),
      false,
      "page must remain genuinely lazy",
    );
    // teams/$teamId's children load with its children table, outside the initial closure.
    assert.doesNotMatch(input, /src\/routes\/teams\/\$teamId\/items\/.*route\.generated\.ts$/);
    assert.doesNotMatch(input, /children\.generated\.ts$/);
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
    if (dynamic && input.endsWith("src/routes/teams/$teamId/items/$id/page.ts")) {
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

const teamTable = Object.entries(stats.outputs).find(
  ([file, output]) =>
    !file.includes("/server/") &&
    output.entryPoint?.endsWith("src/routes/teams/$teamId/children.generated.ts"),
)?.[0];

assert.ok(teamTable, "teams/$teamId's children table is its own lazy output");
assert.ok(reachableWithDynamic.has(teamTable), "and dynamically reachable from main");
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

// A document's base URL and its modulepreload hints resolved against it, as the browser does.
function documentBase(html, documentUrl) {
  return new URL(html.match(/<base href="([^"]*)"/)?.[1] ?? "", documentUrl);
}

function preloadHints(html, documentUrl) {
  const base = documentBase(html, documentUrl);

  return [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map(
    (match) => new URL(match[1], base).href,
  );
}

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

function inspectHtml(
  body,
  ids = [
    "parsed-team",
    "parsed-id",
    "parsed-score",
    "resolved",
    "handle-id",
    "handle-score",
    "handle-page",
    "missing",
    "active-route",
  ],
) {
  const window = new Window();
  const template = window.document.createElement("template");

  template.innerHTML = body;

  const document = template.content;
  const result = {};

  for (const id of ids) {
    result[id] = document.querySelector("#" + id)?.textContent ?? null;
  }

  window.close();

  return result;
}

const seedKey = "@loozo/angular-router:active-route";

// The active-route seed in a server-rendered document's TransferState script, if any.
function transferredSeed(body) {
  const match = body.match(/<script id="ng-state"[^>]*>([\s\S]*?)<\/script>/);

  assert.ok(match, "The document carries TransferState");

  return JSON.parse(match[1])[seedKey];
}

// The seed of an item page: the team record, then the item record with its resolver data,
// each with the primary segments it consumed, after `offset` segments of native wrappers.
function itemSeed(url, teamId, id, score, offset = 0) {
  return {
    url,
    routes: [
      { id: "src/routes/teams/$teamId/route.ts", from: offset, to: offset + 2 },
      {
        id: "src/routes/teams/$teamId/items/$id/route.ts",
        from: offset + 2,
        to: offset + 4,
        data: { item: { teamId, id, score, text: `team=${teamId};item=${id};score=${score}` } },
      },
    ],
  };
}

const proofSeed = itemSeed("/teams/7/items/7;teamId=999?score=42", 7, 7, 42);

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

  // A redirect two declarations below the group root, hoisted with a lazy copy.
  const legacy = await requestSsr(origin + "/teams/7/items/7/legacy?score=1");

  await save("http-legacy.json", legacy);
  assert.equal(legacy.status, 302);
  assert.equal(legacy.headers.location, "/handle-only/7");

  // The ordinary redirect beats the ordinary catchall page, which matches its control URL.
  const ordering = {
    redirect: await requestSsr(origin + "/order/old/5"),
    control: await requestSsr(origin + "/order/zzz"),
  };

  await save("http-ordering.json", ordering);
  assert.equal(ordering.redirect.status, 302);
  assert.equal(ordering.redirect.headers.location, "/handle-only/5");
  assert.equal(ordering.control.status, 200);
  assert.match(ordering.control.body, /<p id="order-rest">order rest<\/p>/);

  // The server renders through the group and hints teams/$teamId's children table.
  const groupedUrl = origin + "/teams/7/items/7?score=42";
  const grouped = await requestSsr(groupedUrl);

  assert.equal(grouped.status, 200);
  assert.equal(inspectHtml(grouped.body).resolved, "team=7;item=7;score=42");

  const hints = preloadHints(grouped.body, groupedUrl);
  // Its stats path is relative to the browser output, which the server serves at the base.
  const tableHint = new URL(teamTable, documentBase(grouped.body, groupedUrl)).href;

  await save("http-preload-hints.json", { teamTable, tableHint, hints });
  assert.ok(hints.includes(tableHint), "The server hints teams/$teamId's children table");

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
    "handle-page": null,
    missing: null,
    "active-route": "team 7 item 7",
  });
  assert.deepEqual(values[1], {
    "parsed-team": "8",
    "parsed-id": "8",
    "parsed-score": "43",
    resolved: "team=8;item=8;score=43",
    "handle-id": null,
    "handle-score": null,
    "handle-page": null,
    missing: null,
    "active-route": "team 8 item 8",
  });
  assert.doesNotMatch(responses[0].body, /team=999;|item=888;/);
  assert.notEqual(values[0].resolved, values[1].resolved);

  // Each concurrent request sends its own committed chain; the URL keeps matrix params.
  const concurrentSeeds = [];

  for (const response of responses) {
    concurrentSeeds.push(transferredSeed(response.body));
  }

  assert.deepEqual(
    concurrentSeeds[0],
    itemSeed("/teams/7/items/7;teamId=999;id=888?score=42", 7, 7, 42),
  );
  assert.deepEqual(concurrentSeeds[1], itemSeed("/teams/8/items/8?score=43", 8, 8, 43));

  // N1: the browser proof's URL. N2: a native wrapper consumes two segments before the team.
  const seeded = await requestSsr(origin + "/teams/7/items/7;teamId=999?score=42");
  const wrapped = await requestSsr(origin + "/wrapped/acme/teams/7/items/7?score=42");

  assert.equal(seeded.status, 200);
  assert.deepEqual(transferredSeed(seeded.body), proofSeed);
  assert.equal(wrapped.status, 200);
  assert.equal(inspectHtml(wrapped.body)["active-route"], "team 7 item 7");
  assert.deepEqual(
    transferredSeed(wrapped.body),
    itemSeed("/wrapped/acme/teams/7/items/7?score=42", 7, 7, 42, 2),
  );

  // N3: one resolver value JSON can't carry unchanged drops the page's seed, and the page
  // still renders; a value reached twice through different paths isn't a cycle.
  const valueSeeds = {};

  for (const kind of ["date", "bigint", "cycle", "array", "shared"]) {
    const response = await requestSsr(origin + "/values/" + kind);

    await writeFile(join(evidence, `http-values-${kind}.html`), response.body);
    assert.equal(response.status, 200, kind);
    assert.equal(inspectHtml(response.body, ["value-kind"])["value-kind"], kind);
    valueSeeds[kind] = transferredSeed(response.body) ?? null;
  }

  assert.equal(valueSeeds.date, null, "A Date gives no seed");
  assert.equal(valueSeeds.bigint, null, "A BigInt gives no seed");
  assert.equal(valueSeeds.cycle, null, "A cycle gives no seed");
  assert.equal(valueSeeds.array, null, "An array with an extra key gives no seed");
  assert.deepEqual(valueSeeds.shared, {
    url: "/values/shared",
    routes: [
      {
        id: "src/routes/values/$kind/route.ts",
        from: 0,
        to: 2,
        data: { value: { a: { x: 1 }, b: { x: 1 } } },
      },
    ],
  });

  // N4: a declared title travels; a record without resolvers sends no data.
  const titled = await requestSsr(origin + "/titled/1");

  assert.equal(titled.status, 200);
  assert.deepEqual(transferredSeed(titled.body), {
    url: "/titled/1",
    routes: [{ id: "src/routes/titled/$id/route.ts", from: 0, to: 2, title: "Titled 1" }],
  });
  await save("http-seeds.json", {
    concurrent: concurrentSeeds,
    seeded: transferredSeed(seeded.body),
    wrapped: transferredSeed(wrapped.body),
    values: valueSeeds,
    titled: transferredSeed(titled.body),
  });

  // Handle signals render server-side without any resolver, including a search fallback.
  const handleOnlyCases = {
    "/handle-only/31?score=47": { id: "31", score: "47", page: "1" },
    "/handle-only/32?score=x&page=3": { id: "32", score: "", page: "3" },
    "/handle-only/33?page=x": { id: "33", score: "", page: "1" },
    "/handle-only/34?page=2&page=5": { id: "34", score: "", page: "1" },
  };
  const handleValues = {};

  for (const [url, expected] of Object.entries(handleOnlyCases)) {
    const handleOnly = await requestSsr(origin + url);
    const rendered = inspectHtml(handleOnly.body);

    handleValues[url] = rendered;
    await writeFile(join(evidence, `http-handle-only-${expected.id}.html`), handleOnly.body);
    assert.equal(handleOnly.status, 200, url);
    assert.equal(rendered["handle-id"], expected.id, url);
    assert.equal(rendered["handle-score"], expected.score, url);
    assert.equal(rendered["handle-page"], expected.page, url);
    assert.equal(rendered.resolved, null, url);
    assert.equal(rendered.missing, null, url);
    assert.equal(rendered["active-route"], "other", url);
  }

  await save("http-handle-only.json", handleValues);

  // Invalid path params don't match, so the server renders the catchall instead of failing:
  // the team param, the item param and the handle-only param.
  const invalidValues = {};

  for (const url of ["/teams/x/items/7", "/teams/7/items/x?score=42", "/handle-only/x"]) {
    const response = await requestSsr(origin + url);
    const values = inspectHtml(response.body);

    assert.equal(response.status, 200, url);
    assert.equal(values.missing, "Not found", url);
    assert.equal(values.resolved, null, url);
    assert.equal(values["handle-id"], null, url);
    assert.equal(values["active-route"], "other", url);
    invalidValues[url] = { status: response.status, values };
  }
  // An extension route with no authored callback: handles parse params and search, and the
  // extension's input() never runs (no injection-context error either).
  const extensionPlain = await requestSsr(origin + "/ext-plain/41?score=47&page=x");
  const plainValues = inspectHtml(extensionPlain.body, [
    "ext-id",
    "ext-score",
    "ext-page",
    "ext-calls",
  ]);

  await writeFile(join(evidence, "http-ext-plain.html"), extensionPlain.body);
  assert.equal(extensionPlain.status, 200);
  assert.deepEqual(plainValues, {
    "ext-id": "41",
    "ext-score": "47",
    "ext-page": "1",
    "ext-calls": "0",
  });

  // Two overlapping requests meet at an asynchronous resolver barrier; each request's
  // callbacks see its own REQUEST, and input() runs once per phase per request.
  const concurrent = await Promise.all([
    requestSsr(origin + "/ext-concurrent/1?who=A"),
    requestSsr(origin + "/ext-concurrent/2?who=B"),
  ]);
  const concurrentExtension = [];

  for (const [index, response] of concurrent.entries()) {
    await writeFile(join(evidence, `http-ext-concurrent-${index}.html`), response.body);
    assert.equal(response.status, 200);
    concurrentExtension.push(inspectHtml(response.body, ["ext-request", "ext-calls"]));
  }

  assert.match(concurrentExtension[0]["ext-request"], /\/ext-concurrent\/1\?who=A$/);
  assert.match(concurrentExtension[1]["ext-request"], /\/ext-concurrent\/2\?who=B$/);
  assert.equal(concurrentExtension[0]["ext-calls"], "2");
  assert.equal(concurrentExtension[1]["ext-calls"], "2");
  assert.doesNotMatch(nodeStdout + nodeStderr, /NG0203/);

  await save("http-observations.json", {
    alias: { status: alias.status, location: location.href },
    concurrentValues: values,
    handleOnly: handleValues,
    invalidValues,
    extension: { plain: plainValues, concurrent: concurrentExtension },
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
    headless: true,
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext({ recordVideo: { dir: join(evidence, "videos") } });
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

  // Every text the shell's active route shows from the server HTML through hydration. With
  // provideActiveRouteHydration(), the client's reader reads the server's route from its first
  // read, so the shell never shows its fallback, and keeps the same text node.
  const activeBefore = await page.evaluate(() => {
    const node = document.querySelector("#active-route");

    window.proofActiveNode = node;
    window.proofActiveText = node.firstChild;
    window.proofActiveTexts = [node.textContent];
    new MutationObserver(() => {
      const text = document.querySelector("#active-route")?.textContent ?? null;

      if (window.proofActiveTexts.at(-1) !== text) {
        window.proofActiveTexts.push(text);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });

    return node.textContent;
  });

  assert.equal(activeBefore, "team 7 item 7");

  const devSeed = await page.evaluate(
    (key) => JSON.parse(document.querySelector("script#ng-state").textContent)[key],
    seedKey,
  );

  assert.deepEqual(devSeed, proofSeed);
  await page.screenshot({ path: join(evidence, "seed-before-scripts.png") });
  allowScripts();
  await page.waitForFunction(() => document.documentElement.dataset.proofStable === "true");

  // Hydration depth: the client's initial navigation resolves teams/$teamId's children table,
  // fetched once (a preloaded output is reused), before activation and stability.
  const devHints = preloadHints(before.html, page.url());
  const scriptUrls = [
    ...new Set(
      requests.filter((entry) => entry.resourceType === "script").map((entry) => entry.url),
    ),
  ];
  const tableUrls = [];

  for (const url of scriptUrls) {
    if ((await (await fetch(url)).text()).includes('path: "items/:id"')) {
      tableUrls.push(url);
    }
  }

  const timeline = await page.evaluate(() => window.proofTimeline);
  const configs = timeline.filter((entry) => entry.event === "config");
  const activations = timeline.filter((entry) => entry.event === "activation");
  const stable = timeline.find((entry) => entry.event === "stable");

  await save("browser-hydration-depth.json", { devHints, scriptUrls, tableUrls, timeline });
  assert.equal(tableUrls.length, 1, "One served output holds the children table");
  assert.ok(devHints.includes(tableUrls[0]), "The server hints the children table");
  assert.equal(
    requests.filter((entry) => entry.url === tableUrls[0]).length,
    1,
    "The children table is fetched exactly once",
  );
  // Angular reports a loaded component the same way; teams/$teamId has no page, so its event is
  // its children table's. No order between the table and the page is asserted.
  const table = configs.filter((entry) => entry.path === "teams/:teamId");

  assert.equal(table.length, 1, "teams/$teamId's children load once");
  assert.ok(activations.length > 0 && stable);
  assert.ok(table[0].at < activations[0].at, "Configuration resolves before activation");
  assert.ok(activations.at(-1).at <= stable.at, "and activation before stability");

  const activeHydrated = await page.evaluate(() => {
    const node = document.querySelector("#active-route");

    return {
      retained: node === window.proofActiveNode && node.firstChild === window.proofActiveText,
      text: node.textContent,
      texts: window.proofActiveTexts,
    };
  });

  assert.deepEqual(activeHydrated, {
    retained: true,
    text: "team 7 item 7",
    texts: ["team 7 item 7"],
  });

  // The first read is the seeded item before any navigation started, with the full handle;
  // the commit hands the same handles over, to the reactive and the never-read reader alike.
  const seedHandover = await page.evaluate(() => ({
    start: window.proofStart,
    firstLink: window.proofFirstLink,
    firstData: window.proofFirstData,
    firstIsActive: window.proofFirst === window.proofApp.active(),
    firstTeamIsActive: window.proofFirst?.chain[0] === window.proofApp.active().chain[0],
    quietFirstIsQuiet: window.proofQuietFirst === window.proofApp.quiet(),
  }));

  assert.deepEqual(seedHandover, {
    start: { navigated: false, navigating: false },
    firstLink: "/teams/7/items/8?score=43",
    firstData: proofSeed.routes[1].data,
    firstIsActive: true,
    firstTeamIsActive: true,
    quietFirstIsQuiet: true,
  });
  await page.screenshot({ path: join(evidence, "seed-hydrated.png") });

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

  assert.equal(await page.locator("#active-route").textContent(), "team 7 item 8");
  assert.equal(
    await page.evaluate(() => window.proofFirst === window.proofApp.active()),
    true,
    "The adopted handle stays the active route across the alias navigation",
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
  assert.equal(
    consoleMessages.some((message) => message.text.includes("active route not seeded")),
    false,
  );
  await save("browser-observations.json", {
    activeHydrated,
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

  const videos = { main: await page.video()?.path() };
  const cases = {};
  const proofPath = "/teams/7/items/7;teamId=999?score=42";

  // One fresh page of the proof URL plus `markers`: scripts wait until the shell's history is
  // observed and `prepare` ran; with `hold`, the children table's response waits for `release`.
  async function visit(name, markers, { hold = false, prepare } = {}) {
    const visitPage = await context.newPage();
    const visitErrors = [];
    const warnings = [];
    const visitRequests = [];
    let releaseScripts;
    let releaseTable;
    const scriptsReleased = new Promise((resolve) => {
      releaseScripts = resolve;
    });
    const tableReleased = new Promise((resolve) => {
      releaseTable = resolve;
    });

    videos[name] = await visitPage.video()?.path();
    visitPage.on("pageerror", (error) => visitErrors.push(error.message));
    visitPage.on("console", (message) => {
      if (message.type() === "error") {
        visitErrors.push(message.text());
      } else if (message.type() === "warning" && message.text().includes("@loozo/angular-router")) {
        warnings.push(message.text());
      }
    });
    visitPage.on("request", (request) => visitRequests.push(request.url()));
    await visitPage.route("**/*", async (route) => {
      const request = route.request();

      if (new URL(request.url()).origin !== baseUrl) {
        await route.abort();

        return;
      }

      if (request.resourceType() !== "script") {
        await route.continue();

        return;
      }

      await scriptsReleased;

      if (!hold) {
        await route.continue();

        return;
      }

      const response = await route.fetch();
      const body = await response.text();

      if (body.includes('path: "items/:id"')) {
        await tableReleased;
      }

      await route.fulfill({ response, body });
    });
    await visitPage.goto(baseUrl + proofPath + markers, { waitUntil: "commit" });
    await visitPage.waitForSelector("script#ng-state", { state: "attached" });
    await visitPage.evaluate(() => {
      window.proofActiveTexts = [document.querySelector("#active-route").textContent];
      new MutationObserver(() => {
        const text = document.querySelector("#active-route")?.textContent ?? null;

        if (window.proofActiveTexts.at(-1) !== text) {
          window.proofActiveTexts.push(text);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });

    if (prepare) {
      await prepare(visitPage);
    }

    releaseScripts();

    const stable = () =>
      visitPage.waitForFunction(() => document.documentElement.dataset.proofStable === "true");
    const observe = () =>
      visitPage.evaluate(() => {
        const terminal = new Set([
          "NavigationEnd",
          "NavigationCancel",
          "NavigationError",
          "NavigationSkipped",
        ]);

        return {
          texts: window.proofActiveTexts,
          text: document.querySelector("#active-route")?.textContent ?? null,
          firstSeeded: window.proofFirst !== undefined,
          success: window.proofApp.router.lastSuccessfulNavigation() !== null,
          terminal: window.proofEvents.filter((event) => terminal.has(event.type)),
          address: location.pathname + location.search,
        };
      });
    const finish = async (extra = {}) => {
      const observed = await observe();

      await visitPage.screenshot({ path: join(evidence, `seed-${name}.png`) });
      cases[name] = { ...observed, ...extra, errors: visitErrors, warnings };
      await visitPage.close();

      return cases[name];
    };

    return {
      page: visitPage,
      errors: visitErrors,
      warnings,
      requests: visitRequests,
      releaseTable,
      stable,
      finish,
    };
  }

  const notSeeded = (reason) => `@loozo/angular-router: active route not seeded (${reason})`;

  // B2: the client's item guard diverges from the server's.
  const rejected = await visit("reject", "&reject=1");

  await rejected.stable();

  const rejectedBefore = await rejected.page.evaluate(() => ({
    texts: [...window.proofActiveTexts],
    success: window.proofApp.router.lastSuccessfulNavigation() !== null,
  }));

  assert.deepEqual(rejectedBefore, { texts: ["team 7 item 7", "none"], success: false });
  await rejected.page.screenshot({ path: join(evidence, "seed-reject-rejected.png") });
  // A later success at the seeded destination: neither reader, the quiet one unread since the
  // rejection, adopts its retired seeded handles.
  await rejected.page.evaluate(() =>
    window.proofApp.router.navigateByUrl("/teams/7/items/7;teamId=999?score=44"),
  );
  await rejected.page.waitForFunction(
    () => document.querySelector("#active-route")?.textContent === "team 7 item 7",
  );

  const rejectedLater = await rejected.page.evaluate(() => ({
    quietReplaced: window.proofQuietFirst !== window.proofApp.quiet(),
    quietFrozen: window.proofQuietFirst.search().score,
    quietLive: window.proofApp.quiet().search().score,
    activeReplaced: window.proofFirst !== window.proofApp.active(),
    activeFrozen: window.proofFirst.search().score,
    activeLive: window.proofApp.active().search().score,
  }));

  assert.deepEqual(rejectedLater, {
    quietReplaced: true,
    quietFrozen: 42,
    quietLive: 44,
    activeReplaced: true,
    activeFrozen: 42,
    activeLive: 44,
  });

  const rejectCase = await rejected.finish({ before: rejectedBefore, later: rejectedLater });

  assert.deepEqual(rejectCase.errors, []);
  assert.deepEqual(rejectCase.warnings, []);

  const redirected = await visit("redirect", "&redirect=1");

  await redirected.stable();

  const redirectIdentity = await redirected.page.evaluate(() => ({
    firstIsActive: window.proofFirst === window.proofApp.active(),
    id: window.proofApp.active().params().id,
  }));
  const redirectCase = await redirected.finish({ identity: redirectIdentity });

  assert.deepEqual(redirectCase.texts, ["team 7 item 7", "team 7 item 8"]);
  assert.deepEqual(redirectIdentity, { firstIsActive: true, id: 8 });
  assert.equal(redirectCase.success, true);
  assert.deepEqual(redirectCase.errors, []);

  // A NavigationEnd listener registered before the provider navigates again: the nested same-URL
  // skip reaches the provider first, yet the seed is handed over to the commit that succeeded.
  const reentered = await visit("reenter", "&reenter=1");

  await reentered.stable();

  const reenterIdentity = await reentered.page.evaluate(() => ({
    firstIsActive: window.proofFirst === window.proofApp.active(),
    quietFirstIsQuiet: window.proofQuietFirst === window.proofApp.quiet(),
  }));
  const reenterCase = await reentered.finish({ identity: reenterIdentity });

  assert.deepEqual(
    reenterCase.terminal.map(({ type, code }) => ({ type, code })),
    [
      { type: "NavigationSkipped", code: 0 },
      { type: "NavigationEnd", code: undefined },
    ],
  );
  assert.deepEqual(reenterCase.texts, ["team 7 item 7"]);
  assert.equal(reenterCase.firstSeeded, true);
  assert.equal(reenterCase.success, true);
  assert.deepEqual(reenterIdentity, { firstIsActive: true, quietFirstIsQuiet: true });
  assert.deepEqual(reenterCase.errors, []);
  assert.deepEqual(reenterCase.warnings, []);

  // The throwing guard: Angular reports the initial navigation's error through ErrorHandler.
  const failed = await visit("fail", "&fail=1");

  await failed.stable();

  const failCase = await failed.finish();

  assert.deepEqual(failCase.texts, ["team 7 item 7", "none"]);
  assert.equal(failCase.success, false);
  assert.ok(
    failCase.terminal.some(
      (event) => event.type === "NavigationError" && event.error === "proof-seed-guard-failure",
    ),
    JSON.stringify(failCase.terminal),
  );
  assert.ok(failCase.errors.length > 0);

  for (const error of failCase.errors) {
    assert.match(error, /proof-seed-guard-failure/);
  }

  // B3: outcomes during the provider's wait for the children table.
  const raceRejected = await visit("race-reject", "&race=reject", { hold: true });

  await raceRejected.page.waitForFunction(() =>
    window.proofEvents?.some((event) => event.type === "NavigationCancel" && event.code === 3),
  );
  raceRejected.releaseTable();
  await raceRejected.stable();

  const raceRejectCase = await raceRejected.finish();

  assert.deepEqual(raceRejectCase.texts, ["team 7 item 7", "none"]);
  assert.equal(raceRejectCase.firstSeeded, false);
  assert.equal(raceRejectCase.success, false);
  assert.deepEqual(raceRejectCase.errors, []);
  assert.deepEqual(raceRejectCase.warnings, []);

  const raceUrl = await visit("race-url", "&race=url", { hold: true });

  await raceUrl.page.waitForFunction(() => window.proofWaiting === true);
  await raceUrl.page.evaluate(() =>
    history.replaceState(history.state, "", "/teams/7/items/7;teamId=999?score=43&race=url"),
  );
  raceUrl.releaseTable();
  await raceUrl.stable();

  const raceUrlScore = await raceUrl.page.evaluate(() => window.proofApp.active()?.search().score);
  const raceUrlCase = await raceUrl.finish({ score: raceUrlScore });

  assert.deepEqual(raceUrlCase.texts, ["team 7 item 7", "none", "team 7 item 7"]);
  assert.equal(raceUrlCase.firstSeeded, false);
  assert.equal(raceUrlScore, 43);
  assert.deepEqual(raceUrlCase.warnings, [notSeeded("URL changed")]);
  assert.deepEqual(raceUrlCase.errors, []);

  // An app initializer listed before the provider requests a navigation Angular skips
  // synchronously: observation started earlier, in the provider's environment initializer.
  const raceSkipped = await visit("race-skip", "&race=skip");

  await raceSkipped.stable();

  const raceSkipCase = await raceSkipped.finish();

  assert.deepEqual(raceSkipCase.terminal, [
    { type: "NavigationSkipped", id: raceSkipCase.terminal[0]?.id, code: 1 },
  ]);
  assert.deepEqual(raceSkipCase.texts, ["team 7 item 7", "none"]);
  assert.equal(raceSkipCase.firstSeeded, false);
  assert.equal(raceSkipCase.success, false);
  assert.equal(raceSkipCase.address, proofPath + "&race=skip");
  assert.deepEqual(raceSkipCase.warnings, []);
  assert.deepEqual(raceSkipCase.errors, []);

  // B4: the client's team canMatch refuses after the seed loaded the server's tables.
  const refused = await visit("refuse", "&refuse=1");

  await refused.stable();

  const refusedProbe = await refused.page.evaluate(() => ({
    itemCopyEvaluated: globalThis.proofItemCopyEvaluated === true,
    teamConfigs: window.proofTimeline.filter(
      (entry) => entry.event === "config" && entry.path === "teams/:teamId",
    ).length,
  }));
  const refusedTableRequests = refused.requests.filter((url) => url === tableUrls[0]).length;
  const refuseCase = await refused.finish({ ...refusedProbe, tableRequests: refusedTableRequests });

  assert.deepEqual(refuseCase.texts, ["team 7 item 7", "other"]);
  assert.deepEqual(refusedProbe, { itemCopyEvaluated: true, teamConfigs: 0 });
  assert.equal(refusedTableRequests, 1);
  assert.deepEqual(refuseCase.errors, []);

  // B5: seeds the browser can't use fall back to the undefined state until the commit.
  async function editSeed(target, edit) {
    await target.evaluate(
      ({ key, edit }) => {
        const script = document.querySelector("script#ng-state");
        const state = JSON.parse(script.textContent);

        if (edit === "unknown") {
          state[key].routes[1].id = "src/routes/unknown/route.ts";
        } else if (edit === "range") {
          state[key].routes[1].to = 99;
        } else {
          delete state[key];
        }

        script.textContent = JSON.stringify(state);
      },
      { key: seedKey, edit },
    );
  }

  const fallbacks = {
    unknown: {
      prepare: (target) => editSeed(target, "unknown"),
      warnings: [notSeeded("unknown route src/routes/unknown/route.ts")],
    },
    range: {
      prepare: (target) => editSeed(target, "range"),
      warnings: [notSeeded("invalid segment range")],
    },
    missing: { prepare: (target) => editSeed(target, "missing"), warnings: [] },
    replaced: {
      prepare: (target) =>
        target.evaluate(() =>
          history.replaceState(history.state, "", "/teams/7/items/7;teamId=999?score=43"),
        ),
      warnings: [notSeeded("URL changed")],
    },
  };

  for (const [name, fallback] of Object.entries(fallbacks)) {
    const visited = await visit("fallback-" + name, "", { prepare: fallback.prepare });

    await visited.stable();

    const fallbackCase = await visited.finish();

    assert.deepEqual(fallbackCase.texts, ["team 7 item 7", "none", "team 7 item 7"], name);
    assert.equal(fallbackCase.firstSeeded, false, name);
    assert.equal(fallbackCase.text, "team 7 item 7", name);
    assert.deepEqual(fallbackCase.warnings, fallback.warnings, name);
    assert.deepEqual(fallbackCase.errors, [], name);
  }

  await save("seed-handover.json", { main: seedHandover, devSeed, cases, videos });
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
  "Native SSR HTTP302/handle-signals/search-fallback/matrix/concurrency + exact-Node hydration/SPA/query/lazy browser closure proof passed",
);
