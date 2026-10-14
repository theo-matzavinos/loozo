import assert from "node:assert/strict";
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");
const evidence = resolve(process.argv[2]);

await mkdir(evidence);

const fixture = join(evidence, "consumer");

await cp(join(repository, "examples/angular-router"), fixture, {
  recursive: true,
  filter: (path) =>
    !/(?:^|\/)(?:node_modules|dist|\.angular|generated)(?:\/|$)/.test(path) &&
    !path.endsWith("route.generated.ts"),
});

const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));

for (const name of new Set([
  ...Object.keys(metadata.dependencies),
  ...Object.keys(metadata.devDependencies),
  "@loozo/angular-router",
])) {
  const link = join(fixture, "node_modules", name);

  await mkdir(dirname(link), { recursive: true });

  let target = join(packageDirectory, "node_modules", name);

  if (name === "@loozo/angular-router") {
    target = packageDirectory;
  }

  await symlink(target, link, "dir");
}

const require = createRequire(join(packageDirectory, "package.json"));
const { Architect } = require("@angular-devkit/architect");
const { WorkspaceNodeModulesArchitectHost } = require("@angular-devkit/architect/node");
const nativeRequire = createRequire(require.resolve("@angular-devkit/architect"));
const core = nativeRequire("@angular-devkit/core");
const { NodeJsSyncHost } = nativeRequire("@angular-devkit/core/node");
const { chromium } = require("playwright");

async function write(name, value) {
  await mkdir(dirname(join(fixture, name)), { recursive: true });
  await writeFile(join(fixture, name), value);
}

await write(
  "src/probes.ts",
  `import { InjectionToken, inject } from '@angular/core';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

export const token = new InjectionToken<string>('route entry');
export const localSymbol = Symbol('local data');
export const opaque = { nested: { value: 'opaque identity' } };
export const calls: string[] = [];
export const inputs: any[] = [];
export const prototypeResults: number[] = [];
export const leaves: any[][] = [];
export const held = new Set<string>();
export const jobs = new Map<string, {
  resolve(value: number): void;
  reject(error: unknown): void;
}[]>();
let leave = true;

export function allowLeave(value: boolean) {
  leave = value;
}

export function canLeave(...args: any[]) {
  leaves.push(args);
  return leave;
}

export function codec(key: string) {
  return {
    parse: (raw: string): Promise<number> => {
      const label = key + ':' + raw;

      calls.push(label);

      if (held.has(label)) {
        return new Promise((resolve, reject) => {
          const list = jobs.get(label) ?? [];

          list.push({ resolve, reject });
          jobs.set(label, list);
        });
      }

      return new Promise((resolve, reject) => {
        setTimeout(() => {
          const value = Number(raw);

          if (Number.isFinite(value)) {
            resolve(value);
          } else {
            reject(new Error('bad number'));
          }
        }, 60);
      });
    },
    stringify: (value: number) => String(value),
  };
}

export function release(label: string, value: number) {
  for (const job of jobs.get(label) ?? []) {
    job.resolve(value);
  }

  jobs.delete(label);
  held.delete(label);
}

export function fail(label: string, error: unknown) {
  for (const job of jobs.get(label) ?? []) {
    job.reject(error);
  }

  jobs.delete(label);
  held.delete(label);
}

export function record(value: any): number {
  const entry = inject(token);

  if (entry !== 'item entry') {
    throw new Error('DI lost');
  }

  inputs.push(value);
  return value.params.id;
}

export function prototypeResult(value: any): number {
  const result = record(value);

  prototypeResults.push(result);
  return result;
}

export const ancestry: {
  inputs: any;
  child: ActivatedRouteSnapshot;
  state: RouterStateSnapshot;
  entry: string;
}[] = [];

export function parentGuard(
  value: any,
  child: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) {
  const entry = inject(token);

  ancestry.push({ inputs: value, child, state, entry });
  return true;
}

export let promiseConstructor: PromiseConstructor = Promise;
export let guardPromise: Promise<boolean> | undefined;
export let resolverPromise: Promise<number> | undefined;
export let finishGuard: (value: boolean) => void;
export let finishResolver: (value: number) => void;
export const promiseEntries: string[] = [];

export function usePromises(constructor: PromiseConstructor) {
  promiseConstructor = constructor;
  guardPromise = undefined;
  resolverPromise = undefined;
}

export function promiseGuard(): Promise<boolean> {
  promiseEntries.push(inject(token));
  guardPromise = new promiseConstructor<boolean>((resolve) => {
    finishGuard = resolve;
  });
  return guardPromise;
}

export function promiseResolver(): Promise<number> {
  promiseEntries.push(inject(token));
  resolverPromise = new promiseConstructor<number>((resolve) => {
    finishResolver = resolve;
  });
  return resolverPromise;
}
`,
);

const simplePage = `import { Component } from '@angular/core';

@Component({ template: '<p>native destination</p>' })
export default class Destination {}
`;

await write(
  "src/routes/plain/definition.ts",
  `import { defineRoute, optionalSearchParam } from '@loozo/angular-router';
import { codec, canLeave } from '../../probes.js';

export default defineRoute('plain/$id', {
  params: { id: codec('id') },
  search: { score: optionalSearchParam(codec('score')) },
  canDeactivate: [canLeave],
});
`,
);
await write(
  "src/routes/plain/page.ts",
  `import { Component, Injector, inject, runInInjectionContext } from '@angular/core';
import { injectRoute } from './route.generated.js';

@Component({ template: '<p id="plain">plain</p>' })
export default class Plain {
  readonly handle = injectRoute();
  readonly injector = inject(Injector);

  constructor() {
    (window as any).plain = this;
  }

  connect() {
    const scope = Injector.create({ parent: this.injector, providers: [] });
    const handle = runInInjectionContext(scope, injectRoute);

    return { handle, destroy: () => scope.destroy() };
  }
}
`,
);
await write(
  "src/routes/blocked/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';

export default defineRoute('blocked', {});
`,
);
await write("src/routes/blocked/page.ts", simplePage);
await write(
  "src/routes/team/definition.ts",
  `import { defineRoute, numberParam, optionalSearchParam } from '@loozo/angular-router';
import { codec } from '../../probes.js';

export default defineRoute('teams/$teamId', {
  params: { teamId: numberParam },
  search: { score: optionalSearchParam(codec('score')) },
});
`,
);
await write(
  "src/routes/item/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import team from '../team/definition.js';
import { codec, record, prototypeResult, token, localSymbol, opaque } from '../../probes.js';

export default defineRoute('items/$id', {
  parent: team,
  params: { id: codec('id') },
  providers: [{ provide: token, useValue: 'item entry' }],
  canActivate: [(value) => {
    record(value);
    return true;
  }],
  resolve: {
    item: record,
    [localSymbol]: record,
    ['__proto__']: prototypeResult,
    empty: () => undefined,
    opaque: () => opaque,
  },
  runGuardsAndResolvers: 'paramsOrQueryParamsChange',
});
`,
);
await write(
  "src/routes/item/page.ts",
  `import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { injectRoute } from './route.generated.js';

@Component({ template: '<p id="item">item</p>' })
export default class Item {
  readonly native = inject(ActivatedRoute);
  readonly handle = injectRoute();

  constructor() {
    (window as any).item = this;
  }
}
`,
);
await write(
  "src/routes/preserved/definition.ts",
  `import { defineRoute, numberParam } from '@loozo/angular-router';

export default defineRoute('preserved/$id', {
  params: { id: numberParam },
  search: {
    score: {
      parse: (raw: string): number => {
        throw new Error('preserved sync failure');
      },
      stringify: (value: number) => String(value),
    },
  },
});
`,
);
await write("src/routes/preserved/page.ts", simplePage);
await write(
  "src/routes/alias/definition.ts",
  `import { defineRoute, numberParam } from '@loozo/angular-router';
import target from '../preserved/definition.js';
import { codec } from '../../probes.js';

export default defineRoute('alias/$id', {
  params: { id: codec('alias') },
  search: { score: numberParam },
  redirect: {
    to: target,
    search: { mode: 'preserve' },
    fragment: { mode: 'drop' },
  },
});
`,
);

await write(
  "src/routes/acquire/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import { codec } from '../../probes.js';

export default defineRoute('acquire/$id', { params: { id: codec('acquire') } });
`,
);
await write(
  "src/routes/acquire/page.ts",
  `import { Component, Injector, inject, runInInjectionContext } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { injectRoute } from './route.generated.js';

@Component({ template: '<p id="acquire">independent handle acquisition</p>' })
export default class Acquire {
  readonly injector = inject(Injector);
  readonly native = inject(ActivatedRoute);

  constructor() {
    (window as any).acquire = this;
  }

  scope() {
    const injector = Injector.create({ parent: this.injector, providers: [] });

    return {
      injector,
      connect: () => runInInjectionContext(injector, injectRoute),
      destroy: () => injector.destroy(),
    };
  }
}
`,
);
await write(
  "src/routes/earlier/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';

export default defineRoute('duplicate/100', {});
`,
);
await write(
  "src/routes/declaring/definition.ts",
  `import { defineRoute, numberParam } from '@loozo/angular-router';
import earlier from '../earlier/definition.js';
import { parentGuard, token } from '../../probes.js';

export default defineRoute('teams/$teamId', {
  parent: earlier,
  params: { teamId: numberParam },
  providers: [{ provide: token, useValue: 'parent entry' }],
  canActivateChild: [parentGuard],
});
`,
);
await write(
  "src/routes/guarded/definition.ts",
  `import { defineRoute, numberParam } from '@loozo/angular-router';
import declaring from '../declaring/definition.js';

export default defineRoute('items/$childId', {
  parent: declaring,
  params: { childId: numberParam },
});
`,
);
await write("src/routes/guarded/page.ts", simplePage);
await write(
  "src/routes/promise-guard/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import { promiseGuard, token } from '../../probes.js';

export default defineRoute('promise-guard', {
  providers: [{ provide: token, useValue: 'promise entry' }],
  canActivate: [promiseGuard],
});
`,
);
await write("src/routes/promise-guard/page.ts", simplePage);
await write(
  "src/routes/promise-resolver/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import { promiseResolver, token } from '../../probes.js';

export default defineRoute('promise-resolver', {
  providers: [{ provide: token, useValue: 'promise entry' }],
  resolve: { answer: promiseResolver },
});
`,
);
await write(
  "src/routes/promise-resolver/page.ts",
  `import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { injectRoute } from './route.generated.js';

@Component({ template: '<p id="promise">native resolved number</p>' })
export default class Answer {
  readonly native = inject(ActivatedRoute);
  readonly handle = injectRoute();

  constructor() {
    (window as any).answer = this;
  }
}
`,
);

await write(
  "src/type-proof.ts",
  `import { injectRoute } from './routes/item/route.generated.js';
import { localSymbol } from './probes.js';

const handle = injectRoute();
const params = handle.params;
const data = handle.data;

if (params.hasValue()) {
  const value = params.value();
  const team: number = value.teamId;
  const id: number = value.id;
}

if (data.hasValue()) {
  const value = data.value();
  const symbol: number = value[localSymbol];
  const item: number = value.item;
  // Inference is unchanged; documented native-loss availability is the explicit exception.
  const prototype: number = value.__proto__;
  const empty: undefined = value.empty;

  // @ts-expect-error readonly local symbol binding
  value[localSymbol] = 1;
}

// @ts-expect-error native readonly resource
handle.search.set({ score: 1 });
`,
);
await write(
  "src/proof.ts",
  `import { ApplicationRef, inject, provideEnvironmentInitializer } from '@angular/core';
import {
  Router, RedirectCommand, NavigationStart, NavigationEnd, NavigationCancel, NavigationError,
  NavigationSkipped, NavigationCancellationCode,
  type ActivatedRouteSnapshot, type RouterStateSnapshot,
} from '@angular/router';
import {
  calls, inputs, held, jobs, release, fail, localSymbol, leaves, allowLeave,
  prototypeResults, opaque, ancestry, usePromises, promiseConstructor,
  guardPromise, resolverPromise, finishGuard, finishResolver, promiseEntries,
} from './probes.js';

const wait = (ms = 20) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function check(value: unknown, label: string): void {
  if (!value) {
    throw new Error(label);
  }
}

async function until(test: () => boolean, label: string) {
  const end = Date.now() + 6000;

  while (!test()) {
    check(Date.now() < end, label);
    await wait(5);
  }
}

export const proofProvider = provideEnvironmentInitializer(() => {
  const router = inject(Router);
  const app = inject(ApplicationRef);
  const events: string[] = [];
  const unhandled: unknown[] = [];

  window.addEventListener('unhandledrejection', (event) => {
    unhandled.push(String(event.reason));
  });

  (window as any).lifecycleProof = async () => {
    const blocked = router.config.find((route) => route.path === 'blocked')!;
    let deny!: (value: boolean) => void;
    let replacement: Promise<boolean> | undefined;
    let reenter = false;
    let skipFromStart = false;
    let startSkip: Promise<boolean> | undefined;

    blocked.canActivate = [() => new Promise<boolean>((resolve) => {
      deny = resolve;
    })];

    const listener = router.events.subscribe((event) => {
      if (event instanceof NavigationStart || event instanceof NavigationEnd ||
          event instanceof NavigationCancel || event instanceof NavigationError) {
        events.push(event.constructor.name + ':' + event.id);
      }

      if (event instanceof NavigationEnd && reenter && event.urlAfterRedirects === '/plain/7') {
        reenter = false;
        replacement = router.navigateByUrl('/blocked');
      }

      if (event instanceof NavigationStart && skipFromStart) {
        skipFromStart = false;
        startSkip = router.navigateByUrl(router.url);
      }
    });

    // This listener precedes handle construction. The nested Start reaches the handle
    // before the outer End; the outer journal itself records Start -> End -> Start.
    held.add('id:6');
    await router.navigateByUrl('/plain/6');
    const page = (window as any).plain;
    const params = page.handle.params;

    await until(() => calls.includes('id:6'), 'initial never-settle parse');
    const scope = page.connect();

    const initialValue = scope.handle.params.value();

    check(scope.handle.params.status() === 'loading' && initialValue === undefined, 'initial parsing loading');
    held.add('id:7');
    reenter = true;
    await router.navigateByUrl('/plain/7');
    await until(() => typeof deny === 'function' && calls.includes('id:7'), 'replacement started');

    const tail = events.slice(-3);
    check(tail[0].startsWith('NavigationStart:') && tail[1].startsWith('NavigationEnd:') &&
      tail[2].startsWith('NavigationStart:'), 'native outer-listener order ' + JSON.stringify(tail));

    release('id:7', 7);
    await wait(30);
    const committed7 = params.value();

    // The committed survivor7 describes the current URL; the newer Start keeps it reloading.
    check(params.status() === 'reloading' && committed7?.id === 7, 'old End cannot settle newer Start');
    deny(false);
    const cancelled = await replacement;

    check(cancelled === false, 'native cancellation');
    await until(() => params.value()?.id === 7, 'true survivor7 restored');
    const survivorCalls = calls.filter((value) => value === 'id:7');

    check(survivorCalls.length === 1, 'survivor7 not reparsed');
    await app.whenStable();
    check(jobs.has('id:6'), 'obsolete6 genuinely never settled');
    scope.destroy();

    // Constructors inside terminal delivery must hand off tracking synchronously.
    let endScope: any;
    let stableValue: any;
    const endListener = router.events.subscribe((event) => {
      if (event instanceof NavigationEnd && event.urlAfterRedirects === '/plain/9') {
        endScope = page.connect();
        void app.whenStable().then(() => {
          stableValue = endScope.handle.params.value();
        });
      }
    });

    held.add('id:9');
    await router.navigateByUrl('/plain/9');
    await until(() => calls.includes('id:9'), 'end parse');
    await wait();
    check(stableValue === undefined, 'end handoff keeps stability pending');
    release('id:9', 9);
    await app.whenStable();
    check(stableValue?.id === 9, 'paired published before End task release');
    endScope.destroy();
    endListener.unsubscribe();

    let cancelScope: any;
    let cancelStable: any;
    const cancelListener = router.events.subscribe((event) => {
      if (event instanceof NavigationCancel) {
        cancelScope = page.connect();
        void app.whenStable().then(() => {
          cancelStable = cancelScope.handle.params.value();
        });
      }
    });

    const cancel = router.navigateByUrl('/blocked');
    await until(() => router.currentNavigation()?.initialUrl.toString() === '/blocked', 'cancel started');
    await wait();
    deny(false);
    await cancel;
    await app.whenStable();
    check(cancelStable?.id === 9, 'missed cancel handoff');
    cancelScope.destroy();
    cancelListener.unsubscribe();

    // A pending navigation keeps settled values reloading; cancellation settles them unchanged.
    const settled9 = params.value();
    const settledSearch9 = page.handle.search.value();
    const settledData9 = page.handle.data.value();
    const pendingCancel = router.navigateByUrl('/blocked');

    await until(() => router.currentNavigation()?.initialUrl.toString() === '/blocked', 'pending cancel started');
    await wait();
    const kept9 = params.value();
    const keptSearch9 = page.handle.search.value();
    const keptData9 = page.handle.data.value();

    check(params.status() === 'reloading' && params.isLoading() && params.hasValue() && kept9 === settled9,
      'pending keeps params reloading');
    check(page.handle.search.status() === 'reloading' && keptSearch9 === settledSearch9, 'pending keeps search reloading');
    check(page.handle.data.status() === 'reloading' && keptData9 === settledData9, 'pending keeps data reloading');
    deny(false);
    await pendingCancel;
    const cancelled9 = params.value();

    check(params.status() === 'resolved' && cancelled9 === settled9 && page.handle.data.status() === 'resolved',
      'cancellation settles kept values');

    // Error releases old tracking; a new idle scope rejoins the exact unfinished operation.
    held.add('id:10');
    await router.navigateByUrl('/plain/10');
    await until(() => calls.includes('id:10'), 'error survivor pending');
    let errorScope: any;
    const errorListener = router.events.subscribe((event) => {
      if (event instanceof NavigationError) {
        errorScope = page.connect();
      }
    });

    blocked.canActivate = [() => { throw 'native failure'; }];
    let rejected: unknown;

    try {
      await router.navigateByUrl('/blocked');
    } catch (error) {
      rejected = error;
    }

    check(rejected === 'native failure', 'native rejection untouched');
    const unfinished10 = params.value();

    // The failure is the navigation's; the survivor's unfinished parse keeps loading.
    check(params.status() === 'loading' && unfinished10 === undefined, 'error leaves survivor loading');
    let errorStable = false;

    void app.whenStable().then(() => { errorStable = true; });
    await wait();
    check(!errorStable, 'new error listener scope tracks unfinished survivor');
    release('id:10', 10);
    await app.whenStable();
    const rejoined = errorScope.handle.params.value();
    const survivor10 = params.value();
    const survivorCalls10 = calls.filter((value) => value === 'id:10');

    check(rejoined?.id === 10, 'new error listener scope rejoined');
    check(params.status() === 'resolved' && survivor10 === rejoined && survivorCalls10.length === 1,
      'error survivor settles once without reparse');
    errorScope.destroy();
    errorListener.unsubscribe();

    let settledRejection: unknown;

    try {
      await router.navigateByUrl('/blocked');
    } catch (error) {
      settledRejection = error;
    }

    const afterError = params.value();

    check(settledRejection === 'native failure' && params.status() === 'resolved' && afterError === survivor10,
      'navigation error keeps settled values');

    // A replacement skipped as same-URL emits no Start of its own, yet must settle the survivor.
    const replacements: string[] = [];
    const replacementListener = router.events.subscribe((event) => {
      if (event instanceof NavigationStart || event instanceof NavigationSkipped) {
        replacements.push(event.constructor.name + ':' + event.id);
      } else if (event instanceof NavigationCancel) {
        replacements.push('NavigationCancel:' + event.id + ':' + event.code);
      }
    });
    const views = [params, page.handle.search, page.handle.data];
    const settledViews = () => {
      for (const view of views) {
        if (view.status() !== 'resolved' || view.isLoading()) {
          return false;
        }
      }

      return params.value() === survivor10;
    };

    blocked.canActivate = [() => new RedirectCommand(router.parseUrl(router.url))];
    const redirectedHome = await router.navigateByUrl('/blocked');
    await app.whenStable();
    const [redirectStart, redirectCancel, redirectSkip] = replacements.splice(0);

    check(redirectStart.startsWith('NavigationStart:') &&
      redirectCancel.endsWith(':' + NavigationCancellationCode.Redirect) &&
      redirectSkip === 'NavigationSkipped:' + (Number(redirectStart.split(':')[1]) + 1),
      'native redirect to current URL skips without Start');
    check(redirectedHome === false && settledViews(), 'skipped redirect replacement settles kept values');

    blocked.canActivate = [() => new Promise<boolean>((resolve) => {
      deny = resolve;
    })];
    const supersededHome = router.navigateByUrl('/blocked');

    await until(() => router.currentNavigation()?.initialUrl.toString() === '/blocked', 'superseded started');
    await wait();
    check(params.status() === 'reloading', 'superseded pending keeps values reloading');
    const returnedHome = await router.navigateByUrl(router.url);
    const superseded = await supersededHome;

    deny(false);
    await app.whenStable();
    const [supersededStart, supersededCancel, supersededSkip] = replacements.splice(0);

    check(supersededStart.startsWith('NavigationStart:') &&
      supersededCancel.endsWith(':' + NavigationCancellationCode.SupersededByNewNavigation) &&
      supersededSkip === 'NavigationSkipped:' + (Number(supersededStart.split(':')[1]) + 1),
      'native current URL supersedes without Start');
    check(returnedHome === false && superseded === false && settledViews(),
      'skipped superseding replacement settles kept values');

    // The earlier listener's same-URL replacement is skipped before the obsolete Start reaches the handle.
    const keptSearch = page.handle.search.value();
    const keptData = page.handle.data.value();

    skipFromStart = true;
    const interrupted = await router.navigateByUrl('/blocked');
    const skippedHome = await startSkip;

    await app.whenStable();
    const [lateSkip, lateStart, lateCancel] = replacements.splice(0);

    check(lateStart.startsWith('NavigationStart:') &&
      lateSkip === 'NavigationSkipped:' + (Number(lateStart.split(':')[1]) + 1) &&
      lateCancel.endsWith(':' + NavigationCancellationCode.SupersededByNewNavigation),
      'native replacement skip precedes its obsolete Start');
    check(interrupted === false && skippedHome === false && settledViews() &&
      page.handle.search.value() === keptSearch && page.handle.data.value() === keptData,
      'obsolete Start after skipped replacement keeps settled values');
    replacementListener.unsubscribe();
    blocked.canActivate = [() => { throw 'native failure'; }];

    // First paired failure releases despite an unfinished sibling; late rejection is observed.
    held.add('id:11');
    held.add('score:42');
    await router.navigateByUrl('/plain/11?score=42');
    await until(() => calls.includes('score:42'), 'pair concurrent');
    fail('score:42', new Error('first pair failure'));
    await app.whenStable();
    const pairError = params.error();

    check(pairError.source === 'search', 'paired first error');
    check(jobs.has('id:11'), 'sibling still unfinished');
    fail('id:11', new Error('late sibling failure'));
    await wait();
    check(unhandled.length === 0, 'late sibling observed');

    // Native component-first deactivation adds no parser demand.
    await router.navigateByUrl('/');
    held.add('id:12');
    await router.navigateByUrl('/plain/12');
    await until(() => calls.includes('id:12'), 'scoped parse');
    const livePage = (window as any).plain;
    const independent = livePage.connect();

    allowLeave(false);
    const beforeLeave = calls.length;
    const leaveDenied = await router.navigateByUrl('/');
    const args = leaves[leaves.length - 1];

    check(leaveDenied === false, 'native deactivation blocks');
    check(args[0] === livePage && args[1].params.id === '12' &&
      args[2].url === '/plain/12' && args[3].url === '/', 'native component-first deactivation args');
    check(calls.length === beforeLeave, 'deactivation adds no parser demand');
    allowLeave(true);
    await router.navigateByUrl('/');
    independent.destroy();
    await app.whenStable();
    check(!app.destroyed, 'application survives scoped destruction');

    // Own ordinary/symbol/undefined/opaque results survive projection. Accepted native
    // __proto__ loss means absence, never manufactured inherited Object.prototype.
    await router.navigateByUrl('/teams/7/items/8?score=44');
    const item = (window as any).item;

    await app.whenStable();
    const localData = item.handle.data.value();
    const nativeData = item.native.snapshot.data;
    const shared = inputs[0];

    check(inputs.length === 4, 'guard plus ordinary/prototype/symbol resolvers');
    for (const value of inputs) {
      check(value === shared, 'public inputs shared');
    }
    check(Object.isFrozen(shared) && Object.isFrozen(shared.params) &&
      Object.isFrozen(shared.search), 'shallow input maps frozen');
    check(localData[localSymbol] === 8, 'local symbol resolver projected');
    check(Object.hasOwn(localData, 'empty') && localData.empty === undefined, 'own undefined retained');
    check(localData.opaque === opaque && nativeData.opaque === opaque, 'opaque identity retained');
    check(!Object.isFrozen(opaque) && !Object.isFrozen(opaque.nested), 'opaque not recursively frozen');
    check(prototypeResults.length === 1 && prototypeResults[0] === 8, 'prototype callback returned8');
    check(!Object.hasOwn(nativeData, '__proto__'), 'native prototype resolver result not retained');
    check(!Object.hasOwn(localData, '__proto__') && localData.__proto__ === undefined,
      'missing native result is not fabricated');

    // While the typed guard parses the next item, both the settled params and data stay reloading.
    const itemParams = item.handle.params;
    const settledItem = itemParams.value();

    held.add('id:9');
    const itemNavigation = router.navigateByUrl('/teams/7/items/9?score=44');

    await until(() => jobs.has('id:9'), 'item guard parse pending');
    const pendingItem = itemParams.value();
    const pendingData = item.handle.data.value();

    check(itemParams.status() === 'reloading' && pendingItem === settledItem && pendingItem?.id === 8,
      'pending keeps item params');
    check(item.handle.data.status() === 'reloading' && pendingData === localData, 'pending keeps item data');
    release('id:9', 9);
    const itemCommitted = await itemNavigation;

    await app.whenStable();
    const committedItem = itemParams.value();
    const committedData = item.handle.data.value();

    check(itemCommitted && (window as any).item === item, 'item record reused');
    check(itemParams.status() === 'resolved' && committedItem?.id === 9, 'commitment publishes new params');
    check(item.handle.data.status() === 'resolved' && committedData.item === 9 && committedData[localSymbol] === 9,
      'commitment publishes new data');

    // An actual complete future ancestry: earlier own-ID duplicate and supplied child's
    // own-ID spoof must not replace the nearest proper declaring parent7.
    await router.navigateByUrl('/');
    const identity = '__loozoAngularRouterRouteId';
    const earlier = router.config.find((route) => route.path === 'duplicate/100')!;
    const declaring = earlier.children![0];
    const guarded = declaring.children![0];
    const earlierData = earlier.data!;
    const declaringData = declaring.data!;
    const guardedData = guarded.data!;
    const declaringId = declaringData[identity];
    let nativeChild: ActivatedRouteSnapshot | undefined;
    let nativeState: RouterStateSnapshot | undefined;

    declaring.canActivateChild!.unshift((child, state) => {
      nativeChild = child;
      nativeState = state;
      return true;
    });
    earlier.data = { ...earlierData, [identity]: declaringId };
    guarded.data = { ...guardedData, [identity]: declaringId };
    const ancestryAccepted = await router.navigateByUrl('/duplicate/100/teams/7/items/9');
    const selectedParent = ancestry[0];

    check(ancestryAccepted && ancestry.length === 1, 'native declaring guard entered once');
    check(selectedParent.inputs.params.teamId === 7, 'nearest proper parent7 beats duplicate100/child9');
    check(selectedParent.child === nativeChild && selectedParent.state === nativeState,
      'original native child/state identity');
    check(selectedParent.child.parent!.url[1].path === '7' && selectedParent.entry === 'parent entry',
      'declaring future parent and native DI');

    await router.navigateByUrl('/');
    earlier.data = earlierData;
    guarded.data = guardedData;
    const wrong = { ...declaringData, [identity]: 'wrong own ID' };
    const inherited = Object.create({ [identity]: declaringId });
    const ancestryFailures: string[] = [];

    for (const data of [wrong, inherited]) {
      declaring.data = data;
      const before = ancestry.length;
      let error: unknown;

      try {
        await router.navigateByUrl('/duplicate/100/teams/7/items/9');
      } catch (cause) {
        error = cause;
      }

      if (!(error instanceof Error)) {
        throw new Error('wrong/missing own parent must reject natively');
      }

      check(ancestry.length === before, 'invalid own identity never enters application callback');
      ancestryFailures.push(error.message);
    }
    declaring.data = declaringData;

    // Real generated handle acquisition, not scratch coupling or patched tasks.
    await router.navigateByUrl('/acquire/21');
    await app.whenStable();
    const acquirePage = (window as any).acquire;
    const acquiringScope = acquirePage.scope();
    let destructions = 0;
    const destroyDuringAdd = app.isStable.subscribe((stable) => {
      if (!stable && destructions === 0) {
        destructions += 1;
        acquiringScope.destroy();
      }
    });

    const destroyedHandle = acquiringScope.connect();
    destroyDuringAdd.unsubscribe();
    await app.whenStable();
    const destroyedViews = [destroyedHandle.params, destroyedHandle.search, destroyedHandle.data];

    check(destructions === 1 && !app.destroyed, 'own scope destroyed inside actual acquisition; app alive');
    check(!calls.includes('acquire:21'), 'no parser after acquisition destruction');
    for (const view of destroyedViews) {
      const value = view.value();

      check(view.status() === 'loading' && value === undefined, 'no postdestroy data/parse publication');
    }

    // Ordinary scope destruction while the application AND current route remain live.
    held.add('acquire:21');
    const normalScope = acquirePage.scope();
    const normalHandle = normalScope.connect();

    await until(() => calls.includes('acquire:21'), 'ordinary scoped parse');
    normalScope.destroy();
    await app.whenStable();
    check(router.url === '/acquire/21' && !app.destroyed, 'normal destroy keeps app/current route live');
    release('acquire:21', 21);
    await wait();
    const destroyedLateValue = normalHandle.params.value();

    check(normalHandle.params.isLoading() && destroyedLateValue === undefined, 'late parse cannot publish after destroy');

    // Joining an unfinished survivor after native error: synchronous real same-URL skip
    // during add must not acquire twice/overwrite cleanup, restart parse, or leak stability.
    held.add('acquire:22');
    await router.navigateByUrl('/acquire/22');
    const survivorScope = acquirePage.scope();
    const survivorHandle = survivorScope.connect();

    await until(() => calls.includes('acquire:22'), 'unfinished survivor parse');
    let nativeFailure: unknown;

    try {
      await router.navigateByUrl('/blocked');
    } catch (error) {
      nativeFailure = error;
    }

    check(nativeFailure === 'native failure' && survivorHandle.params.status() === 'loading',
      'native error keeps unfinished survivor loading');
    survivorScope.destroy();
    await app.whenStable();
    const skipScope = acquirePage.scope();
    let skip: Promise<boolean> | undefined;
    let skips = 0;
    const skipDuringAdd = app.isStable.subscribe((stable) => {
      if (!stable && skips === 0) {
        skips += 1;
        skip = router.navigateByUrl(router.url);
      }
    });

    const skipHandle = skipScope.connect();
    skipDuringAdd.unsubscribe();
    const skipped = await skip;

    check(skips === 1 && skipped === false, 'genuine sameURL skip during acquisition');
    let pairedAtStability: any;

    void app.whenStable().then(() => {
      pairedAtStability = [skipHandle.params.value(), skipHandle.search.value()];
    });
    release('acquire:22', 22);
    await app.whenStable();
    const joinedCalls = calls.filter((value) => value === 'acquire:22');

    check(joinedCalls.length === 1, 'sameURL reentry joins one parse');
    check(pairedAtStability[0]?.id === 22 && pairedAtStability[1] !== undefined,
      'pair published before stable without overwritten cleanup');
    skipScope.destroy();
    await app.whenStable();
    check(router.url === '/acquire/22' && !app.destroyed, 'skip scope normal destruction stable/live');

    // Genuine iframe intrinsic Promise vs host Promise, public generated callbacks.
    const iframe = document.createElement('iframe');

    document.body.append(iframe);
    const realm = iframe.contentWindow as Window & typeof globalThis;
    const promiseResults: { foreign: boolean; guard: boolean; answer: number }[] = [];

    for (const constructor of [Promise, realm.Promise]) {
      await router.navigateByUrl('/');
      usePromises(constructor);
      let guardOutcome: boolean | undefined;
      const guardNavigation = router.navigateByUrl('/promise-guard').then((value) => {
        guardOutcome = value;
        return value;
      });

      await until(() => guardPromise !== undefined, 'generated Promise guard entered');
      await wait();
      const pendingGuard = guardPromise!;
      const foreign = constructor !== Promise;
      const hostGuard = pendingGuard instanceof Promise;

      check(pendingGuard instanceof promiseConstructor && Object.prototype.toString.call(pendingGuard) === '[object Promise]',
        'actual intrinsic Promise guard');
      check(hostGuard !== foreign, 'foreign/host constructor identity');
      check(guardOutcome === undefined && router.url === '/', 'pending guard cannot commit');
      finishGuard(false);
      const guard = await guardNavigation;

      check(guard === false && router.url === '/', 'Promise false guard blocks natively');
      let resolverOutcome: boolean | undefined;
      const resolverNavigation = router.navigateByUrl('/promise-resolver').then((value) => {
        resolverOutcome = value;
        return value;
      });

      await until(() => resolverPromise !== undefined, 'generated Promise resolver entered');
      await wait();
      const pendingResolver = resolverPromise!;
      const hostResolver = pendingResolver instanceof Promise;

      check(pendingResolver instanceof promiseConstructor && hostResolver !== foreign,
        'actual foreign/host resolver Promise');
      check(resolverOutcome === undefined && router.url === '/', 'pending resolver cannot commit Promise object');
      finishResolver(17);
      const resolved = await resolverNavigation;

      await app.whenStable();
      const answer = (window as any).answer;
      const answerData = answer.handle.data.value();
      const nativeAnswer = answer.native.snapshot.data.answer;

      check(resolved && answerData.answer === 17 && nativeAnswer === 17, 'native/public resolved17, not Promise');
      promiseResults.push({ foreign, guard, answer: answerData.answer });
    }
    iframe.remove();
    check(promiseEntries.length === 4, 'both realm callback pairs entered');
    for (const entry of promiseEntries) {
      check(entry === 'promise entry', 'Promise callback native DI');
    }

    // Preserved-search sync failure still observes a launched mapped source's late rejection.
    await router.navigateByUrl('/');
    held.add('alias:13');
    let redirectError: unknown;

    try {
      await router.navigateByUrl('/alias/13?score=45');
    } catch (error) {
      redirectError = error;
    }

    check(redirectError instanceof Error, 'preserved sync throw is native navigation error');
    check(calls.includes('alias:13'), 'source sibling launched');
    fail('alias:13', new Error('late source rejection'));
    await wait(30);
    check(unhandled.length === 0, 'preserved sync failure observes launched source');
    check(router.url === '/', 'redirect failure retains prior URL');

    blocked.canActivate = undefined;
    blocked.canMatch = [() => new RedirectCommand(router.parseUrl('/'))];
    const nativeSameUrlRedirect = await router.navigateByUrl('/blocked');

    check(nativeSameUrlRedirect === false, 'native sameURL redirect returns false');
    blocked.canMatch = undefined;
    listener.unsubscribe();

    return {
      events, calls, guardResolverShared: true, symbolData: true, unhandled,
      reentrantSurvivor: 7, terminalHandoffs: true,
      nativePrototypeResolverResultNotRetained: true, nativeSameUrlRedirect,
      prototypeCallbackResult: prototypeResults[0], prototypeHandleAbsent: true,
      nearestDeclaringParent: selectedParent.inputs.params.teamId, ancestryFailures,
      acquisitionDestructions: destructions, acquisitionNoPostDestroyParse: true,
      sameURLAcquisitionSkip: skipped, survivorParseCount: joinedCalls.length,
      pairedAtStability, promiseResults,
    };
  };
});
`,
);

const main = await readFile(join(fixture, "src/main.ts"), "utf8");

await write(
  "src/main.ts",
  `import { proofProvider } from './proof.js';\n${main.replace("provideRouter(routes)", "provideRouter(routes), proofProvider")}`,
);

async function architect() {
  const host = core.workspaces.createWorkspaceHost(new NodeJsSyncHost());
  const { workspace } = await core.workspaces.readWorkspace(fixture, host);
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  return new Architect(new WorkspaceNodeModulesArchitectHost(workspace, fixture), registry);
}

const instance = await architect();
const logger = new core.logging.Logger("lifecycle");
const logs = [];

logger.subscribe((entry) => logs.push(entry));

const build = await instance.scheduleTarget({ project: "proof", target: "build" }, {}, { logger });

try {
  const output = await build.result;

  await writeFile(join(evidence, "build-report.json"), JSON.stringify({ output, logs }, null, 2));
  assert.equal(output.success, true, JSON.stringify(logs));
} finally {
  await build.stop();
}

const types = spawnSync(
  process.execPath,
  [
    require.resolve("typescript/lib/tsc.js"),
    "-p",
    join(fixture, "tsconfig.app.json"),
    "--noEmit",
    "--skipLibCheck",
    "false",
  ],
  { encoding: "utf8" },
);

for (const key of ["stdout", "stderr"]) {
  await writeFile(join(evidence, `typecheck.${key}`), types[key]);
}

await writeFile(join(evidence, "typecheck.exit"), String(types.status) + "\n");
assert.equal(types.status, 0, types.stdout + types.stderr);

const server = await instance.scheduleTarget({ project: "proof", target: "serve" }, {}, { logger });
const outputs = [];
const subscription = server.output.subscribe((output) => outputs.push(output));
let browser;

try {
  const end = Date.now() + 60000;

  while (!outputs.some((output) => output.success && output.baseUrl)) {
    assert.ok(Date.now() < end, JSON.stringify(logs));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const output = outputs.find((output) => output.success && output.baseUrl);

  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });

  const tab = await browser.newPage();
  const errors = [];

  tab.on("pageerror", (error) => errors.push(String(error)));
  await tab.goto(output.baseUrl);
  await tab.waitForFunction(() => typeof window.lifecycleProof === "function");

  const result = await tab.evaluate(() => window.lifecycleProof());

  assert.deepEqual(errors, []);
  await writeFile(
    join(evidence, "browser-observations.json"),
    JSON.stringify({ result, errors }, null, 2),
  );

  const html = await tab.content();

  await writeFile(join(evidence, "browser.html"), html);
} finally {
  await browser?.close();
  subscription.unsubscribe();
  await server.stop();
  await writeFile(join(evidence, "serve-report.json"), JSON.stringify({ outputs, logs }, null, 2));
}

console.log(
  "Native lifecycle/ancestry/own-data/acquisition/iframe-Promise/concurrent-redirect proof passed",
);
