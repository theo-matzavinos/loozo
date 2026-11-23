// A browser app with remembered search keys (SPEC §7 "Remembered search keys"), shared by
// tests/navigation.mjs (restore placement, guards, history, chains) and tests/lifecycle.mjs
// (the restore hook, storage adapters, provider and commit rules). Its storage, guards,
// resolvers and error handler record every call on `window.remember`; a boot-time
// `window.storageKind` picks the provider: the recording adapter (default), "local",
// "session" or "none", and `window.urlUpdateStrategy` Angular's URL update strategy.
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");

const proof = `import { inject, type EnvironmentProviders, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { EventType, RedirectCommand, Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { EMPTY } from 'rxjs';
import type { SearchStorage } from '@loozo/angular-router';

export class MissingResource extends Error {}

export const ownerSymbol = Symbol('owner symbol');

/** Everything the proof records, read and reset by the test through window.remember. */
export const proof: any = ((window as any).remember ??= {
  ops: [],
  memory: new Map<string, string>(),
  pending: new Set<string>(),
  controls: {},
  waits: new Map<string, () => void>(),
  calls: [],
  events: [],
  handled: [],
  views: [],
  storageMode: 'ok',
});

function op(kind: string, id: string, text?: string) {
  const entry: any = { op: kind, id, pending: [...proof.pending] };

  if (text !== undefined) {
    entry.text = text;
  }

  proof.ops.push(entry);
}

/** The recording adapter: an in-memory map that logs each operation with the pending guards. */
export function proofStorage(): SearchStorage {
  return {
    read(id) {
      op('read', id);

      if (proof.storageMode === 'throw-read') {
        throw new Error('storage read failed');
      }

      return proof.memory.get(id);
    },
    write(id, text) {
      op('write', id, text);
      proof.memory.set(id, text);
    },
    forget(id) {
      op('forget', id);
      proof.memory.delete(id);
    },
  };
}

// A control set to 'pending' holds once, until the test releases it.
async function hold(label: string): Promise<void> {
  delete proof.controls[label];
  await new Promise<void>((done) => proof.waits.set(label, done));
}

export function guard(label: string) {
  return async (_inputs: unknown, snapshot: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    const router = inject(Router);
    let decision = proof.controls[label] ?? 'true';

    // The ancestor guards every page; a row's decision applies to the orders entry only.
    if (label === 'ancestor' && !state.url.startsWith('/orders')) {
      decision = 'true';
    }

    // A 'branch-' decision applies to the detail outlet's record only; others accept.
    if (decision.startsWith('branch-')) {
      decision = snapshot.outlet === 'detail' ? decision.slice('branch-'.length) : 'true';
    }

    proof.calls.push(['guard:' + label, state.url, snapshot.outlet]);
    proof.pending.add(label);

    try {
      if (decision === 'pending') {
        await hold(label);
      } else {
        await new Promise((done) => setTimeout(done, 15));
      }
    } finally {
      proof.pending.delete(label);
    }

    if (decision === 'false') {
      return false;
    }

    if (decision === 'redirect') {
      return new RedirectCommand(router.parseUrl('/outside?guard=redirect'));
    }

    if (decision === 'error') {
      throw new Error('guard ' + label);
    }

    if (decision === 'requires-key') {
      return snapshot.queryParamMap.has('pageSize');
    }

    // Sends the restored attempt back to the page it came from, which Angular skips.
    if (decision === 'home-when-restored' && snapshot.queryParamMap.has('pageSize')) {
      return new RedirectCommand(router.parseUrl('/outside'));
    }

    return true;
  };
}

export function resolver(label: string) {
  return (_inputs: unknown, _snapshot: ActivatedRouteSnapshot, state: RouterStateSnapshot): any => {
    const control = proof.controls['resolve:' + label];

    proof.calls.push(['resolve:' + label, state.url]);

    if (control === 'pending') {
      return hold('resolve:' + label).then(() => label);
    }

    if (control === 'empty') {
      return EMPTY;
    }

    return label;
  };
}

export function title(label: string) {
  return (_inputs: unknown, _snapshot: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    proof.calls.push(['title:' + label, state.url]);

    return label;
  };
}

// The ancestor's rerun policy, chosen per row: Angular's default for a route without params,
// 'always', a query change, or a predicate that skips the restored attempt.
export function ancestorPolicy(current: ActivatedRouteSnapshot, future: ActivatedRouteSnapshot): boolean {
  const policy = proof.controls.policy;

  if (policy === 'always') {
    return true;
  }

  if (policy === 'query') {
    return JSON.stringify(current.queryParams) !== JSON.stringify(future.queryParams);
  }

  if (policy === 'skip-restored') {
    return !future.queryParamMap.has('pageSize');
  }

  return false;
}

// Redirects to the other owner's bare URL while its own remembered key is present.
export function bounce(key: string, target: string) {
  return (_inputs: unknown, snapshot: ActivatedRouteSnapshot) => {
    proof.calls.push(['guard:' + key, snapshot.queryParamMap.get(key)]);

    if (snapshot.queryParamMap.has(key)) {
      return new RedirectCommand(inject(Router).parseUrl(target));
    }

    return true;
  };
}

export function refuse() {
  return false;
}

export function fail(): boolean {
  throw new Error('unrelated failure');
}

export function missingWhen(key: string, missing: number) {
  return (inputs: any, _snapshot: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    const value = key === 'id' ? inputs.params.id : inputs.search[key];

    proof.calls.push(['resolve:' + key, state.url]);

    if (value === missing) {
      throw new MissingResource(key + ' ' + value + ' is gone');
    }

    return value;
  };
}

/** Records router events, and navigates again from a NavigationEnd when a row asks. */
export function proofProviders(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideEnvironmentInitializer(() => {
      const router = inject(Router);

      router.events.subscribe((event: any) => {
        proof.events.push({ type: EventType[event.type], id: event.id, url: event.url, code: event.code });

        if (event.type === EventType.NavigationEnd && proof.reentrant !== undefined) {
          const target = proof.reentrant;

          proof.reentrant = undefined;
          void router.navigateByUrl(target);
        }
      });
    }),
  ]);
}
`;

// Route definitions import proof.ts, so the handler, which reads routes.generated.ts, lives here.
const errors = `import { inject } from '@angular/core';
import { NavigationError, RedirectCommand, Router } from '@angular/router';
import { currentSearchRestore } from '../generated/routes.generated.js';
import { MissingResource, proof } from './proof.js';

/** The router README's not-found recipe, without the server status. */
export function notFoundErrors(error: NavigationError): RedirectCommand | undefined {
  if (!(error.error instanceof MissingResource)) {
    return undefined;
  }

  const router = inject(Router);
  const restore = currentSearchRestore();
  const handled: any = { url: error.url, restore: restore?.originalUrl ?? null };

  proof.handled.push(handled);

  if (restore !== undefined) {
    const before = proof.ops.length;

    restore.forget();
    handled.forgot = proof.ops.slice(before);
    handled.after = currentSearchRestore() === undefined;
    proof.views.push(restore);

    return new RedirectCommand(router.parseUrl(restore.originalUrl), {
      state: router.currentNavigation()?.extras.state,
    });
  }

  return new RedirectCommand(router.parseUrl('/not-found'), { browserUrl: error.url });
}
`;

const page = (name) => `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { proof } from '${"../".repeat(name.split("/").length + 1)}proof.js';

@Component({ imports: [RouterOutlet], template: '<p id="${name.replace(/[^a-z0-9]+/gi, "-")}">${name}</p><router-outlet />' })
export default class Page {
  constructor() {
    (proof.constructed ??= []).push('${name}');
  }
}
`;

// Directory, then the route definition's default export; `proof` is the shared probe module.
const routes = [
  [
    "+shell",
    "defineRoute('', {}).canActivate([guard('ancestor')]).resolve({ ancestor: resolver('ancestor') }).title(title('ancestor')).runGuardsAndResolvers(ancestorPolicy)",
  ],
  ["+shell/outside", "defineRoute('outside', { parent })"],
  ["+shell/denied", "defineRoute('denied', { parent }).canActivate([refuse])"],
  ["+shell/broken", "defineRoute('broken', { parent }).canActivate([fail])"],
  [
    "+shell/orders",
    "defineRoute('orders', { parent, search: { pageSize: retained(remembered(withFallback(numberParam, 20), 'orders.pageSize')) } }).canActivate([guard('owner')]).canActivateChild([guard('child')]).resolve({ 0: resolver('owner:0'), first: resolver('owner:first'), __restore: resolver('owner:__restore'), [ownerSymbol]: resolver('owner:symbol') }).title(title('owner'))",
  ],
  [
    "+shell/orders/+index",
    "defineRoute('', { parent }).canActivate([guard('leaf')]).resolve({ leaf: resolver('leaf') }).title(title('leaf'))",
  ],
  [
    "+shell/orders/detail",
    "defineRoute('detail', { parent }).resolve({ detail: resolver('detail') })",
  ],
  ["+shell/orders/reject", "defineRoute('reject', { parent }).canMatch([() => false])"],
  [
    "+shell/orders/item",
    "defineRoute('item/$id', { parent, params: { id: numberParam }, outlet: 'detail' }).canActivate([guard('branch')]).resolve({ branch: resolver('branch') }).title(title('branch'))",
  ],
  [
    "+shell/a",
    "defineRoute('a', { parent, search: { av: remembered(numberParam, 'a') } }).canActivate([bounce('av', '/b')])",
  ],
  [
    "+shell/b",
    "defineRoute('b', { parent, search: { bv: remembered(numberParam, 'b') } }).canActivate([bounce('bv', '/a')])",
  ],
  [
    "+shell/+density",
    "defineRoute('', { parent, search: { density: remembered(stringParam, 'density') } })",
  ],
  [
    "+shell/+density/recover",
    "defineRoute('recover', { parent, search: { size: remembered(withFallback(numberParam, 20), 'recover.size') } }).resolve({ size: missingWhen('size', 99) })",
  ],
  [
    "+shell/+density/recover/$id",
    "defineRoute('$id', { parent, params: { id: numberParam } }).resolve({ item: missingWhen('id', 42) })",
  ],
  ["+shell/not-found", "defineRoute('not-found', { parent })"],
  // A key named like an inherited setter, scalar and array.
  [
    "+shell/proto",
    "defineRoute('proto', { parent, search: { ['__proto__']: remembered(stringParam, 'proto.scalar') } })",
  ],
  [
    "+shell/proto-list",
    "defineRoute('proto-list', { parent, search: { ['__proto__']: remembered(arrayParam(stringParam), 'proto.list') } })",
  ],
  // A sibling pathless group beside the +density owner: it owns /profile.
  ["+shell/+plain", "defineRoute('', { parent })"],
  ["+shell/+plain/profile", "defineRoute('profile', { parent })"],
  [
    "+shell/dup",
    "defineRoute('dup', { parent, search: { one: remembered(numberParam, 'dup.id') } })",
  ],
  [
    "+shell/dup/child",
    "defineRoute('child', { parent, search: { two: remembered(numberParam, 'dup.id') } })",
  ],
];

const shell = `import { Component, EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { currentSearchRestore } from '../generated/routes.generated.js';
import { proof } from './proof.js';

@Component({
  selector: 'proof-app',
  imports: [RouterOutlet, RouterLink],
  template: '<a id="orders-link" routerLink="/orders" [state]="{ entry: \\'link\\' }">Orders</a><router-outlet />',
})
export default class Shell {
  constructor() {
    const router = inject(Router);
    const injector = inject(EnvironmentInjector);

    proof.router = router;
    proof.restore = () => runInInjectionContext(injector, currentSearchRestore);
    proof.go = (url: string, extras?: object) =>
      router.navigateByUrl(url, extras).then(
        (result) => result,
        (error) => 'error: ' + error.message,
      );
  }
}
`;

const main = `import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withNavigationErrorHandler, withRouterConfig } from '@angular/router';
import Shell from './shell.js';
import { provideSearchStorage, routes } from '../generated/routes.generated.js';
import { notFoundErrors } from './errors.js';
import { proofProviders, proofStorage } from './proof.js';

const kind = (window as any).storageKind ?? 'proof';
const storage = [];

if (kind === 'proof') {
  storage.push(provideSearchStorage(proofStorage));
} else if (kind !== 'none') {
  storage.push(provideSearchStorage(kind));
}

const urlUpdateStrategy = (window as any).urlUpdateStrategy ?? 'deferred';

void bootstrapApplication(Shell, {
  providers: [
    provideRouter(routes, withNavigationErrorHandler(notFoundErrors), withRouterConfig({ urlUpdateStrategy })),
    proofProviders(),
    ...storage,
  ],
});
`;

/**
 * Writes the app into `<evidence>/remembered` from examples/angular-router, with its
 * dependencies linked from the router package. Build it with sibling-groups.mjs's buildFixture
 * and serve it with its staticServer.
 */
export async function rememberedFixture(evidence) {
  const directory = join(evidence, "remembered");

  await cp(join(repository, "examples/angular-router"), directory, {
    recursive: true,
    filter: (path) =>
      !/(?:^|\/)(?:node_modules|dist|\.angular|out-tsc|generated|routes|localize-proof|outlets-proof|ssr-proof)(?:\/|$)/.test(
        path.slice(join(repository, "examples/angular-router").length),
      ),
  });

  const configuration = JSON.parse(await readFile(join(directory, "angular.json"), "utf8"));

  // The definitions name their parents by hand.
  configuration.projects.proof.architect.build.options.autoDefineRoutes = false;
  await writeFile(join(directory, "angular.json"), JSON.stringify(configuration));

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

  await writeFile(join(directory, "src/proof.ts"), proof);
  await writeFile(join(directory, "src/errors.ts"), errors);
  await writeFile(join(directory, "src/shell.ts"), shell);
  await writeFile(join(directory, "src/main.ts"), main);

  for (const [route, expression] of routes) {
    const folder = join(directory, "src/routes", route);
    const depth = route.split("/").length + 1;
    const parent = route.includes("/") ? "import parent from '../definition.js';\n" : "";

    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, "definition.ts"),
      `import { arrayParam, defineRoute, numberParam, remembered, retained, stringParam, withFallback } from '@loozo/angular-router';
import { ancestorPolicy, bounce, fail, guard, missingWhen, ownerSymbol, refuse, resolver, title } from '${"../".repeat(depth)}proof.js';
${parent}
export default ${expression};
`,
    );
    await writeFile(join(folder, "page.ts"), page(route));
  }

  return directory;
}

/** Opens a fresh tab on `/outside` with the given boot-time globals and waits for the app. */
export async function openRemembered(browser, base, { storageKind, urlUpdateStrategy, init } = {}) {
  const context = await browser.newContext({ colorScheme: "dark" });
  const tab = await context.newPage();
  const errors = [];

  tab.on("pageerror", (error) => errors.push(String(error)));

  if (storageKind !== undefined) {
    await tab.addInitScript((kind) => {
      window.storageKind = kind;
    }, storageKind);
  }

  if (urlUpdateStrategy !== undefined) {
    await tab.addInitScript((strategy) => {
      window.urlUpdateStrategy = strategy;
    }, urlUpdateStrategy);
  }

  if (init !== undefined) {
    await tab.addInitScript(init);
  }

  await tab.goto(`${base}/outside`);
  await tab.waitForFunction(
    () => window.remember?.go !== undefined && window.remember.router.url === "/outside",
  );

  return { tab, errors, close: () => context.close() };
}

/**
 * Resets the recorded state, optionally from `/outside` first, and seeds storage.
 * Returns once the app is idle on that URL.
 */
export async function reset(tab, { memory = {}, from = "/outside", controls = {} } = {}) {
  await tab.evaluate(
    async ([start, seed, set]) => {
      const proof = window.remember;

      proof.controls = {};

      if (start !== null && proof.router.url !== start) {
        await proof.go(start);
      }

      proof.ops = [];
      proof.waits = new Map();
      proof.calls = [];
      proof.events = [];
      proof.handled = [];
      proof.constructed = [];
      proof.storageMode = "ok";
      proof.memory = new Map(Object.entries(seed));
      proof.controls = set;
    },
    [from, memory, controls],
  );
}

/** Storage operations as `op id[=text]` strings, and whether any ran with a guard pending. */
export function summary(ops) {
  const list = [];
  let duringGuard = false;

  for (const entry of ops) {
    let text = `${entry.op} ${entry.id}`;

    if (entry.text !== undefined) {
      text += `=${entry.text}`;
    }

    list.push(text);

    if (entry.pending.length > 0) {
      duringGuard = true;
    }
  }

  return { ops: list, duringGuard };
}
