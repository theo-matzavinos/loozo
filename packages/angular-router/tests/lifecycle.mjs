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

// These fixtures author paths and parents by hand, so they opt out of filesystem mode.
const configuration = JSON.parse(await readFile(join(fixture, "angular.json"), "utf8"));

configuration.projects.proof.architect.build.options.autoDefineRoutes = false;
await writeFile(join(fixture, "angular.json"), JSON.stringify(configuration));

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
// Labels whose parser accepts the matching parse and rejects later ones: a nondeterministic codec.
const failAfter = new Map<string, number>();
let leave = true;

export function allowLeave(value: boolean) {
  leave = value;
}

export function canLeave(...args: any[]) {
  leaves.push(args);
  return leave;
}

export function failAfterMatching(label: string) {
  failAfter.set(label, 1);
}

export function codec(key: string) {
  return {
    parse: (raw: string): number => {
      const label = key + ':' + raw;
      const passes = failAfter.get(label);

      calls.push(label);

      if (passes === 0) {
        throw new Error('nondeterministic failure');
      }

      if (passes !== undefined) {
        failAfter.set(label, passes - 1);
      }

      const value = Number(raw);

      if (raw.trim() === '' || !Number.isFinite(value)) {
        throw new Error('bad number');
      }

      return value;
    },
    stringify: (value: number) => String(value),
  };
}

// Typed loosely enough to slip past the declaration type check, as JavaScript could.
export const thenableCodec: { parse(raw: string): any; stringify(value: any): string } = {
  parse: (raw) => {
    calls.push('thenable:' + raw);
    return Promise.reject(new Error('stray thenable rejection'));
  },
  stringify: (value) => String(value),
};

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

export const slowEntries: number[] = [];
let gate: Promise<void> | undefined;

// Holds the next slow resolver until the returned function runs.
export function holdResolver(): () => void {
  let open!: () => void;

  gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return open;
}

export function slow(value: any): number | Promise<number> {
  const held = gate;

  slowEntries.push(value.params.id);
  gate = undefined;

  if (!held) {
    return value.params.id;
  }

  return held.then(() => value.params.id);
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

export const resolverCalls: string[] = [];
export const matchEntries: any[] = [];
export const activations: any[] = [];
export const invalidErrors: any[] = [];
export const decisionEntries: string[] = [];
let decision: () => unknown = () => false;

export function decideWith(next: () => unknown) {
  decision = next;
}

export function decide(error: any): any {
  decisionEntries.push(inject(token));
  invalidErrors.push(error);
  return decision();
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
  `import { defineRoute } from '@loozo/angular-router';
import { codec, canLeave } from '../../probes.js';

export default defineRoute('plain/$id', {
  params: { id: codec('id') },
  search: { score: codec('score') },
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
  `import { defineRoute, numberParam } from '@loozo/angular-router';
import { codec } from '../../probes.js';

export default defineRoute('teams/$teamId', {
  params: { teamId: numberParam },
  search: { score: codec('score') },
});
`,
);
await write(
  "src/routes/item/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import team from '../team/definition.js';
import { codec, record, prototypeResult, token, localSymbol, opaque, slow } from '../../probes.js';

export default defineRoute('items/$id', {
  parent: team,
  params: { id: codec('item') },
  providers: [{ provide: token, useValue: 'item entry' }],
  canActivate: [(value) => {
    record(value);
    return true;
  }],
  title: (value) => Promise.resolve('Item ' + record(value)),
  resolve: {
    item: record,
    [localSymbol]: record,
    ['__proto__']: prototypeResult,
    empty: () => undefined,
    opaque: () => opaque,
    slow,
  },
  runGuardsAndResolvers: 'paramsOrQueryParamsChange',
});
`,
);
await write(
  "src/routes/item/page.ts",
  `import { Component, effect, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { injectRoute } from './route.generated.js';

@Component({ template: '<p id="item">item</p>' })
export default class Item {
  readonly native = inject(ActivatedRoute);
  readonly handle = injectRoute();
  // Committed values exist from the first, synchronous read.
  readonly first = {
    params: this.handle.params(),
    search: this.handle.search(),
    data: this.handle.data(),
  };
  readonly seen: [any, any, any][] = [];
  // Native subscribers registered after the handle read its new values.
  readonly notified: [string, any, any][] = [];

  constructor() {
    (window as any).item = this;
    effect(() => {
      this.seen.push([this.handle.params(), this.handle.search(), this.handle.data()]);
    });
    this.native.queryParams.subscribe(() => {
      this.notified.push(['queryParams', this.handle.params(), this.handle.search()]);
    });
    this.native.params.subscribe(() => {
      this.notified.push(['params', this.handle.params(), this.handle.search()]);
    });
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
        throw new Error('preserved search is never parsed by the redirect');
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
  "src/routes/thenable-alias/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import target from '../preserved/definition.js';
import { thenableCodec } from '../../probes.js';

export default defineRoute('thenable-alias/$id', {
  params: { id: thenableCodec },
  redirect: { to: target, params: { id: 'id' }, search: { mode: 'drop' }, fragment: { mode: 'drop' } },
});
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
  `import { defineRoute } from '@loozo/angular-router';
import declaring from '../declaring/definition.js';

// Static, so only the declaring parent has a generated matching guard to check identity.
export default defineRoute('items/9', { parent: declaring });
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

// Matching: invalid local path params fall through to the closest catchall.
const marked = (id) => `import { Component } from '@angular/core';

@Component({ template: '<p id="${id}">${id}</p>' })
export default class Marked {}
`;

await write(
  "src/routes/missing/definition.ts",
  `import { defineRoute, stringParam } from '@loozo/angular-router';

export default defineRoute('$segments[]', { params: { segments: stringParam } });
`,
);
await write("src/routes/missing/page.ts", marked("missing"));
await write(
  "src/routes/shop/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';

export default defineRoute('shop', {});
`,
);
await write(
  "src/routes/shop/page.ts",
  `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
export default class Shop {}
`,
);
await write(
  "src/routes/shop-item/definition.ts",
  `import { defineRoute, numberParam } from '@loozo/angular-router';
import shop from '../shop/definition.js';

export default defineRoute('$id', { parent: shop, params: { id: numberParam } });
`,
);
await write("src/routes/shop-item/page.ts", marked("shop-item"));
await write(
  "src/routes/shop-missing/definition.ts",
  `import { defineRoute, stringParam } from '@loozo/angular-router';
import shop from '../shop/definition.js';

export default defineRoute('$rest[]', { parent: shop, params: { rest: stringParam } });
`,
);
await write("src/routes/shop-missing/page.ts", marked("shop-missing"));
await write(
  "src/routes/kind/definition.ts",
  `import { defineRoute, enumParam } from '@loozo/angular-router';
import { resolverCalls } from '../../probes.js';

export default defineRoute('kinds/$kind', {
  params: { kind: enumParam(['a', 'b']) },
  resolve: {
    seen: ({ params }) => {
      resolverCalls.push(params.kind);
      return params.kind;
    },
  },
});
`,
);
await write("src/routes/kind/page.ts", marked("kind"));
await write(
  "src/routes/decided/definition.ts",
  `import { defineRoute, numberParam } from '@loozo/angular-router';
import { decide, token } from '../../probes.js';

export default defineRoute('decided/$id', {
  params: { id: numberParam },
  providers: [{ provide: token, useValue: 'decided entry' }],
  onInvalidParams: decide,
});
`,
);
await write("src/routes/decided/page.ts", marked("decided"));
await write(
  "src/routes/thenable/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import { decide, thenableCodec, token } from '../../probes.js';

export default defineRoute('thenable/$id', {
  params: { id: thenableCodec },
  providers: [{ provide: token, useValue: 'thenable entry' }],
  onInvalidParams: decide,
});
`,
);
await write("src/routes/thenable/page.ts", marked("thenable"));
await write(
  "src/routes/thenable-search/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import { activations, thenableCodec } from '../../probes.js';

export default defineRoute('thenable-search', {
  search: { q: thenableCodec },
  canActivate: [(inputs) => {
    activations.push(inputs);
    return true;
  }],
});
`,
);
await write("src/routes/thenable-search/page.ts", marked("thenable-search"));
// No authored callbacks: only the generated matching guard can parse this search.
await write(
  "src/routes/thenable-plain/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import { thenableCodec } from '../../probes.js';

export default defineRoute('thenable-plain', { search: { q: thenableCodec } });
`,
);
await write("src/routes/thenable-plain/page.ts", marked("thenable-plain"));
await write(
  "src/routes/thenable-query/definition.ts",
  `import { defineRoute, numberParam } from '@loozo/angular-router';
import { decide, thenableCodec, token } from '../../probes.js';

export default defineRoute('thenable-query/$id', {
  params: { id: numberParam },
  search: { q: thenableCodec },
  providers: [{ provide: token, useValue: 'thenable entry' }],
  onInvalidParams: decide,
});
`,
);
await write(
  "src/routes/thenable-query/page.ts",
  `import { Component } from '@angular/core';
import { injectRoute } from './route.generated.js';

@Component({ template: '<p id="thenable-query">{{ handle.params().id }}</p>' })
export default class ThenableQuery {
  readonly handle = injectRoute();

  constructor() {
    (window as any).thenableQuery = this;
  }
}
`,
);
await write(
  "src/routes/matched/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import { codec, matchEntries } from '../../probes.js';

export default defineRoute('matched/$id', {
  params: { id: codec('matched') },
  search: { q: codec('query') },
  canMatch: [(inputs) => {
    matchEntries.push(inputs);
    return true;
  }],
});
`,
);
await write("src/routes/matched/page.ts", marked("matched"));
await write(
  "src/routes/searching/definition.ts",
  `import { arrayParam, defineRoute, enumParam, numberParam, withFallback } from '@loozo/angular-router';

export default defineRoute('searching', {
  search: {
    sort: enumParam(['asc', 'desc']),
    page: withFallback(numberParam, 1),
    tag: arrayParam(enumParam(['a', 'b', 'c'])),
  },
  runGuardsAndResolvers: 'paramsOrQueryParamsChange',
  resolve: { search: ({ search }) => search },
});
`,
);
await write(
  "src/routes/searching/page.ts",
  `import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { injectRoute } from './route.generated.js';

@Component({ template: '<p id="searching">searching</p>' })
export default class Searching {
  readonly native = inject(ActivatedRoute);
  readonly handle = injectRoute();

  constructor() {
    (window as any).searching = this;
  }
}
`,
);

// Redirects into the list keep repeated keys (preserve) or write them (replace).
for (const [name, search] of [
  ["searching-preserve", "{ mode: 'preserve' }"],
  ["searching-replace", "{ mode: 'replace', values: { tag: ['b', 'a', 'b'], page: 2 } }"],
  ["searching-replace-empty", "{ mode: 'replace', values: { tag: [] } }"],
]) {
  await write(
    `src/routes/${name}/definition.ts`,
    `import { defineRoute } from '@loozo/angular-router';
import searching from '../searching/definition.js';

export default defineRoute('${name}', {
  redirect: { to: searching, search: ${search}, fragment: { mode: 'drop' } },
});
`,
  );
}

// Inherited resolver data: a layout page resolving a team, a pathless node with a resolver of
// its own, and a member page whose handle reads the whole chain's results.
await write(
  "src/squad-probes.ts",
  `export const squadCalls: string[] = [];
let gate: Promise<void> | undefined;

// Holds the next team resolver until the returned function runs.
export function holdTeam(): () => void {
  let open!: () => void;

  gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return open;
}

export function team(id: number): { id: number; name: string } | Promise<{ id: number; name: string }> {
  const held = gate;

  squadCalls.push('team:' + id);
  gate = undefined;

  if (held) {
    return held.then(() => ({ id, name: 'Team ' + id }));
  }

  return { id, name: 'Team ' + id };
}
`,
);
await write(
  "src/routes/squad/definition.ts",
  `import { defineRoute, numberParam } from '@loozo/angular-router';
import { team } from '../../squad-probes.js';

export default defineRoute('squads/$teamId', {
  params: { teamId: numberParam },
  resolve: {
    team: ({ params }) => team(params.teamId),
    label: () => 'squad label',
  },
});
`,
);
await write(
  "src/routes/squad/page.ts",
  `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { injectRoute } from './route.generated.js';

@Component({ imports: [RouterOutlet], template: '<h1 id="squad">{{ handle.data().team.name }}</h1><router-outlet />' })
export default class Squad {
  readonly handle = injectRoute();

  constructor() {
    (window as any).squad = this;
  }
}
`,
);
await write(
  "src/routes/squad-scope/definition.ts",
  `import { defineRoute } from '@loozo/angular-router';
import squad from '../squad/definition.js';

export default defineRoute('', { parent: squad, resolve: { scope: () => 'pathless scope' } });
`,
);
await write(
  "src/routes/squad-member/definition.ts",
  `import { defineRoute, numberParam } from '@loozo/angular-router';
import scope from '../squad-scope/definition.js';
import { squadCalls } from '../../squad-probes.js';

export default defineRoute('members/$memberId', {
  parent: scope,
  params: { memberId: numberParam },
  resolve: {
    member: ({ params }) => {
      squadCalls.push('member:' + params.teamId + '/' + params.memberId);
      return { teamId: params.teamId, id: params.memberId };
    },
    // Hides the team's label of the same name.
    label: () => 42,
  },
});
`,
);
await write(
  "src/routes/squad-member/page.ts",
  `import { Component, effect } from '@angular/core';
import { injectRoute } from './route.generated.js';

let instances = 0;

@Component({ template: '<p id="squad-member">{{ handle.data().team.name }} / {{ handle.data().member.id }}</p>' })
export default class SquadMember {
  readonly handle = injectRoute();
  readonly instance = ++instances;
  // Inherited data exists from the first, synchronous read.
  readonly first = { params: this.handle.params(), data: this.handle.data() };
  readonly seen: [any, any][] = [];

  constructor() {
    (window as any).squadMember = this;
    effect(() => {
      this.seen.push([this.handle.params(), this.handle.data()]);
    });
  }
}
`,
);

await write(
  "src/type-proof.ts",
  `import type { Signal } from '@angular/core';
import { injectRoute } from './routes/item/route.generated.js';
import { injectRoute as searchingRoute } from './routes/searching/route.generated.js';
import { injectRoute as squadRoute } from './routes/squad/route.generated.js';
import { injectRoute as squadMemberRoute } from './routes/squad-member/route.generated.js';
import { localSymbol } from './probes.js';

const handle = injectRoute();
const params = handle.params();
const team: number = params.teamId;
const id: number = params.id;
const data = handle.data();
const symbol: number = data[localSymbol];
const item: number = data.item;
// Inference is unchanged; documented native-loss availability is the explicit exception.
const prototype: number = data.__proto__;
const empty: undefined = data.empty;
const slow: number = data.slow;
const search: Signal<Readonly<{ score?: number }>> = handle.search;

// @ts-expect-error readonly local symbol binding
data[localSymbol] = 1;
// @ts-expect-error readonly signal, not writable
handle.search.set({ score: 1 });
// @ts-expect-error a signal, not a Resource
handle.params.hasValue();

const searching = searchingRoute();
const searched = searching.search();
const page: number = searched.page;
// @ts-expect-error A key without a fallback may be absent.
const sort: 'asc' | 'desc' = searched.sort;
// An array key always reads an array.
const tags: readonly ('a' | 'b' | 'c')[] = searched.tag;

// Every searching key may be omitted when writing a URL.
searching.link({});
searching.link({ search: { page: 2 } });
// @ts-expect-error A supplied fallback key keeps its codec type.
searching.link({ search: { page: '2' } });
searching.link({ search: { tag: ['a', 'a'] } });
searching.link({ search: { tag: [] } });
// @ts-expect-error An array key takes an array.
searching.link({ search: { tag: 'a' } });

// A member's data carries its ancestors' resolver results; its own key wins a collision.
const memberData = squadMemberRoute().data();
const teamName: string = memberData.team.name;
const label: number = memberData.label;
const scope: string = memberData.scope;
const memberId: number = memberData.member.id;
// @ts-expect-error No route in the chain resolves this key.
memberData.missing;
// The layout's own handle has only its own keys.
const squadLabel: string = squadRoute().data().label;
// @ts-expect-error A parent's data doesn't include its descendants' results.
squadRoute().data().member;
`,
);
await write(
  "src/proof.ts",
  `import { ApplicationRef, inject, provideEnvironmentInitializer } from '@angular/core';
import {
  Router, RedirectCommand, ActivationEnd, type ActivatedRouteSnapshot, type RouterStateSnapshot,
} from '@angular/router';
import {
  calls, inputs, localSymbol, leaves, allowLeave, failAfterMatching, prototypeResults, opaque,
  ancestry, usePromises, promiseConstructor, guardPromise, resolverPromise, finishGuard,
  finishResolver, promiseEntries, resolverCalls, matchEntries, activations, invalidErrors,
  decisionEntries, decideWith, holdResolver, slowEntries,
} from './probes.js';
import { holdTeam, squadCalls } from './squad-probes.js';
import { of } from 'rxjs';

const wait = (ms = 20) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function check(value: unknown, label: string): void {
  if (!value) {
    throw new Error(label);
  }
}

// Path values parse once while matching and once more for the activated route.
function parses(label: string): number {
  return calls.filter((value) => value === label).length;
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
  const unhandled: unknown[] = [];

  window.addEventListener('unhandledrejection', (event) => {
    unhandled.push(String(event.reason));
  });

  async function failure(url: string): Promise<unknown> {
    const before = router.url;

    try {
      await router.navigateByUrl(url);
    } catch (error) {
      check(router.url === before, 'failed navigation keeps the URL: ' + url);
      return error;
    }

    throw new Error('Navigation should fail: ' + url);
  }

  (window as any).lifecycleProof = async () => {
    // Registered before any handle exists, so it runs ahead of every handle's own listener.
    const atActivation: any[][] = [];
    const activation = router.events.subscribe((event) => {
      const item = (window as any).item;

      if (event instanceof ActivationEnd && item && event.snapshot === item.native.snapshot) {
        atActivation.push([item.handle.params(), item.handle.search(), item.handle.data()]);
      }
    });
    const blocked = router.config.find((route) => route.path === 'blocked')!;
    let deny!: (value: boolean) => void;

    blocked.canActivate = [() => new Promise<boolean>((resolve) => {
      deny = resolve;
    })];

    // Without activation callbacks, the handle parses on its first read.
    await router.navigateByUrl('/plain/6?score=1');
    const page = (window as any).plain;
    const params = page.handle.params;
    const search = page.handle.search;

    check(parses('id:6') === 1, 'only the matching parse before the first read');
    const first = params();

    check(first.id === 6 && search().score === 1, 'values on the first read');
    check(params() === first && parses('id:6') === 2, 'one handle parse per snapshot');
    check(Object.isFrozen(first) && Object.isFrozen(search()), 'shallow-frozen maps');

    const scope = page.connect();

    check(scope.handle.params() === first && parses('id:6') === 2, 'a second handle shares the parse');

    // A pending navigation keeps the committed values; cancellation leaves them unchanged.
    const pending = router.navigateByUrl('/blocked');

    await until(() => router.currentNavigation() !== null && typeof deny === 'function', 'blocked pending');
    await wait();
    check(params() === first && scope.handle.params() === first, 'pending navigation keeps values');
    deny(false);
    check((await pending) === false && params() === first, 'cancellation keeps values');

    // A failed navigation leaves them unchanged; Angular keeps its own rejection value.
    blocked.canActivate = [() => {
      throw 'native failure';
    }];
    let rejected: unknown;

    try {
      await router.navigateByUrl('/blocked');
    } catch (error) {
      rejected = error;
    }

    check(rejected === 'native failure' && params() === first, 'navigation error keeps values');
    await router.navigateByUrl(router.url);
    check(params() === first && parses('id:6') === 2, 'same-URL navigation keeps values');

    // Reusing the record with new path and query values updates every handle.
    await router.navigateByUrl('/plain/7?score=2');
    const second = params();

    check((window as any).plain === page, 'plain record reused');
    check(second.id === 7 && search().score === 2 && scope.handle.params() === second,
      'reused record publishes the new snapshot');
    await router.navigateByUrl('/plain/7?score=3');
    check(params().id === 7 && search().score === 3, 'query-only navigation updates search');

    // A destroyed handle stops following the route and keeps its last values.
    scope.destroy();
    await router.navigateByUrl('/plain/8');
    check(scope.handle.search().score === 3 && params().id === 8, 'destroyed handle released');
    check(!Object.hasOwn(search(), 'score'), 'missing search key is absent');

    // A nondeterministic path codec accepts while matching and rejects afterwards. Without
    // activation callbacks the navigation commits, and reading params or search throws.
    failAfterMatching('id:9');
    check(await router.navigateByUrl('/plain/9'), 'nondeterministic codec commits without callbacks');
    let readError: any;

    try {
      params();
    } catch (error) {
      readError = error;
    }

    check(readError instanceof Error, 'reading throws an Error');
    check(readError.source === 'path' && readError.key === 'id' && readError.reason === 'invalid' &&
      readError.cause.message === 'nondeterministic failure', 'reading throws the input error');
    check(Object.keys(page.handle.data()).length === 0, 'data is unaffected');
    await router.navigateByUrl('/plain/10');
    check(params().id === 10, 'a later navigation recovers');

    // Native component-first deactivation adds no parser demand.
    allowLeave(false);
    const beforeLeave = calls.length;
    const leaveDenied = await router.navigateByUrl('/');
    const args = leaves[leaves.length - 1];

    check(leaveDenied === false, 'native deactivation blocks');
    check(args[0] === (window as any).plain && args[1].params.id === '10' &&
      args[2].url === '/plain/10' && args[3].url === '/', 'native component-first deactivation args');
    check(calls.length === beforeLeave, 'deactivation adds no parser demand');
    allowLeave(true);
    await router.navigateByUrl('/');

    // The guard, title and resolvers share one parse and one inputs container, each entered
    // synchronously in the route's injection context. Own ordinary/symbol/undefined/opaque
    // results survive projection; accepted native __proto__ loss means absence.
    await router.navigateByUrl('/teams/7/items/8?score=44');
    await app.whenStable();
    const item = (window as any).item;
    const localData = item.handle.data();
    const nativeData = item.native.snapshot.data;
    const shared = inputs[0];

    check(inputs.length === 5, 'guard plus title and ordinary/prototype/symbol resolvers');
    check(document.title === 'Item 8', 'title callback resolves from parsed inputs');
    for (const value of inputs) {
      check(value === shared, 'public inputs shared');
    }
    check(Object.isFrozen(shared) && Object.isFrozen(shared.params) &&
      Object.isFrozen(shared.search), 'shallow input maps frozen');
    check(parses('item:8') === 2, 'one matching parse, then one activation parse for every reader');
    check(item.first.params === shared.params && item.first.search === shared.search,
      'constructor reads share the activation parse');
    check(item.first.params.teamId === 7 && item.first.params.id === 8 &&
      item.first.search.score === 44 && item.first.data.item === 8, 'committed values in the constructor');
    check(localData[localSymbol] === 8, 'local symbol resolver projected');
    check(Object.hasOwn(localData, 'empty') && localData.empty === undefined, 'own undefined retained');
    check(localData.opaque === opaque && nativeData.opaque === opaque, 'opaque identity retained');
    check(!Object.isFrozen(opaque) && !Object.isFrozen(opaque.nested), 'opaque not recursively frozen');
    check(prototypeResults.length === 1 && prototypeResults[0] === 8, 'prototype callback returned8');
    check(!Object.hasOwn(nativeData, '__proto__'), 'native prototype resolver result not retained');
    check(!Object.hasOwn(localData, '__proto__') && localData.__proto__ === undefined,
      'missing native result is not fabricated');

    // While a resolver delays the next navigation, all three keep the committed values.
    // When it commits, they change together, from the one new snapshot.
    const settled = [item.handle.params(), item.handle.search(), item.handle.data()];
    const open = holdResolver();

    atActivation.length = 0;
    item.notified.length = 0;
    const next = router.navigateByUrl('/teams/7/items/9?score=45');

    await until(() => slowEntries.includes(9), 'delayed resolver entered');
    await wait();
    check(router.currentNavigation() !== null, 'Angular reports the pending navigation');
    check(item.handle.params() === settled[0] && item.handle.search() === settled[1] &&
      item.handle.data() === settled[2], 'pending navigation keeps params, search and data');
    open();
    check(await next, 'delayed navigation commits');
    activation.unsubscribe();
    await app.whenStable();
    check((window as any).item === item, 'item record reused');
    const [[activatedParams, activatedSearch, activatedData]] = atActivation;

    check(atActivation.length === 1 && activatedParams.id === 9 && activatedSearch.score === 45 &&
      activatedData.item === 9 && activatedData.slow === 9, 'committed values change together');
    check(JSON.stringify(item.notified) === JSON.stringify([
      ['queryParams', { teamId: 7, id: 9 }, { score: 45 }],
      ['params', { teamId: 7, id: 9 }, { score: 45 }],
    ]), 'native subscribers read the committed values ' + JSON.stringify(item.notified));
    check(document.title === 'Item 9', 'title callback reruns with the resolvers');
    for (const [seenParams, seenSearch, seenData] of item.seen) {
      check(seenParams.id === seenData.item &&
        seenSearch.score === (seenParams.id === 8 ? 44 : 45), 'effects only see whole snapshots');
    }

    // With activation callbacks, a nondeterministic path failure fails the navigation before them.
    const entered = inputs.length;

    failAfterMatching('item:12');
    const activationError: any = await failure('/teams/7/items/12?score=45');

    check(activationError instanceof Error, 'activation parse error is an Error');
    check(activationError.source === 'path' && activationError.key === 'id' &&
      inputs.length === entered, 'activation parse error precedes callbacks');
    check(item.handle.params().id === 9, 'failed navigation keeps item values');

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
      const answerData = answer.handle.data();
      const nativeAnswer = answer.native.snapshot.data.answer;

      check(resolved && answerData.answer === 17 && nativeAnswer === 17, 'native/public resolved17, not Promise');
      promiseResults.push({ foreign, guard, answer: answerData.answer });
    }
    iframe.remove();
    check(promiseEntries.length === 4, 'both realm callback pairs entered');
    for (const entry of promiseEntries) {
      check(entry === 'promise entry', 'Promise callback native DI');
    }


    // The preserve policy copies the query text without parsing the destination's search.
    await router.navigateByUrl('/');
    check(await router.navigateByUrl('/alias/13?score=45&extra=1'), 'preserve redirect commits');
    check(router.url === '/preserved/13?score=45&extra=1', 'preserved query text ' + router.url);

    // A redirect source has no matching guard: an invalid mapped param fails the navigation.
    const sourceError: any = await failure('/alias/x?score=45');

    check(sourceError instanceof Error, 'invalid redirect source param is an Error');
    check(sourceError.source === 'path' && sourceError.key === 'id',
      'invalid redirect source param is a navigation error');

    const thenableRedirect: any = await failure('/thenable-alias/1');

    check(thenableRedirect instanceof TypeError, 'thenable redirect source is a TypeError');

    await router.navigateByUrl('/');
    blocked.canActivate = undefined;
    blocked.canMatch = [() => new RedirectCommand(router.parseUrl('/'))];
    const nativeSameUrlRedirect = await router.navigateByUrl('/blocked');

    check(nativeSameUrlRedirect === false, 'native sameURL redirect returns false');
    blocked.canMatch = undefined;
    await wait(30);
    check(unhandled.length === 0, 'no unhandled rejections ' + JSON.stringify(unhandled));

    return {
      calls, guardResolverShared: true, symbolData: true, unhandled,
      nativePrototypeResolverResultNotRetained: true, nativeSameUrlRedirect,
      prototypeCallbackResult: prototypeResults[0], prototypeHandleAbsent: true,
      nearestDeclaringParent: selectedParent.inputs.params.teamId, ancestryFailures,
      promiseResults, constructorValues: item.first, atActivation,
    };
  };

  (window as any).ancestorProof = async () => {
    async function visit(url: string): Promise<void> {
      const navigated = await router.navigateByUrl(url);

      check(navigated === true, 'navigated ' + url);
      await app.whenStable();
    }

    await visit('/squads/1/members/5');
    const member = (window as any).squadMember;
    const squad = (window as any).squad;
    const first = member.first;

    check(first.params.teamId === 1 && first.params.memberId === 5, 'constructor params');
    check(first.data.team.id === 1 && first.data.team.name === 'Team 1' && first.data.member.id === 5,
      'the constructor read has the ancestor and own data');
    check(first.data.scope === 'pathless scope', 'a pathless ancestor contributes its resolver data');
    check(first.data.label === 42, 'the nearer resolver key wins a collision');
    check(Object.isFrozen(first.data) && Object.getPrototypeOf(first.data) === null,
      'frozen null-prototype data');
    check(JSON.stringify(Reflect.ownKeys(squad.handle.data())) === JSON.stringify(['team', 'label']) &&
      squad.handle.data().label === 'squad label', 'the layout handle has its own keys only');

    // A pending ancestor resolver keeps the committed values.
    const settled = [member.handle.params(), member.handle.data()];
    const open = holdTeam();
    const next = router.navigateByUrl('/squads/2/members/5');

    await until(() => squadCalls.includes('team:2'), 'team resolver entered');
    await wait();
    check(router.currentNavigation() !== null, 'Angular reports the pending navigation');
    check(member.handle.params() === settled[0] && member.handle.data() === settled[1],
      'pending ancestor resolver keeps params and data');
    open();
    check(await next, 'ancestor-param navigation commits');
    await app.whenStable();

    const changed = member.handle.data();

    check((window as any).squadMember === member, 'member record reused');
    check(member.handle.params().teamId === 2 && changed.team.id === 2 && changed.member.teamId === 2,
      'the ancestor param change reaches the inherited data');
    check(document.getElementById('squad-member')!.textContent === 'Team 2 / 5', 'rendered team 2');

    // A child-param-only navigation keeps the team and changes the member.
    await visit('/squads/2/members/6');
    const moved = member.handle.data();

    check((window as any).squadMember === member && moved.team === changed.team,
      'the team result stays when only the child param changes');
    check(moved.member.id === 6 && member.handle.params().memberId === 6, 'own data follows the child param');
    for (const [params, data] of member.seen) {
      check(params.teamId === data.team.id && params.teamId === data.member.teamId &&
        params.memberId === data.member.id, 'effects never see a mixed tuple ' + JSON.stringify(member.seen));
    }

    return {
      first: { params: first.params, data: { ...first.data } },
      changed: { ...changed },
      moved: { ...moved },
      squad: { ...squad.handle.data() },
      calls: squadCalls,
      seen: member.seen.length,
    };
  };

  (window as any).matchingProof = async () => {
    const shown = (id: string) => document.getElementById(id) !== null;

    async function visit(url: string): Promise<void> {
      const navigated = await router.navigateByUrl(url);

      check(navigated === true, 'navigated ' + url);
      await app.whenStable();
    }

    // An invalid local param doesn't match: Angular backtracks to the root catchall.
    await visit('/kinds/c');
    check(shown('missing') && !shown('kind'), 'invalid enum reaches the root catchall');
    check(resolverCalls.length === 0, 'resolver never sees an invalid enum');
    await visit('/kinds/a');
    check(shown('kind') && resolverCalls.join() === 'a', 'valid enum activates with its resolver');

    // The closest catchall wins.
    await visit('/shop/abc');
    check(shown('shop-missing') && !shown('missing'), 'nested catchall preferred');
    await visit('/shop/4');
    check(shown('shop-item'), 'valid nested param');

    // onInvalidParams: false falls through; the handler gets the path error in DI context.
    decideWith(() => false);
    await visit('/decided/x');
    const invalid = invalidErrors[0];

    check(shown('missing'), 'handler false falls through');
    check(invalid instanceof Error, 'handler receives an Error');
    check(invalid.source === 'path' && invalid.key === 'id' &&
      invalid.reason === 'invalid' && invalid.cause.message === 'Expected a finite number',
      'handler receives the path input error');
    check(decisionEntries.join() === 'decided entry', 'handler runs in the route injection context');

    decideWith(() => new RedirectCommand(router.parseUrl('/kinds/b')));
    await visit('/decided/y');
    check(router.url === '/kinds/b' && shown('kind'), 'handler RedirectCommand redirects');
    decideWith(() => of(router.parseUrl('/kinds/a')));
    await visit('/decided/z');
    check(router.url === '/kinds/a', 'handler Observable UrlTree redirects');

    // Invalid params can't match: true, however delivered, fails the navigation.
    const truthy = [() => true, () => Promise.resolve(true), () => of(true), () => undefined];

    for (const decision of truthy) {
      decideWith(decision);
      const error = await failure('/decided/x');

      check(error instanceof TypeError, 'handler true or unknown result is a navigation error');
    }

    const thrown = new Error('handler failure');

    for (const decision of [() => { throw thrown; }, () => Promise.reject(thrown)]) {
      decideWith(decision);
      const error = await failure('/decided/x');

      check(error === thrown, 'handler throw/rejection is the navigation error');
    }

    const decisions = invalidErrors.length;

    await visit('/decided/5');
    check(shown('decided') && invalidErrors.length === decisions, 'valid params skip the handler');

    // A thenable parse result is a programming error, not invalid input: the navigation fails
    // with a TypeError instead of falling through to the catchall or reaching onInvalidParams.
    await visit('/kinds/a');
    const thenablePath: any = await failure('/thenable/1');

    check(thenablePath instanceof TypeError && /synchronously/.test(thenablePath.message),
      'thenable path codec fails the navigation with a TypeError');
    check(shown('kind') && !shown('missing') && !shown('thenable'), 'no fall-through to the catchall');
    check(invalidErrors.length === decisions, 'onInvalidParams not called for a thenable');

    // A thenable search value fails too, rather than reading as absent; the guard isn't entered.
    const thenableSearch: any = await failure('/thenable-search?q=1');

    check(thenableSearch instanceof TypeError && activations.length === 0,
      'thenable search codec fails before the guard');
    await visit('/thenable-search');
    check(shown('thenable-search') && activations.length === 1 &&
      !Object.hasOwn(activations[0].search, 'q'), 'a missing value never calls the parser');

    // Without any authored callback, the generated matching guard still parses search, so the
    // navigation fails and the committed route stays, from another route or query-only.
    await visit('/kinds/a');
    const thenablePlain: any = await failure('/thenable-plain?q=1');

    check(thenablePlain instanceof TypeError && /synchronously/.test(thenablePlain.message),
      'thenable search fails a route without callbacks');
    check(shown('kind') && !shown('thenable-plain'), 'the prior route stays');
    await visit('/thenable-plain');
    const queryOnly: any = await failure('/thenable-plain?q=2');

    check(queryOnly instanceof TypeError && shown('thenable-plain'),
      'a query-only thenable search fails and keeps the route');
    await visit('/thenable-query/1');
    const reused = (window as any).thenableQuery;
    const thenableQuery: any = await failure('/thenable-query/1?q=3');

    check(thenableQuery instanceof TypeError && (window as any).thenableQuery === reused,
      'a query-only thenable search fails a path route without callbacks');
    check(reused.handle.params().id === 1 && !Object.hasOwn(reused.handle.search(), 'q'),
      'the committed values stay');
    check(invalidErrors.length === decisions, 'onInvalidParams not called for a thenable search');

    // User canMatch callbacks aren't entered for invalid path params, and don't error.
    await visit('/matched/x?q=1');
    check(shown('missing') && matchEntries.length === 0, 'user canMatch not entered for invalid path');
    check(!calls.includes('query:1'), 'a candidate ruled out by its path runs no search codecs');

    // Search never fails: a missing key is absent for the matching callback too.
    await visit('/matched/3');
    const [missingQuery] = matchEntries;

    check(shown('matched') && matchEntries.length === 1 && missingQuery.params.id === 3 &&
      !Object.hasOwn(missingQuery.search, 'q'), 'missing search is absent while matching');
    check(parses('matched:3') === 1, 'generated and user guards share one path parse');
    await visit('/matched/4?q=1');
    const entry = matchEntries[1];

    check(matchEntries.length === 2 && entry.params.id === 4 && entry.search.q === 1,
      'user canMatch receives path and search');

    // Search never fails: absent without a fallback, the fallback otherwise.
    const searches: Record<string, unknown>[] = [];

    for (const url of [
      '/searching?sort=bad&page=x',
      '/searching?sort=asc&sort=desc&page=1&page=2',
      '/searching',
      '/searching?sort=desc&page=3',
    ]) {
      await visit(url);
      const page = (window as any).searching;
      const resolved = page.native.snapshot.data.search;
      const handled = page.handle.search();

      check(resolved === handled, 'resolver and handle share the parse ' + url);
      searches.push(handled);
    }

    check(JSON.stringify(searches) === JSON.stringify([
      { page: 1, tag: [] }, { page: 1, tag: [] }, { page: 1, tag: [] }, { sort: 'desc', page: 3, tag: [] },
    ]), 'search recovery ' + JSON.stringify(searches));
    check(!Object.hasOwn(searches[0], 'sort'), 'recovered key is absent');

    // An array key reads every repeated value in URL order; a missing key, or one
    // with any invalid value, reads []. Scalar keys still read a repeated value as absent.
    const lists: unknown[] = [];

    for (const url of [
      '/searching?tag=a&tag=b&sort=asc&sort=desc',
      '/searching?tag=c',
      '/searching?tag=b&tag=b&tag=a',
      '/searching?tag=a&tag=zzz',
      '/searching?tag=',
      '/searching-preserve?tag=c&tag=a&page=4&other=1&other=2',
      '/searching-replace?tag=c',
      '/searching-replace-empty?tag=c',
    ]) {
      await visit(url);
      const page = (window as any).searching;
      const handled = page.handle.search();

      check(page.native.snapshot.data.search === handled, 'resolver and handle share the list ' + url);
      check(Object.isFrozen(handled.tag), 'array value is frozen ' + url);
      lists.push({ url: router.url, search: handled });
    }

    check(JSON.stringify(lists) === JSON.stringify([
      { url: '/searching?tag=a&tag=b&sort=asc&sort=desc', search: { page: 1, tag: ['a', 'b'] } },
      { url: '/searching?tag=c', search: { page: 1, tag: ['c'] } },
      { url: '/searching?tag=b&tag=b&tag=a', search: { page: 1, tag: ['b', 'b', 'a'] } },
      { url: '/searching?tag=a&tag=zzz', search: { page: 1, tag: [] } },
      { url: '/searching?tag=', search: { page: 1, tag: [] } },
      { url: '/searching?tag=c&tag=a&page=4&other=1&other=2', search: { page: 4, tag: ['c', 'a'] } },
      { url: '/searching?page=2&tag=b&tag=a&tag=b', search: { page: 2, tag: ['b', 'a', 'b'] } },
      { url: '/searching', search: { page: 1, tag: [] } },
    ]), 'array search ' + JSON.stringify(lists));

    // Links and navigation write one pair per element, and nothing for [].
    const list = (window as any).searching;
    const linked = router.serializeUrl(list.handle.link({ search: { tag: ['c', 'a'], sort: 'asc' } }));

    check(linked === '/searching?sort=asc&tag=c&tag=a', 'array link ' + linked);
    check(router.serializeUrl(list.handle.link({ search: { tag: [] } })) === '/searching',
      'empty array link');
    check(await list.handle.navigate({ search: { tag: ['b', 'c'] } }) === true, 'array navigation');
    await app.whenStable();
    check(router.url === '/searching?tag=b&tag=c', 'array navigation URL ' + router.url);
    check(JSON.stringify(list.handle.search().tag) === '["b","c"]', 'array navigation reads the list');
    await wait(30);
    check(unhandled.length === 0, 'no unhandled rejections ' + JSON.stringify(unhandled));

    return { searches, lists, decisions, matchEntries: matchEntries.length };
  };
});
`,
);

// The active route: a shell reading the deepest route, page constructors reading during
// activation, and scoped readers created mid-navigation. Its pages run only in their own
// tabs, so the proofs above keep their parse counts.
await write(
  "src/active-probes.ts",
  `import { Injector, inject, runInInjectionContext, type Signal } from '@angular/core';
import { Router } from '@angular/router';
import { injectActiveRoute, type ActiveRoute } from '../generated/destinations.generated.js';
import { destination as crew } from './routes/crew/route.generated.js';
import { destination as task } from './routes/task/route.generated.js';
import { destination as good } from './routes/good/route.generated.js';
import { destination as frame } from './routes/frame/route.generated.js';
import { destination as part } from './routes/part/route.generated.js';
import { destination as stem } from './routes/stem/route.generated.js';
import { destination as leaf } from './routes/leaf/route.generated.js';
import { destination as gate } from './routes/gate/route.generated.js';
import { destination as crash } from './routes/crash/route.generated.js';

export const destinations = { crew, task, good, frame, part, stem, leaf, gate, crash };

// The destination name a route is(), and its params and chain names.
export function describe(route: ActiveRoute | undefined) {
  if (!route) {
    return null;
  }

  const names = (entry: ActiveRoute) =>
    Object.entries(destinations).filter(([, destination]) => entry.is(destination)).map(([name]) => name);

  return { route: names(route).join(), params: route.params(), chain: route.chain.map((entry) => names(entry).join()) };
}

let held: Promise<void> | undefined;
let release: (() => void) | undefined;
let guarded: ((value: boolean) => void) | undefined;

// Holds the next task resolver until releaseTask() runs.
export function holdTask() {
  held = new Promise<void>((resolve) => {
    release = resolve;
  });
}

export function releaseTask() {
  release!();
}

export const taskEntries: number[] = [];

export function taskValue({ params }: { params: { taskId: number } }): number | Promise<number> {
  const waiting = held;

  held = undefined;
  taskEntries.push(params.taskId);

  if (waiting) {
    return waiting.then(() => params.taskId);
  }

  return params.taskId;
}

export function gateGuard(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    guarded = resolve;
  });
}

export function openGate(value: boolean) {
  guarded!(value);
}

export function gatePending() {
  return guarded !== undefined;
}

export function brokenResolver(): number {
  throw new Error('deliberate resolver failure');
}

// Page constructors: each holds its own reader, first read during activation.
export const constructed: {
  name: string;
  during: boolean;
  first: ReturnType<typeof describe>;
  reader: Signal<ActiveRoute | undefined>;
}[] = [];

// A reader with no live consumer, read again in the next page constructor once armed.
export const idle: {
  reader: Signal<ActiveRoute | undefined> | undefined;
  armed: boolean;
  during: boolean;
  read: ReturnType<typeof describe>;
} = { reader: undefined, armed: false, during: false, read: null };

export function pageReader(name: string): Signal<ActiveRoute | undefined> {
  const reader = injectActiveRoute();
  const during = inject(Router).currentNavigation() !== null;

  constructed.push({ name, during, first: describe(reader()), reader });

  if (idle.armed) {
    idle.armed = false;
    idle.during = during;
    idle.read = describe(idle.reader!());
  }

  return reader;
}

// The crash page's reader outlives its component, which never finishes construction.
export let crashReader: Signal<ActiveRoute | undefined> | undefined;
export let crashFirst: unknown = 'unread';

export function crashed(injector: Injector) {
  const scope = Injector.create({ parent: injector, providers: [] });

  crashReader = runInInjectionContext(scope, injectActiveRoute);
  crashFirst = describe(crashReader());
  throw new Error('deliberate activation failure');
}
`,
);

const activePage = (name, outlet = false) => `import { Component } from '@angular/core';
${outlet ? "import { RouterOutlet } from '@angular/router';\n" : ""}import { pageReader } from '../../active-probes.js';

@Component({ ${outlet ? "imports: [RouterOutlet], " : ""}template: '<p id="page-${name}">${name}</p>${outlet ? "<router-outlet />" : ""}' })
export default class Page {
  readonly reader = pageReader('${name}');
}
`;
const activeRoutes = {
  crew: ["defineRoute('crews/$crewId', { params: { crewId: numberParam } })", true],
  task: [
    "defineRoute('tasks/$taskId', { parent: crew, params: { taskId: numberParam }, search: { q: numberParam }, runGuardsAndResolvers: 'paramsOrQueryParamsChange', resolve: { value: taskValue } })",
    false,
  ],
  good: ["defineRoute('goods/$goodId', { params: { goodId: numberParam } })", false],
  // A page-less layout, deepest at its own URL.
  frame: ["defineRoute('frames/$frameId', { params: { frameId: numberParam } })"],
  part: ["defineRoute('parts/$partId', { parent: frame, params: { partId: numberParam } })", false],
  stem: ["defineRoute('stems/$stemId', { params: { stemId: numberParam } })", true],
  leaf: ["defineRoute('', { parent: stem })", false],
  gate: ["defineRoute('gate', { canActivate: [gateGuard] })", false],
  broken: ["defineRoute('broken', { resolve: { value: brokenResolver } })", false],
};

for (const [name, [declaration, outlet]] of Object.entries(activeRoutes)) {
  let imports =
    "import { defineRoute, numberParam } from '@loozo/angular-router';\nimport { taskValue, gateGuard, brokenResolver } from '../../active-probes.js';\n";

  for (const parent of ["crew", "frame", "stem"]) {
    if (declaration.includes(`parent: ${parent}`)) {
      imports += `import ${parent} from '../${parent}/definition.js';\n`;
    }
  }

  await write(`src/routes/${name}/definition.ts`, `${imports}export default ${declaration};\n`);

  if (outlet !== undefined) {
    await write(`src/routes/${name}/page.ts`, activePage(name, outlet));
  }
}

await write(
  "src/routes/crash/definition.ts",
  "import { defineRoute } from '@loozo/angular-router';\nexport default defineRoute('crash', {});\n",
);
await write(
  "src/routes/crash/page.ts",
  `import { Component, Injector, inject } from '@angular/core';
import { crashed } from '../../active-probes.js';

@Component({ template: '<p id="crash">crash</p>' })
export default class Crash {
  constructor() {
    crashed(inject(Injector));
  }
}
`,
);
// A child of the crew whose constructor fails activation after Angular advanced the crew.
await write(
  "src/routes/fail/definition.ts",
  "import { defineRoute } from '@loozo/angular-router';\nimport crew from '../crew/definition.js';\nexport default defineRoute('fail', { parent: crew });\n",
);
await write(
  "src/routes/fail/page.ts",
  `import { Component } from '@angular/core';

@Component({ template: '<p id="fail">fail</p>' })
export default class Fail {
  constructor() {
    throw new Error('deliberate child activation failure');
  }
}
`,
);
await write(
  "src/native.ts",
  "import { Component } from '@angular/core';\n\n@Component({ template: '<p id=\"native\">native</p>' })\nexport default class Native {}\n",
);

// The shell's reader exists before the initial navigation. Its template renders only in
// the active tabs, so the proofs above add no parse demand.
await write(
  "src/shell.ts",
  `import { Component, Injector, computed, effect, inject, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { injectActiveRoute } from '../generated/destinations.generated.js';
import { describe, destinations } from './active-probes.js';

@Component({
  selector: 'proof-app',
  imports: [RouterOutlet],
  template: \`
    @if (shown) {
      <p id="active-crew">{{ crewId() }}</p>
      <p id="active-params">{{ paramsText() }}</p>
    }
    <router-outlet />
  \`,
})
export default class Shell {
  readonly shown = (window as any).activeShell === true;
  readonly router = inject(Router);
  readonly injector = inject(Injector);
  // Registered before the reader exists.
  readonly atEnd: unknown[] = [];
  readonly early = this.router.events.subscribe((event) => {
    if (this.shown && event instanceof NavigationEnd) {
      this.atEnd.push({ url: event.urlAfterRedirects, active: describe(this.active()) });
    }
  });
  readonly active = injectActiveRoute();
  readonly initial = this.active();
  readonly crewId = computed(() => this.active()?.chain.find((route) => route.is(destinations.crew))?.params().crewId);
  readonly paramsText = computed(() => JSON.stringify(this.active()?.params() ?? null));
  // Each change of the selected handle, and every crew/params pair an effect sees.
  readonly emissions: unknown[] = [];
  readonly seen: [unknown, unknown][] = [];

  constructor() {
    (window as any).shell = this;

    if (this.shown) {
      effect(() => {
        const active = this.active();

        untracked(() => this.emissions.push(active));
      });
      effect(() => {
        this.seen.push([this.crewId(), this.active()?.params()]);
      });
    }
  }
}
`,
);

await write(
  "src/active-proof.ts",
  `import { ApplicationRef, Injector, inject, provideEnvironmentInitializer, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { injectActiveRoute } from '../generated/destinations.generated.js';
import {
  constructed, crashFirst, crashReader, describe, destinations, gatePending, holdTask, idle, openGate,
  releaseTask, taskEntries,
} from './active-probes.js';

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

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export const activeProofProvider = provideEnvironmentInitializer(() => {
  const router = inject(Router);
  const app = inject(ApplicationRef);
  const environment = inject(Injector);

  function primary(): ActivatedRoute[] {
    const chain: ActivatedRoute[] = [];
    let route: ActivatedRoute | null = router.routerState.root;

    while (route) {
      chain.push(route);
      route = route.firstChild;
    }

    return chain;
  }

  // Subscribers of each live route's observables, and of the router's events.
  function subscribers() {
    const routes = primary().map((route) =>
      ['params', 'queryParams', 'fragment', 'url', 'data'].map((key) => (route as any)[key].observers.length),
    );

    return { routes, events: (router.events as any).observers.length };
  }

  // A reader in its own injection context, destroyed on demand.
  function reader() {
    const scope = Injector.create({ parent: environment, providers: [] });

    return { read: runInInjectionContext(scope, injectActiveRoute), destroy: () => scope.destroy() };
  }

  (window as any).activeDirectProof = async () => {
    await until(() => router.lastSuccessfulNavigation() !== null && router.currentNavigation() === null, 'initial navigation');
    await app.whenStable();

    const shell = (window as any).shell;

    return {
      initial: shell.initial === undefined,
      atEnd: shell.atEnd,
      constructed: constructed.map(({ name, during, first, reader }) => ({ name, during, first, settled: describe(reader()) })),
    };
  };

  (window as any).activeProof = async () => {
    const shell = (window as any).shell;
    const { crew, task, good } = destinations;
    const steps: unknown[] = [];

    // Pages constructed by the navigation, with what their readers read first and once settled.
    function pages(from: number) {
      return constructed.slice(from).map(({ name, during, first, reader }) => ({ name, during, first, settled: describe(reader()) }));
    }

    async function visit(url: string) {
      const before = shell.emissions.length;
      const created = constructed.length;
      const navigated = await router.navigateByUrl(url);

      await app.whenStable();
      await wait();
      check(navigated === true, 'navigated ' + url);

      const step = {
        url,
        active: describe(shell.active()),
        emitted: shell.emissions.length - before,
        dom: [document.getElementById('active-crew')!.textContent, document.getElementById('active-params')!.textContent],
        atEnd: shell.atEnd.at(-1),
        pages: pages(created),
      };

      steps.push(step);

      return step;
    }

    await until(() => router.lastSuccessfulNavigation() !== null && router.currentNavigation() === null, 'initial navigation');
    await app.whenStable();
    check(shell.initial === undefined, 'the shell reads undefined before the initial navigation');

    // The shell scenario: handles are reused while their ActivatedRoute stays active.
    const first = shell.active();
    const crewRoute = primary()[1];

    check(first.is(crew) && first.chain.length === 1 && first.chain[0] === first, 'a parent is deepest at its own URL');
    await visit('/crews/7/tasks/9');
    const taskHandle = shell.active();
    const taskRoute = primary()[2];

    check(primary()[1] === crewRoute && taskHandle.chain[0] === first, 'the crew handle stays when a child activates');

    // A scoped reader adds one subscription per route observable and one event listener per
    // entry, and destroying it removes them, while Angular keeps reusing the routes.
    const baseline = subscribers();
    const scoped = reader();
    const scopedHandle = scoped.read()!;
    const seeded = subscribers();

    scoped.destroy();
    const released = subscribers();

    check(scopedHandle !== taskHandle && scopedHandle.is(task), 'each reader has its own handles');
    await visit('/crews/7/tasks/10');
    check(shell.active() === taskHandle && primary()[2] === taskRoute && taskHandle.chain[0] === first,
      'reused routes keep their handles');

    const destroyed = describe(scopedHandle);

    await visit('/goods/1');
    const departed = ['params', 'queryParams', 'fragment', 'url', 'data'].map((key) => (taskRoute as any)[key].observers.length);
    const exited = describe(taskHandle);

    await visit('/crews/7');
    const reentered = shell.active();

    check(reentered !== first && reentered.is(crew), 'reentering creates a new handle');
    await visit('/crews/8/tasks/9');
    check(shell.active().chain[0] === reentered, 'the crew handle stays when its own param changes');
    const reused = shell.active();

    await visit('/crews/9/tasks/10');
    check(shell.active() === reused, 'one handle when the parent and child params both change');

    // A pending resolver: the shell keeps its route; a fresh reader reads the committed route.
    const committed = describe(shell.active());
    const success = router.lastSuccessfulNavigation();

    holdTask();
    const pending = router.navigateByUrl('/crews/9/tasks/11?q=3');

    await until(() => taskEntries.includes(11), 'task resolver entered');
    await wait();
    check(router.currentNavigation() !== null, 'the resolver navigation is pending');
    const resolverReader = reader();
    const whileResolving = {
      shell: describe(shell.active()),
      fresh: describe(resolverReader.read()),
      success: router.lastSuccessfulNavigation() === success,
    };
    const resolverHandle = resolverReader.read();

    releaseTask();
    check(await pending, 'the held navigation commits');
    await app.whenStable();
    const afterResolving = { shell: describe(shell.active()), fresh: describe(resolverReader.read()) };
    const resolverReused = resolverReader.read() === resolverHandle;

    resolverReader.destroy();

    // A pending guard, then cancellation.
    const beforeGate = describe(shell.active());
    const gateSuccess = router.lastSuccessfulNavigation();
    const gated = router.navigateByUrl('/gate');

    await until(gatePending, 'gate guard entered');
    await wait();
    const guardReader = reader();
    const whileGuarded = { shell: describe(shell.active()), fresh: describe(guardReader.read()) };

    openGate(false);
    const gateResult = await gated;

    await app.whenStable();
    const afterCancel = { shell: describe(shell.active()), fresh: describe(guardReader.read()) };

    guardReader.destroy();

    // A failed resolver and a same-URL skip leave everything as it was.
    let failure: unknown;

    try {
      await router.navigateByUrl('/broken');
    } catch (error) {
      failure = String(error);
    }

    await app.whenStable();
    const afterFailure = describe(shell.active());

    await router.navigateByUrl(router.url);
    await app.whenStable();
    const afterSkip = describe(shell.active());
    const unchanged = router.lastSuccessfulNavigation() === gateSuccess;

    // A page-less layout, its child, a pathless child, then a native route.
    await visit('/frames/2');
    await visit('/frames/2/parts/3');
    await visit('/stems/4');
    await visit('/native');
    const linked = router.serializeUrl(taskHandle.link({ params: { crewId: 7, taskId: 12 } }));

    // Activation fails after Angular replaced the router state: a reader first read in the
    // failing constructor reads undefined and follows what commits next.
    let activationError: unknown;

    try {
      await router.navigateByUrl('/crash');
    } catch (error) {
      activationError = String(error);
    }

    await app.whenStable();
    const afterCrash = { url: router.url, reader: describe(crashReader!()), shell: describe(shell.active()) };
    const lateReader = reader();
    const late = describe(lateReader.read());

    lateReader.destroy();
    await visit('/crews/5');
    const recovered = describe(crashReader!());

    // A reader with no live consumer, read at /crews/5 and not at the /goods/2 commit, reads
    // that commit when first read again in a constructor during the /crews/6 activation. Its
    // departed crew entry is released at the commit.
    const idleScope = reader();

    idle.reader = idleScope.read;
    const idleAtCrew = describe(idleScope.read());
    const idleCrewRoute = primary()[1];

    await router.navigateByUrl('/goods/2');
    await app.whenStable();
    const idleDeparted = ['params', 'queryParams', 'fragment', 'url', 'data'].map((key) => (idleCrewRoute as any)[key].observers.length);

    idle.armed = true;
    await router.navigateByUrl('/crews/6');
    await app.whenStable();
    const idleResult = { atCrew: idleAtCrew, departed: idleDeparted, armed: idle.armed, during: idle.during, read: idle.read, settled: describe(idleScope.read()) };

    idleScope.destroy();

    // A child constructor fails after Angular advanced the reused crew: the crew handle reads
    // the new crewId next to the selected task's old params until the next commit.
    await router.navigateByUrl('/crews/7/tasks/9');
    await app.whenStable();
    const seenBeforeFail = shell.seen.length;
    const beforeFail = describe(shell.active());
    let failError: unknown;

    try {
      await router.navigateByUrl('/crews/8/fail');
    } catch (error) {
      failError = String(error);
    }

    await app.whenStable();
    await wait();
    const failReader = reader();
    const afterFail = {
      url: router.url,
      active: describe(shell.active()),
      crew: shell.active()?.chain[0].params(),
      dom: [document.getElementById('active-crew')!.textContent, document.getElementById('active-params')!.textContent],
      fresh: describe(failReader.read()),
    };

    failReader.destroy();
    await router.navigateByUrl('/goods/3');
    await app.whenStable();
    const afterFailCommit = {
      active: describe(shell.active()),
      dom: [document.getElementById('active-crew')!.textContent, document.getElementById('active-params')!.textContent],
    };

    return {
      steps,
      seen: shell.seen.slice(0, seenBeforeFail),
      failSeen: shell.seen.slice(seenBeforeFail),
      subscribers: { baseline, seeded, released, departed },
      destroyed,
      exited,
      exitedAfter: describe(taskHandle),
      linked,
      pending: { committed, whileResolving, afterResolving, resolverReused },
      guard: { beforeGate, whileGuarded, gateResult, afterCancel },
      failure,
      afterFailure,
      afterSkip,
      unchanged,
      crash: { activationError, first: crashFirst, afterCrash, late, recovered },
      idle: idleResult,
      childFailure: { beforeFail, failError, afterFail, afterFailCommit },
    };
  };
});
`,
);

const main = await readFile(join(fixture, "src/main.ts"), "utf8");

await write(
  "src/main.ts",
  `import { proofProvider } from './proof.js';\nimport { activeProofProvider } from './active-proof.js';\n${main.replace(
    "provideRouter(routes)",
    "provideRouter([{ path: 'native', loadComponent: () => import('./native.js') }, ...routes]), proofProvider, activeProofProvider",
  )}`,
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
    headless: true,
    args: ["--no-sandbox"],
  });

  const tab = await browser.newPage();
  const errors = [];

  tab.on("pageerror", (error) => errors.push(String(error)));
  await tab.goto(output.baseUrl);
  await tab.waitForFunction(() => typeof window.lifecycleProof === "function");

  const result = await tab.evaluate(() => window.lifecycleProof());
  const matching = await tab.evaluate(() => window.matchingProof());
  const ancestors = await tab.evaluate(() => window.ancestorProof());

  // The active route, each run in a fresh application: a shell scenario from /crews/7, and a
  // direct load of a child URL.
  const active = {};

  for (const [name, path, proof] of [
    ["shell", "crews/7", "activeProof"],
    ["direct", "crews/7/tasks/9", "activeDirectProof"],
  ]) {
    const page = await browser.newPage();

    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.addInitScript(() => {
      window.activeShell = true;
    });
    await page.goto(new URL(path, output.baseUrl).href);
    await page.waitForFunction((key) => typeof window[key] === "function", proof);
    active[name] = await page.evaluate((key) => window[key](), proof);
    await page.close();
  }

  await writeFile(
    join(evidence, "browser-observations.json"),
    JSON.stringify({ result, matching, ancestors, active, errors }, null, 2),
  );
  assert.deepEqual(errors, []);

  const task = (crewId, taskId) => ({
    route: "task",
    params: { crewId, taskId },
    chain: ["crew", "task"],
  });
  const crew = (crewId) => ({ route: "crew", params: { crewId }, chain: ["crew"] });
  const { shell, direct } = active;

  // Each settled step: the deepest route and an ancestor's params, one emission when the
  // deepest handle changes, and the same values for a NavigationEnd listener registered
  // before the reader. A page activated into a rendered outlet reads undefined first.
  const page = (name, settled) => ({ name, during: true, first: null, settled });
  const good = { route: "good", params: { goodId: 1 }, chain: ["good"] };
  const part = { route: "part", params: { frameId: 2, partId: 3 }, chain: ["frame", "part"] };
  const expected = [
    ["/crews/7/tasks/9", task(7, 9), 1, "7", [page("task", task(7, 9))]],
    ["/crews/7/tasks/10", task(7, 10), 0, "7", []],
    ["/goods/1", good, 1, "", [page("good", good)]],
    ["/crews/7", crew(7), 1, "7", [page("crew", crew(7))]],
    ["/crews/8/tasks/9", task(8, 9), 1, "8", [page("task", task(8, 9))]],
    ["/crews/9/tasks/10", task(9, 10), 0, "9", []],
    // A page-less layout is deepest at its own URL; a pathless child is its own record.
    ["/frames/2", { route: "frame", params: { frameId: 2 }, chain: ["frame"] }, 1, "", []],
    ["/frames/2/parts/3", part, 1, "", [page("part", part)]],
    ["/stems/4", { route: "leaf", params: { stemId: 4 }, chain: ["stem", "leaf"] }, 1, "", null],
    // Only routes of the generated set count.
    ["/native", null, 1, "", []],
    ["/crews/5", crew(5), 1, "5", [page("crew", crew(5))]],
  ];

  assert.equal(shell.steps.length, expected.length);

  for (const [index, [url, deepest, emitted, crewText, pages]] of expected.entries()) {
    const step = shell.steps[index];

    assert.equal(step.url, url);
    assert.deepEqual(step.active, deepest, url);
    assert.equal(step.emitted, emitted, url);
    assert.deepEqual(step.dom, [crewText, JSON.stringify(deepest?.params ?? null)], url);
    assert.deepEqual(step.atEnd, { url, active: deepest }, url);

    if (pages) {
      assert.deepEqual(step.pages, pages, url);
    }
  }

  // The stem page activates during the navigation; the pathless leaf inside its outlet after it.
  assert.deepEqual(
    shell.steps[8].pages.map(({ name, during, first }) => [name, during, first?.route ?? null]),
    [
      ["stem", true, null],
      ["leaf", false, "leaf"],
    ],
  );

  // Effects never see an ancestor's params mixed with another navigation's deepest params.
  for (const [crewId, params] of shell.seen) {
    assert.equal(crewId ?? null, params?.crewId ?? null, JSON.stringify(shell.seen));
  }

  // One subscription per route observable and an event listener per entry for a two-entry
  // reader, plus the reader's own, all released when its injector is destroyed; a departed
  // route has no subscribers left.
  const { baseline, seeded, released, departed } = shell.subscribers;

  assert.deepEqual(
    seeded.routes,
    baseline.routes.map((counts, depth) => counts.map((count) => count + Number(depth > 0))),
  );
  assert.equal(seeded.events, baseline.events + 3);
  assert.deepEqual(released, baseline);
  assert.deepEqual(departed, [0, 0, 0, 0, 0]);
  // Released and departed handles keep their last values, and still link.
  assert.deepEqual(shell.destroyed, task(7, 9));
  assert.deepEqual(shell.exited, task(7, 10));
  assert.deepEqual(shell.exitedAfter, task(7, 10));
  assert.equal(shell.linked, "/crews/7/tasks/12");

  // Pending, cancelled, failed and skipped navigations leave the selection alone. A reader
  // first read while a resolver or guard is pending reads the committed route.
  assert.deepEqual(shell.pending, {
    committed: task(9, 10),
    whileResolving: { shell: task(9, 10), fresh: task(9, 10), success: true },
    afterResolving: { shell: task(9, 11), fresh: task(9, 11) },
    resolverReused: true,
  });
  assert.deepEqual(shell.guard, {
    beforeGate: task(9, 11),
    whileGuarded: { shell: task(9, 11), fresh: task(9, 11) },
    gateResult: false,
    afterCancel: { shell: task(9, 11), fresh: task(9, 11) },
  });
  assert.equal(shell.failure, "Error: deliberate resolver failure");
  assert.deepEqual(shell.afterFailure, task(9, 11));
  assert.deepEqual(shell.afterSkip, task(9, 11));
  assert.equal(shell.unchanged, true);

  // A reader first read in a constructor that fails activation reads undefined, not the
  // failed route, then follows the next commit.
  assert.deepEqual(shell.crash, {
    activationError: "Error: deliberate activation failure",
    first: null,
    afterCrash: { url: "/native", reader: null, shell: null },
    late: null,
    recovered: crew(5),
  });

  // A reader nobody read at a commit still reads that commit when first read again during
  // the next activation, and released its departed entry at the commit.
  assert.deepEqual(shell.idle, {
    atCrew: crew(5),
    departed: [0, 0, 0, 0, 0],
    armed: false,
    during: true,
    read: { route: "good", params: { goodId: 2 }, chain: ["good"] },
    settled: crew(6),
  });

  // A child constructor fails after Angular advanced the reused crew: the selection stays,
  // the crew handle and the shell read crewId 8 next to the task's crewId 7, and a fresh
  // reader reads undefined, until the next commit.
  assert.deepEqual(shell.childFailure, {
    beforeFail: task(7, 9),
    failError: "Error: deliberate child activation failure",
    afterFail: {
      url: "/crews/7/tasks/9",
      active: task(7, 9),
      crew: { crewId: 8 },
      dom: ["8", JSON.stringify({ crewId: 7, taskId: 9 })],
      fresh: null,
    },
    afterFailCommit: {
      active: { route: "good", params: { goodId: 3 }, chain: ["good"] },
      dom: ["", JSON.stringify({ goodId: 3 })],
    },
  });
  assert.deepEqual(shell.failSeen, [
    [8, { crewId: 7, taskId: 9 }],
    [undefined, { goodId: 3 }],
  ]);

  // A direct load: the shell reads undefined before the initial navigation, the parent page's
  // reader reads undefined during activation, then everyone reads the child.
  assert.deepEqual(direct, {
    initial: true,
    atEnd: [{ url: "/crews/7/tasks/9", active: task(7, 9) }],
    constructed: [
      { name: "crew", during: true, first: null, settled: task(7, 9) },
      { name: "task", during: false, first: task(7, 9), settled: task(7, 9) },
    ],
  });

  const html = await tab.content();

  await writeFile(join(evidence, "browser.html"), html);
} finally {
  await browser?.close();
  subscription.unsubscribe();
  await server.stop();
  await writeFile(join(evidence, "serve-report.json"), JSON.stringify({ outputs, logs }, null, 2));
}

console.log(
  "Native lifecycle/signals/ancestry/own-data/inherited-data/iframe-Promise/redirect/thenable/matching proof passed",
);
