import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { mkdir, writeFile, readFile, readdir, stat, rm, rename, symlink } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { generate, createGenerationSession } from "../dist/generation/index.js";

const scratch = resolve(import.meta.dirname, "../../../examples/angular-launch/.scratch");
const options = {
  tsconfig: "tsconfig.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
};
let sequence = 0;

async function put(root, file, text) {
  const target = resolve(root, file);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}

const launch = `import { defineRoute } from '@loozo/angular-launch';`;

// A leaf route under +auth: `remote` is its `.remote()` callback, `before` goes above the
// default export and `after` after `.remote(…)`.
function leaf(name, remote, { before = "", after = "" } = {}) {
  return `${launch} import parent from '../+auth/route';
${before}
export default defineRoute('${name}', {parent}).remote(${remote})${after};`;
}

// root (a stage) → +auth (pathless, the session namespace) → left (todos) and right (items).
async function fixture() {
  const root = resolve(scratch, `generation-${process.pid}-${++sequence}`);

  await mkdir(root, { recursive: true });
  await put(
    root,
    "package.json",
    JSON.stringify({ name: "launch-generated-fixture", private: true, type: "module" }),
  );
  await put(
    root,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        experimentalDecorators: true,
        types: ["node"],
      },
      include: ["src/**/*.ts", "generated/**/*.ts"],
    }),
  );
  await put(
    root,
    "src/routes/route.ts",
    `${launch} export default defineRoute('', {}).context(async ({ request }) => ({ request, user: null as {id: string} | null, value: 7 }));`,
  );
  await put(
    root,
    "src/routes/+auth/route.ts",
    `${launch} import parent from '../route'; export default defineRoute('', {parent}).remote(({query}) => ({session: {current: query({handler: ({context}) => context.value})}}));`,
  );

  for (const [name, namespace] of [
    ["left", "todos"],
    ["right", "items"],
  ]) {
    await put(
      root,
      `src/routes/${name}/route.ts`,
      leaf(
        name,
        `({query}) => ({${namespace}: {list: query({handler: async ({context}) => ({value: context.value})})}})`,
      ),
    );
    await put(
      root,
      `src/routes/${name}/page.ts`,
      `import { Component } from '@angular/core'; @Component({selector:'fixture-${name}',template:'ok'}) export default class Page {}`,
    );
  }

  return root;
}

async function snapshot(root) {
  const result = {};

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.includes(".generated.")) {
        result[relative(root, path)] = {
          bytes: await readFile(path, "utf8"),
          mtime: (await stat(path, { bigint: true })).mtimeNs.toString(),
        };
      }
    }
  }

  await visit(root);

  return result;
}

async function rejectUnchanged(root, expected, configuration = options) {
  const before = await snapshot(root);

  await assert.rejects(generate(root, configuration), expected);
  assert.deepEqual(await snapshot(root), before);
}

// The `routegen$own()` data of a route copy.
function ownData(copy) {
  const own = /function routegen\$own\(\) \{ return (.*); \}/.exec(copy);

  return own && JSON.parse(own[1]);
}

const appIdPattern = /bindApplication\("([a-f0-9]{64})"/;

test("cold generation writes seeded copies with their own data, the server binding and record stamps; bytes are deterministic and checked", async () => {
  const root = await fixture();

  await put(
    root,
    "src/schema.ts",
    `import type { Schema } from '@loozo/angular-launch/server';
export const schema: Schema<string, {length:number}> = {'~standard': {version:1,vendor:'test',validate: async value => {
if (typeof value !== 'string') { return {issues:[{message:'string required'}]}; }
return {value: {length: value.length}};
}}};`,
  );
  await put(
    root,
    "src/routes/left/route.ts",
    leaf(
      "left",
      `({query}) => ({todos: {
list: query({handler: async ({context}) => ({value: context.value})}),
length: query({input:schema, use:[checked], handler: ({input,context}) => {
// @ts-expect-error the root stage's user is nullable, and nothing narrowed it
context.user.id;
// @ts-expect-error transformed input is not the caller's string
input.toUpperCase();
return {length:input.length};
}})}})`,
      {
        before: `import { middleware, type MiddlewareArgs } from '@loozo/angular-launch/server'; import {schema} from '../../schema';
const checked = middleware(async ({context,request,input,signal,next}: MiddlewareArgs<{value:number}, {length:number}>) => {
if (!(request instanceof Request) || signal.aborted || input.length === 0 || context.value === 0) { throw new Error('unexpected'); }
return next();
});`,
        after: `.resolve({ session: ({ remote }) => remote.session.current(), length: ({ remote }) => remote.todos.length('abc') })`,
      },
    ),
  );
  await put(
    root,
    "src/checks.ts",
    `import { injectRoute, type Remote, type Context } from './routes/left/route.generated';
import { injectRoute as injectAuth } from './routes/+auth/route.generated';
import { injectRoute as injectRight } from './routes/right/route.generated';
const route = injectRoute();
const result: Promise<{length:number}> = route.remote.todos.length('hello', {signal:new AbortController().signal});
const kind: 'query' = route.remote.todos.length.kind;
const session: Promise<number> = route.remote.session.current();
const resolved: number = route.data().session;
const length: {length:number} = route.data().length;
const context: Context = { request: new Request('http://test'), user: null, value: 7 };
const remote: Remote = route.remote;
route.remote.todos.list({signal:new AbortController().signal});
declare const value: unknown;
if (route.remote.todos.list.isError(value)) { if (value.code === 'INVALID_INPUT') { const issues: readonly {readonly path: readonly (string|number)[]; readonly message: string}[] = value.data.issues; void issues; } else { const data:null = value.data; } }
// @ts-expect-error missing caller input
route.remote.todos.length();
// @ts-expect-error caller is string, not validated object
route.remote.todos.length({length:1});
// @ts-expect-error no input procedure takes options only
route.remote.todos.list('input');
// @ts-expect-error an ancestor has no descendant namespace
injectAuth().remote.todos;
// @ts-expect-error a sibling's namespace isn't inherited
injectRight().remote.todos;
// @ts-expect-error cannot relabel kind
const mutation: 'mutation' = kind;
// @ts-expect-error framework errors have no declared payload factory
route.remote.todos.list.errors;
void result; void session; void resolved; void length; void context; void remote;`,
  );
  await generate(root, options);

  const first = await snapshot(root);
  const left = first["src/routes/left/route.generated.ts"].bytes;
  const auth = first["src/routes/+auth/route.generated.ts"].bytes;
  const server = first["generated/server.generated.ts"].bytes;
  const routes = first["generated/routes.generated.ts"].bytes;

  // Own data only: inherited namespaces come from the parent copy's record at runtime.
  assert.deepEqual(ownData(left), {
    remote: {
      todos: {
        methods: [
          { name: "list", input: false, kind: "query", errors: [] },
          { name: "length", input: true, kind: "query", errors: [] },
        ],
      },
    },
  });
  assert.deepEqual(ownData(auth), {
    remote: {
      session: { methods: [{ name: "current", input: false, kind: "query", errors: [] }] },
    },
  });
  assert.equal(ownData(first["src/routes/route.generated.ts"].bytes), null);
  assert.match(left, /routegen\$authoredRouteOf<typeof routegen\$Authored>\(\)\(defineRoute, /);
  assert.match(left, /import type routegen\$Authored from "\.\/route\.js";/);
  assert.match(left, /export type Remote = routegen\$t0<typeof routegen\$route>;/);
  assert.match(left, /export type Context = routegen\$t1<typeof routegen\$route>;/);
  assert.match(left, /type routegen\$Members = \{ readonly remote: Remote \};/);
  assert.doesNotMatch(left, /\.remote\(|middleware|schema|Queries/);
  // The copy keeps only the router steps: the server's imports are gone with their steps.
  assert.doesNotMatch(left, /@loozo\/angular-launch\/server|\.\.\/\.\.\/schema/);
  assert.match(left, /\.resolve\(\{ session: \(\{ remote \}\) => remote\.session\.current\(\)/);

  const id = appIdPattern.exec(server)[1];

  assert.equal(
    server,
    [
      "// @loozo/angular-launch: owned server.generated.ts",
      "import type { HandleOptions } from '@loozo/angular-launch/server';",
      "import { bindApplication, createRequestScope as scopeFor, handleChannelUpgrade, handleRpc, provideLaunchServer } from '@loozo/angular-launch/_server';",
      // Declaration id order, by code unit.
      'import route0 from "../src/routes/+auth/route.js";',
      'import route1 from "../src/routes/left/route.js";',
      'import route2 from "../src/routes/right/route.js";',
      'import route3 from "../src/routes/route.js";',
      `const application = bindApplication("${id}", [[route0, "src/routes/+auth/route.ts"], [route1, "src/routes/left/route.ts"], [route2, "src/routes/right/route.ts"], [route3, "src/routes/route.ts"]]);`,
      "export const createRequestScope = (request: Request) => scopeFor(application, request);",
      "export const handleRequest = (request: Request, options: HandleOptions) => handleRpc(application, request, options);",
      "export const handleUpgrade = (request: Request, options: HandleOptions) => handleChannelUpgrade(application, request, options);",
      "export const provideServer = () => provideLaunchServer(application);",
      "",
    ].join("\n"),
  );

  // Every non-redirect Launch record carries its copy's extension stamp, in the table that
  // holds it: the global table or a parent's children table.
  const tables = Object.entries(first)
    .filter(([path]) => /(?:^|\/)(?:routes|children)\.generated\.ts$/.test(path))
    .map(([, file]) => file.bytes)
    .join("\n");

  assert.equal(tables.match(/\.\.\.extension\(route_\w+\)/g).length, 4);
  assert.match(routes, /readonly remote: routegen\$t0<typeof route_left_route>/);

  await generate(root, options);
  assert.deepEqual(await snapshot(root), first);
  await generate(root, { ...options, check: true });

  const routesFile = resolve(root, "generated/routes.generated.ts");

  await writeFile(routesFile, first["generated/routes.generated.ts"].bytes + "\n// drift");

  const drift = await snapshot(root);

  await assert.rejects(generate(root, { ...options, check: true }), /Generated artifacts changed/);
  assert.deepEqual(await snapshot(root), drift);
});

test("the app identity is stable across route edits, relocation and a workspace move, and follows the package name", async () => {
  const root = await fixture();

  await generate(root, options, () => true);
  assert.deepEqual(await snapshot(root), {});
  await generate(root, options);

  const server = async (at) => (await snapshot(at))["generated/server.generated.ts"].bytes;
  const id = appIdPattern.exec(await server(root))[1];

  await put(
    root,
    "src/routes/route.ts",
    `${launch} export default defineRoute('', {}).context(async ({ request }) => ({ request, user: null as {id: string} | null, value: 8 }));`,
  );
  await generate(root, options);
  assert.equal(appIdPattern.exec(await server(root))[1], id);

  await rename(resolve(root, "src/routes/left"), resolve(root, "src/routes/relocated"));
  await generate(root, options);
  assert.equal(appIdPattern.exec(await server(root))[1], id);
  assert.match(await server(root), /"src\/routes\/relocated\/route\.ts"/);
  assert.equal(
    ownData((await snapshot(root))["src/routes/relocated/route.generated.ts"].bytes).remote.todos
      .methods[0].name,
    "list",
  );

  const moved = root + "-moved";

  await rename(root, moved);
  await generate(moved, options);
  assert.equal(appIdPattern.exec(await server(moved))[1], id);
  await put(
    moved,
    "package.json",
    JSON.stringify({ name: "launch-renamed-fixture", private: true, type: "module" }),
  );
  await generate(moved, options);
  assert.notEqual(appIdPattern.exec(await server(moved))[1], id);
});

test("generation deletes a marked rpc.generated.ts or context.generated.d.ts an earlier version wrote, and leaves unmarked ones", async () => {
  const root = await fixture();

  await generate(root, options);

  await put(
    root,
    "src/routes/left/rpc.generated.ts",
    "// @loozo/angular-launch: owned rpc.generated.ts\nimport { injectClient } from '@loozo/angular-launch/_generated';\nimport type group0 from './rpc.js';\n",
  );
  await put(
    root,
    "generated/context.generated.d.ts",
    "// @loozo/angular-launch: owned context.generated.d.ts\nimport type context from '../src/context.js';\n",
  );
  await put(root, "src/routes/right/rpc.generated.ts", "// an authored file of the same name\n");
  await assert.rejects(generate(root, { ...options, check: true }), /Generated artifacts/);
  await generate(root, options);
  await assert.rejects(readFile(resolve(root, "src/routes/left/rpc.generated.ts")), /ENOENT/);
  await assert.rejects(readFile(resolve(root, "generated/context.generated.d.ts")), /ENOENT/);
  assert.equal(
    await readFile(resolve(root, "src/routes/right/rpc.generated.ts"), "utf8"),
    "// an authored file of the same name\n",
  );
  await generate(root, { ...options, check: true });
});

test("every server payload import rejects native suffix redirection before writes/check", async () => {
  for (const target of ["src/routes/left/route", "src/routes/right/route"]) {
    const root = await fixture();

    await generate(root, options);

    const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

    config.compilerOptions.moduleSuffixes = [".fake", ""];
    config.exclude = ["**/*.fake.ts"];
    await put(root, "tsconfig.json", JSON.stringify(config));
    // A compatible lookalike Launch route under the redirected name.
    await put(
      root,
      `${target}.fake.ts`,
      `${launch} export default defineRoute('fake', {}).remote(({query}) => ({fake: {list: query({handler: () => 999})}}));`,
    );

    // Independent native consumer compile proves this is a compatible payload,
    // not a rejection caused by an incidental structural type mismatch.
    const native = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(native.config, ts.sys, root);
    const consumer = ts.createProgram(parsed.fileNames, parsed.options);

    assert.deepEqual(ts.getPreEmitDiagnostics(consumer), []);
    await rejectUnchanged(root, /Generated payload import must resolve/);

    const before = await snapshot(root);

    await assert.rejects(
      generate(root, { ...options, check: true }),
      /Generated payload import must resolve/,
    );
    assert.deepEqual(await snapshot(root), before);
  }
});

test("combined semantic preflight is strict and prevents all router and Launch writes", async () => {
  const root = await fixture();

  await put(
    root,
    "src/routes/left/route.ts",
    leaf(
      "left",
      `({query}) => ({todos: {list: query({handler: ({context}) => context.nonexistent})}})`,
    ),
  );
  await rejectUnchanged(root, /nonexistent/);
  await put(
    root,
    "src/routes/left/route.ts",
    leaf("left", `({query}) => ({todos: {list: query({handler: () => 7})}})`, {
      after: ".resolve({x: () => missingRouteValue})",
    }),
  );
  await rejectUnchanged(root, /missingRouteValue/);
  // Generation checks only its own domain; an unrelated application declaration
  // error is left to the application's build and no longer blocks publication.
  await put(
    root,
    "src/routes/left/route.ts",
    leaf("left", `({query}) => ({todos: {list: query({handler: () => 7})}})`),
  );
  await put(root, "src/broken.d.ts", "export interface Broken { value: MissingType; }");
  await generate(root, options);

  const stale = await fixture();

  await generate(stale, options);
  await put(
    stale,
    "generated/routes.generated.ts",
    "// @loozo/angular-router routegen: owned routes.generated.ts\n// obsolete",
  );
  await put(
    stale,
    "src/routes/left/route.ts",
    leaf(
      "left",
      `({query}) => ({todos: {list: query({handler: ({context}) => context.nonexistent})}})`,
    ),
  );
  await rejectUnchanged(stale, /nonexistent/);
});

test("final check covers generated outputs, declarations and direct importers but not unrelated files", async () => {
  const root = await fixture();

  await put(root, "src/unrelated.ts", "export const wrong: number = 'unrelated';");
  await generate(root, options);
  await generate(root, { ...options, check: true });

  for (const reference of [
    "import {injectRoute} from './routes/left/route.generated'; void injectRoute;",
    "export {injectRoute} from './routes/left/route.generated';",
    "export const load = () => import('./routes/left/route.generated');",
    "export type Remote = import('./routes/left/route.generated').Remote;",
    "import {handleRequest} from '../generated/server.generated'; void handleRequest;",
  ]) {
    await put(root, "src/consumer.ts", `${reference}\nexport const wrong: number = 'importer';`);
    await rejectUnchanged(root, /consumer\.ts/);
  }

  await rm(resolve(root, "src/consumer.ts"));
  await generate(root, { ...options, check: true });
});

test("only __proto__ namespace/procedure is reserved before cold publication, updates or check", async () => {
  for (const [remote, diagnostic] of [
    [
      "({query}) => ({__proto__: {list: query({handler: () => 1})}})",
      "RPC namespace '__proto__' is reserved",
    ],
    [
      "({query}) => ({'__proto__': {list: query({handler: () => 1})}})",
      "RPC namespace '__proto__' is reserved",
    ],
    [
      "({query}) => ({todos: {__proto__: query({handler: () => 1})}})",
      "RPC procedure '__proto__' is reserved",
    ],
    [
      "({query}) => ({todos: {'__proto__': query({handler: () => 1})}})",
      "RPC procedure '__proto__' is reserved",
    ],
  ]) {
    const root = await fixture();
    const authored = leaf("left", remote);
    const expected = (error) =>
      error.message.includes("src/routes/left/route.ts:") && error.message.includes(diagnostic);

    await put(root, "src/routes/left/route.ts", authored);
    await rejectUnchanged(root, expected);
    assert.deepEqual(await snapshot(root), {});
    await assert.rejects(generate(root, { ...options, check: true }), expected);
    await put(
      root,
      "src/routes/left/route.ts",
      leaf("left", `({query}) => ({todos: {list: query({handler: () => 1})}})`),
    );
    await generate(root, options);
    await put(root, "src/routes/left/route.ts", authored);
    await rejectUnchanged(root, expected);
    await rejectUnchanged(root, expected, { ...options, check: true });
  }
});

test("ordinary constructor/toString identifiers and schema caller-input unions remain generated and precisely inferred", async () => {
  const root = await fixture();

  await put(
    root,
    "src/schema.ts",
    `import type {Schema} from '@loozo/angular-launch/server';
export const schema:Schema<string|number,{text:string}>={'~standard':{version:1,vendor:'test',validate:async value=>{
if(typeof value!=='string'&&typeof value!=='number'){return {issues:[{message:'input'}]};}
return {value:{text:String(value)}};
}}};`,
  );
  await put(
    root,
    "src/routes/left/route.ts",
    leaf(
      "left",
      `({query}) => ({constructor: {
constructor:query({input:schema,handler:({input})=>{
const text:string=input.text;
// @ts-expect-error transformed input is not the caller union
const caller:string|number=input;
return {text};
}}),toString:query({handler:()=>1})}})`,
      { before: "import {schema} from '../../schema';" },
    ),
  );
  await put(
    root,
    "src/routes/right/route.ts",
    leaf(
      "right",
      `({query}) => ({toString: {constructor:query({handler:()=>1}),toString:query({handler:()=>2})}})`,
    ),
  );
  await put(
    root,
    "src/checks.ts",
    `import {injectRoute as left} from './routes/left/route.generated';import {injectRoute as right} from './routes/right/route.generated';
const a:Promise<{text:string}>=left().remote.constructor.constructor('one');
const b:Promise<{text:string}>=left().remote.constructor.constructor(1);
const c:Promise<number>=left().remote.constructor.toString();
const d:Promise<number>=right().remote.toString.constructor();
const e:Promise<number>=right().remote.toString.toString();
// @ts-expect-error caller input union excludes boolean
left().remote.constructor.constructor(true);
// @ts-expect-error awaited result is not any
const wrong:Promise<string>=left().remote.constructor.constructor(1);
void a;void b;void c;void d;void e;`,
  );
  await generate(root, options);
  await generate(root, { ...options, check: true });

  const copy = await readFile(resolve(root, "src/routes/left/route.generated.ts"), "utf8");

  assert.deepEqual(ownData(copy).remote.constructor.methods, [
    { name: "constructor", input: true, kind: "query", errors: [] },
    { name: "toString", input: false, kind: "query", errors: [] },
  ]);
});

test("explicit optional schema expression is type-valid but cannot publish concrete-input metadata", async () => {
  const root = await fixture();

  await generate(root, options);
  await put(
    root,
    "src/schema.ts",
    `import type {Schema} from '@loozo/angular-launch/server';
const schema:Schema<string,string>={'~standard':{version:1,vendor:'test',validate:value=>{
if(typeof value!=='string'){return {issues:[{message:'input'}]};}return {value};
}}};
export const optionalSchema:Schema<string,string>|undefined=Math.random()>0.5?schema:undefined;`,
  );
  await put(
    root,
    "src/routes/left/route.ts",
    leaf(
      "left",
      `({query}) => ({todos: {list: query({input: optionalSchema, handler: () => 1})}})`,
      {
        before: "import {optionalSchema} from '../../schema';",
      },
    ),
  );

  const native = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(native.config, ts.sys, root);
  const consumer = ts.createProgram(parsed.fileNames, parsed.options);

  assert.deepEqual(ts.getPreEmitDiagnostics(consumer), []);

  const expected = (error) =>
    error.message.includes("src/routes/left/route.ts:") &&
    error.message.includes("Explicit query input must have a concrete Standard Schema type");

  await rejectUnchanged(root, expected);
  await rejectUnchanged(root, expected, { ...options, check: true });

  for (const file of Object.keys(await snapshot(root))) {
    await rm(resolve(root, file));
  }

  await rejectUnchanged(root, expected);
  assert.deepEqual(await snapshot(root), {});
});

test("namespaces are unique across the app, and a route from another extension fails", async () => {
  const cases = [
    [
      "ancestry",
      (root) =>
        put(
          root,
          "src/routes/left/route.ts",
          leaf("left", `({query}) => ({session: {x: query({handler: () => 7})}})`),
        ),
      /Duplicate RPC namespace: session; also declared in .*\+auth\/route\.ts/,
    ],
    [
      "sibling",
      (root) =>
        put(
          root,
          "src/routes/right/route.ts",
          leaf("right", `({query}) => ({todos: {x: query({handler: () => 7})}})`),
        ),
      /Duplicate RPC namespace: todos/,
    ],
    [
      "one route",
      (root) =>
        put(
          root,
          "src/routes/left/route.ts",
          leaf(
            "left",
            `({query}) => ({todos: {x: query({handler: () => 7})}, items2: {y: query({handler: () => 1})}, items: {z: query({handler: () => 1})}})`,
          ),
        ),
      /Duplicate RPC namespace: items/,
    ],
    [
      "identifier",
      (root) =>
        put(
          root,
          "src/routes/left/route.ts",
          leaf("left", `({query}) => ({'two words': {x: query({handler: () => 7})}})`),
        ),
      /RPC namespaces must be identifier names/,
    ],
    [
      "another extension",
      async (root) => {
        await put(
          root,
          "node_modules/fake-route-extension/package.json",
          JSON.stringify({
            name: "fake-route-extension",
            type: "module",
            exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
          }),
        );
        await put(
          root,
          "node_modules/fake-route-extension/index.d.ts",
          `import type { ExtensionSpec, InputContribution, RouteFactory, StepSignature } from '@loozo/angular-router/_core';
interface TagStep extends StepSignature { readonly parameters: [tag: string]; readonly own: {}; }
interface TagInput extends InputContribution { readonly input: {}; }
declare const witness: unique symbol;
export interface TagSpec extends ExtensionSpec {
  readonly steps: readonly [{ name: 'tag'; type: TagStep; serverOnly: true; arity: { min: 1; max: 1 } }];
  readonly input: TagInput;
  readonly witness: typeof witness;
}
export declare const defineRoute: RouteFactory<TagSpec>;`,
        );
        await put(
          root,
          "node_modules/fake-route-extension/index.js",
          `import { createRouteFactory } from '@loozo/angular-router/_core';
export const defineRoute = createRouteFactory({ steps: [{ name: 'tag', serverOnly: true, arity: { min: 1, max: 1 } }], input: () => ({}), handle: () => ({}) });`,
        );
        await put(
          root,
          "src/routes/tagged/route.ts",
          `import { defineRoute } from 'fake-route-extension'; export default defineRoute('tagged', {}).tag('x');`,
        );
        await put(
          root,
          "src/routes/tagged/page.ts",
          `import { Component } from '@angular/core'; @Component({selector:'fixture-tagged',template:'ok'}) export default class Page {}`,
        );
      },
      /src\/routes\/tagged\/route\.ts:.*Route uses a route extension that isn't Launch's defineRoute/,
    ],
  ];

  for (const [label, mutate, expected] of cases) {
    const root = await fixture();

    await mutate(root);
    await rejectUnchanged(root, expected);
    console.log(`qualified ${label}`);
  }
});

test("a stage below the first may return any object type, such as a union or one with an optional key", async () => {
  const stage = (value) =>
    `${launch} import parent from '../route'; export default defineRoute('', {parent}).context(${value}).remote(({query}) => ({session: {current: query({handler: ({context}) => context.value})}}));`;

  for (const value of [
    "({ context }) => (Math.random() > 0.5 ? { value: context.value, mode: 'a' as const } : { value: context.value, mode: 'b' as const, extra: 1 })",
    "({ context }): { value: number; role?: string } => ({ value: context.value })",
  ]) {
    const root = await fixture();

    await put(root, "src/routes/+auth/route.ts", stage(value));
    await generate(root, options);
  }
});

test(".remote()'s builder callback rejects renames, defaults, rest, non-arrows, block bodies, foreign calls and unknown keys", async () => {
  const shape = /arrow function destructuring query, mutation, stream and\/or channel/;
  const binding = /may only destructure query, mutation, stream and channel, without renaming/;
  const cases = [
    [`({ query: read }) => ({ todos: { x: read({ handler: () => 1 }) } })`, binding],
    [
      `({ query = undefined as never }) => ({ todos: { x: query({ handler: () => 1 }) } })`,
      binding,
    ],
    [`({ ...builders }) => ({ todos: { x: builders.query({ handler: () => 1 }) } })`, binding],
    [`({ query, other }: any) => ({ todos: { x: query({ handler: () => 1 }) } })`, shape],
    [`function ({ query }) { return { todos: { x: query({ handler: () => 1 }) } }; }`, shape],
    [`build`, shape],
    [`async ({ query }) => ({ todos: { x: query({ handler: () => 1 }) } })`, shape],
    [`(builders) => ({ todos: { x: builders.query({ handler: () => 1 }) } })`, shape],
    [`({ query }) => { return { todos: { x: query({ handler: () => 1 }) } }; }`, shape],
    [`({ query }) => (namespaces)`, /RPC namespaces must be an inline object/],
    [`({ query }) => ({ todos: procedures })`, /RPC procedures must be an inline object/],
    [
      `({ query }) => ({ todos: { x: helper({ handler: () => 1 }) } })`,
      /callback's query, mutation, stream or channel/,
    ],
    [
      `({ query }) => ({ todos: { x: (query)({ handler: () => 1 }) } })`,
      /callback's query, mutation, stream or channel/,
    ],
    [
      `({ query }) => ({ todos: { x: query({ handler: () => 1, canActivate: [] }) } })`,
      /Unsupported Launch option: canActivate/,
    ],
    [
      `({ query }) => ({ todos: { x: query({ handler: () => 1, kind: 'mutation' }) } })`,
      /Unsupported Launch option: kind/,
    ],
    [
      `({ query }) => ({ todos: { x: query({ handler: () => 1 }), x: query({ handler: () => 2 }) } })`,
      /unique keys|Duplicate/,
    ],
    [
      `({ query }) => ({ todos: { x: query({ input: undefined as never }) } })`,
      /query requires handler/,
    ],
  ];

  for (const [remote, expected] of cases) {
    const root = await fixture();

    await put(
      root,
      "src/routes/left/route.ts",
      leaf("left", remote, {
        before: `const build = ({ query }: any) => ({ todos: { x: query({ handler: () => 1 }) } });
const helper = (options: unknown) => options;
const namespaces = {};
const procedures = {};
void build; void helper; void namespaces; void procedures;`,
      }),
    );
    await rejectUnchanged(root, expected);
  }
});

test("stale owned imports, escapes and links are refused before any write", async () => {
  const root = await fixture();

  await generate(root, options);

  const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

  config.exclude = ["src/routes/stale"];
  await put(root, "tsconfig.json", JSON.stringify(config));
  await put(
    root,
    "src/routes/stale/rpc.generated.ts",
    "// @loozo/angular-launch: owned rpc.generated.ts\nexport const stale=1;",
  );
  // An import of a file generation is about to delete fails the run.
  await put(root, "src/routes/stray.ts", `import './stale/rpc.generated';`);
  await rejectUnchanged(root, /Generated import is not a retained/);
  await rm(resolve(root, "src/routes/stray.ts"));
  await generate(root, options);
  await assert.rejects(readFile(resolve(root, "src/routes/stale/rpc.generated.ts")), /ENOENT/);

  const beforeEscape = await snapshot(root);

  await assert.rejects(
    generate(root, { ...options, outDirectory: "../escaped-output" }),
    /escapes application/,
  );
  assert.deepEqual(await snapshot(root), beforeEscape);
  await symlink(resolve(root, "src/routes/route.ts"), resolve(root, "generated/unsafe.ts"));
  await rejectUnchanged(root, /symbolic link/);
});

test("generated copies preserve DTO interfaces and exact awaited/transformed types without index signatures", async () => {
  const root = await fixture();

  await put(
    root,
    "src/dto.ts",
    `import type {Schema} from '@loozo/angular-launch/server';
export interface Todo {id:string;title:string;completed:boolean}
export interface ReadonlyTodo {readonly id:string;readonly details:{readonly title:string};readonly tags:readonly string[]}
export interface Input {readonly id:string}
export interface MutableInput {id:string}
export type AliasInput={readonly id:string};
export type AliasTodo={readonly id:string;completed:boolean};
export interface Transformed {readonly id:string;readonly length:number}
export const schema:Schema<Input,Transformed>={'~standard':{version:1,vendor:'test',validate:async value=>{
if(typeof value!=='object'||value===null||!('id' in value)||typeof value.id!=='string'){return {issues:[{message:'id'}]};}
return {value:{id:value.id,length:value.id.length}};
}}};
export const identity:Schema<Input,Input>={'~standard':{version:1,vendor:'test',validate:value=>{
if(typeof value!=='object'||value===null||!('id' in value)||typeof value.id!=='string'){return {issues:[{message:'id'}]};}
return {value:{id:value.id}};
}}};
export const mutableIdentity:Schema<MutableInput,MutableInput>=identity;
export const aliasIdentity:Schema<AliasInput,AliasInput>=identity;
export async function aliasTodo():Promise<AliasTodo>{return {id:'1',completed:false};}
export const functionInput:Schema<{bad:()=>number},null>={'~standard':{version:1,vendor:'test',validate:()=>({value:null})}};
export const undefinedInput:Schema<{bad:undefined},null>={'~standard':{version:1,vendor:'test',validate:()=>({value:null})}};
export const dateSchema:Schema<Date,Date>={'~standard':{version:1,vendor:'test',validate:value=>{
if(value instanceof Date){return {value};}return {issues:[{message:'date'}]};
}}};
export async function list():Promise<Todo[]>{return [{id:'1',title:'Todo',completed:false}];}
export async function readonlyList():Promise<readonly ReadonlyTodo[]>{return [{id:'1',details:{title:'Todo'},tags:['one']}];}
export function tuple():readonly [string,number]{return ['one',1];}`,
  );
  await put(
    root,
    "src/routes/left/route.ts",
    leaf(
      "left",
      `({query}) => ({todos: {
list:query({handler:list}),readonlyList:query({handler:readonlyList}),tuple:query({handler:tuple}),
get:query({input:schema,use:[middleware(async({input,next}:MiddlewareArgs<unknown,Transformed>)=>{const transformed:Transformed=input;void transformed;return next();})],handler:async({input,context})=>{
const exact:Transformed=input;const value:number=context.value;
// @ts-expect-error handler sees transformed output, not caller string
const wrong:string=input;
return {id:exact.id,title:String(value),completed:false} satisfies Todo;
}}),
identity:query({input:identity,handler:({input})=>{const exact:Input=input;return exact;}}),
mutable:query({input:mutableIdentity,handler:({input})=>input}),
alias:query({input:aliasIdentity,handler:aliasTodo}),
// @ts-expect-error Date result is not structural JSON
badDate:query({handler:()=>new Date()}),
// @ts-expect-error awaited Date result is not JSON
badAsyncDate:query({handler:async()=>new Date()}),
// @ts-expect-error undefined result is not JSON
badUndefined:query({handler:()=>undefined}),
// @ts-expect-error void result is not JSON
badVoid:query({handler:()=>{}}),
// @ts-expect-error function result is not JSON
badFunction:query({handler:()=>()=>1}),
// @ts-expect-error nested undefined result is not JSON
badNested:query({handler:()=>({value:undefined})}),
// @ts-expect-error Date caller input is not JSON
badInput:query({input:dateSchema,handler:()=>null}),
// @ts-expect-error function caller field is not JSON
badFunctionInput:query({input:functionInput,handler:()=>null}),
// @ts-expect-error undefined caller field is not JSON
badUndefinedInput:query({input:undefinedInput,handler:()=>null}),
}})`,
      {
        before: `import {middleware,type MiddlewareArgs} from '@loozo/angular-launch/server';
import {schema,identity,mutableIdentity,aliasIdentity,aliasTodo,functionInput,undefinedInput,dateSchema,list,readonlyList,tuple} from '../../dto';
import type {Input,Transformed,Todo} from '../../dto';`,
      },
    ),
  );
  await put(
    root,
    "src/checks.ts",
    `import {injectRoute} from './routes/left/route.generated';
import type {Todo,ReadonlyTodo,Input,MutableInput,AliasTodo} from './dto';
import {handleRequest, createRequestScope} from '../generated/server.generated';
const handled:Promise<Response|null>=handleRequest(new Request('http://test'),{allowedHosts:['test'],origins:['https://public.test']});
// @ts-expect-error handleRequest requires options
handleRequest(new Request('http://test'));
// @ts-expect-error allowedHosts is required
handleRequest(new Request('http://test'),{origins:[]});
// Creating a scope is synchronous and runs nothing.
const scope=createRequestScope(new Request('http://test'));
const request:Request=scope.request;
// @ts-expect-error a scope holds no context value
scope.value;
void handled;void request;
const rpc=injectRoute().remote;
const todos:Promise<Todo[]>=rpc.todos.list();
const readonlyTodos:Promise<readonly ReadonlyTodo[]>=rpc.todos.readonlyList();
const tuple:Promise<readonly [string,number]>=rpc.todos.tuple();
const value:Promise<Todo>=rpc.todos.get({id:'1'});
const identity:Promise<Input>=rpc.todos.identity({id:'1'});
const mutableInputResult:Promise<MutableInput>=rpc.todos.mutable({id:'1'});
const alias:Promise<AliasTodo>=rpc.todos.alias({id:'1'});
const kind:'query'=rpc.todos.get.kind;
// @ts-expect-error caller interface requires id
rpc.todos.get({});
// @ts-expect-error caller is not transformed shape
rpc.todos.get({id:'1',length:1});
// @ts-expect-error exact awaited interface fields, not unknown or any
const wrong:Promise<{missing:string}[]>=rpc.todos.list();
// @ts-expect-error readonly result remains readonly
const mutable:Promise<ReadonlyTodo[]>=rpc.todos.readonlyList();
void todos;void readonlyTodos;void tuple;void value;void identity;void kind;void mutableInputResult;void alias;`,
  );
  await generate(root, options);
  await generate(root, { ...options, check: true });
});

const contractSchemas = `
import type { Schema } from '@loozo/angular-launch/server';
export interface IdInput { readonly id: string; }
export interface ErrorData { readonly id: string; readonly length: number; }
export const schema: Schema<IdInput, ErrorData> = {
  '~standard': {
    version: 1,
    vendor: 'contracts',
    async validate(value) {
      if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') {
        return { issues: [{ message: 'id required' }] };
      }

      return { value: { id: value.id.trim(), length: value.id.trim().length } };
    },
  },
};
export const idSchema: Schema<IdInput> = {
  '~standard': { version: 1, vendor: 'contracts', validate(value) {
    if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') {
      return { issues: [{ message: 'id required' }] };
    }
    return { value: { id: value.id } };
  } },
};
export const dateInputSchema: Schema<Date, string> = {
  '~standard': { version: 1, vendor: 'contracts', async validate(value) {
    if (!(value instanceof Date)) { return { issues: [{ message: 'Date required' }] }; }
    return { value: value.toISOString() };
  } },
};
export const nullSchema: Schema<null> = {
  '~standard': { version: 1, vendor: 'contracts', validate(value) {
    if (value !== null) { return { issues: [{ message: 'null required' }] }; }
    return { value: null };
  } },
};
export interface RoomInput { readonly room: string; }
export interface TextInput { readonly text: string; }
function object<Value>(key: string): Schema<Value> {
  return {
    '~standard': { version: 1, vendor: 'contracts', validate(value) {
      if (typeof value !== 'object' || value === null || !(key in value)) {
        return { issues: [{ message: key + ' required' }] };
      }
      return { value: value as Value };
    } },
  };
}
export const room = object<RoomInput>('room');
export const text = object<TextInput>('text');
export const maybe: Schema<TextInput> | undefined = text;
`;

test("mutations and declared errors preserve exact inputs, awaited outputs, code/data narrowing and browser-only metadata", async () => {
  const root = await fixture();

  await put(root, "src/schema.ts", contractSchemas);
  await put(
    root,
    "src/routes/left/route.ts",
    leaf(
      "left",
      `({ query, mutation }) => ({ todos: {
  list: query({ handler: () => ({ value: 1 }) }),
  complete: mutation({
    input: schema,
    errors: {
      NOT_FOUND: { status: 404, message: 'Todo does not exist', data: schema },
      EMPTY: { status: 409, message: 'Empty', data: nullSchema },
      RAW_DATE: { status: 409, message: 'Timestamp', data: dateInputSchema },
    },
    handler: async ({ input, context, errors }) => {
      const length: number = input.length;
      const value: number = context.value;
      const thrown: Error = errors.NOT_FOUND({ id: input.id });
      const noData: Error = errors.EMPTY(null);
      const dateError: Error = errors.RAW_DATE(new Date());
      // @ts-expect-error server factory accepts raw schema input, not output
      errors.RAW_DATE('2026-01-01');
      // @ts-expect-error factory accepts schema input, not its transformed output alone
      errors.NOT_FOUND({ length: 1 });
      // @ts-expect-error invalid data input
      errors.NOT_FOUND({ id: 1 });
      // @ts-expect-error only current declaration factories exist
      errors.UNKNOWN(null);
      void thrown; void noData; void dateError; void value;
      return { id: input.id, length };
    },
  }),
} })`,
      { before: "import { schema, nullSchema, dateInputSchema } from '../../schema';" },
    ),
  );
  await put(
    root,
    "src/mutation-checks.ts",
    `
import { injectRoute } from './routes/left/route.generated';
import type { InputIssue, InvalidInputData, RpcError } from '@loozo/angular-launch';
const rpc = injectRoute().remote;
const result: Promise<{ id: string; length: number }> = rpc.todos.complete({ id: 'todo' }, { transferCache: false });
const kind: 'mutation' = rpc.todos.complete.kind;
rpc.todos.list({ transferCache: true });
declare const error: unknown;
if (rpc.todos.complete.isError(error)) {
  if (error.code === 'NOT_FOUND') {
    const id: string = error.data.id;
    const length: number = error.data.length;
    const declared: RpcError<'NOT_FOUND', { readonly id: string; readonly length: number }> = error;
    // @ts-expect-error declared data is not null
    const frameworkData: null = error.data;
    void id; void length; void declared; void frameworkData;
  } else if (error.code === 'RAW_DATE') {
    const serialized: string = error.data;
    // @ts-expect-error public data is transformed JSON, not raw Date
    const raw: Date = error.data;
    void serialized; void raw;
  } else if (error.code === 'INVALID_INPUT') {
    const data: InvalidInputData = error.data;
    const issue: InputIssue | undefined = error.data.issues[0];
    const framework: RpcError<'INVALID_INPUT', InvalidInputData> = error;
    // @ts-expect-error INVALID_INPUT data is not null
    const nullData: null = error.data;
    // @ts-expect-error issues are read-only
    error.data.issues.push({ path: [], message: '' });
    void data; void issue; void framework; void nullData;
  } else {
    const noData: null = error.data;
    void noData;
  }
}
// @ts-expect-error mutation requires input
rpc.todos.complete();
// @ts-expect-error invalid caller input
rpc.todos.complete({ id: 1 });
// @ts-expect-error mutation cannot opt into transfer cache
rpc.todos.complete({ id: 'todo' }, { transferCache: true });
// @ts-expect-error cannot relabel mutation
const query: 'query' = kind;
// @ts-expect-error no client error factories
rpc.todos.complete.errors;
void result; void query;
`,
  );
  await generate(root, options);
  await generate(root, { ...options, check: true });

  const first = await snapshot(root);
  const copy = first["src/routes/left/route.generated.ts"].bytes;

  assert.deepEqual(ownData(copy).remote.todos.methods[1], {
    name: "complete",
    input: true,
    kind: "mutation",
    errors: [
      { code: "NOT_FOUND", status: 404, message: "Todo does not exist" },
      { code: "EMPTY", status: 409, message: "Empty" },
      { code: "RAW_DATE", status: 409, message: "Timestamp" },
    ],
  });
  assert.doesNotMatch(copy, /validate|~standard|nullSchema|handler/);
  await generate(root, options);
  assert.deepEqual(await snapshot(root), first);
});

test("streams yield strict JSON, type their client as an async iterable and stay out of route.queries", async () => {
  const root = await fixture();

  await put(root, "src/schema.ts", contractSchemas);
  await put(
    root,
    "src/routes/left/route.ts",
    leaf(
      "left",
      `({ query, stream }) => ({ todos: {
  list: query({ handler: () => ({ value: 1 }) }),
  watch: stream({
    input: idSchema,
    errors: { GONE: { status: 410, message: 'Gone', data: nullSchema } },
    handler: async function* ({ input, context, errors, signal }) {
      const value: number = context.value;
      const gone: Error = errors.GONE(null);
      void gone; void signal;
      yield { id: input.id, value };
    },
  }),
  numbers: stream({ handler: ({ signal }) => numbers(signal) }),
  // @ts-expect-error yielded values must be strict JSON
  dates: stream({ handler: async function* () { yield new Date(); } }),
  // @ts-expect-error a returned value would be lost
  returns: stream({ handler: async function* () { yield 1; return 2; } }),
} })`,
      {
        before: `import { idSchema, nullSchema } from '../../schema';
async function* numbers(signal: AbortSignal) { if (!signal.aborted) { yield 1; } }`,
      },
    ),
  );
  await put(
    root,
    "src/stream-checks.ts",
    `
import { injectRoute } from './routes/left/route.generated';
const route = injectRoute();
const rpc = route.remote;
const watched: AsyncIterable<{ id: string; value: number }> = rpc.todos.watch({ id: 'a' }, { signal: AbortSignal.timeout(1) });
const numbers: AsyncIterable<number> = rpc.todos.numbers();
const kind: 'stream' = rpc.todos.watch.kind;
declare const error: unknown;
if (rpc.todos.watch.isError(error) && error.code === 'GONE') {
  const data: null = error.data;
  void data;
}
// @ts-expect-error streams don't use the transfer cache
rpc.todos.numbers({ transferCache: false });
// @ts-expect-error stream requires input
rpc.todos.watch();
// @ts-expect-error a stream isn't a promise
rpc.todos.numbers().then;
route.queries.todos.list.queryOptions();
// @ts-expect-error streams have no TanStack options
route.queries.todos.watch;
void watched; void numbers; void kind;
`,
  );
  await generate(root, { ...options, tanstackQuery: true });
  await generate(root, { ...options, tanstackQuery: true, check: true });

  const copy = (await snapshot(root))["src/routes/left/route.generated.ts"].bytes;

  assert.deepEqual(ownData(copy).remote.todos.methods.slice(1, 3), [
    {
      name: "watch",
      input: true,
      kind: "stream",
      errors: [{ code: "GONE", status: 410, message: "Gone" }],
    },
    { name: "numbers", input: false, kind: "stream", errors: [] },
  ]);
});

test("channels type their client by yields and message schema, get handleUpgrade and stay out of route.queries", async () => {
  const root = await fixture();
  const channels = (talk = "message: text, ", list = "") =>
    leaf(
      "left",
      `({ query, channel }) => ({ todos: {
  list: query({ ${list}handler: () => ({ value: 1 }) }),
  talk: channel({
    input: room,
    message: text,
    errors: { GONE: { status: 410, message: 'Gone', data: nullSchema } },
    handler: async function* ({ input, messages, context, errors, signal }) {
      const value: number = context.value;
      const gone: Error = errors.GONE(null);
      void gone; void signal;
      yield { kind: 'history' as const, text: input.room, value };
      for await (const message of messages) {
        const said: string = message.text;
        yield { kind: 'echo' as const, text: said, value };
      }
    },
  }),
  bare: channel({ ${talk}handler: async function* () { yield 1; } }),
  // @ts-expect-error yielded values must be strict JSON
  dates: channel({ message: text, handler: async function* () { yield new Date(); } }),
} })`,
      { before: "import { room, text, maybe, nullSchema } from '../../schema'; void maybe;" },
    );

  await put(root, "src/schema.ts", contractSchemas);
  await put(root, "src/routes/left/route.ts", channels());
  await put(
    root,
    "src/channel-checks.ts",
    `
import { injectRoute } from './routes/left/route.generated';
import type { Channel, Connection } from '@loozo/angular-launch';
type Event = { readonly kind: 'history' | 'echo'; readonly text: string; readonly value: number };
const route = injectRoute();
const rpc = route.remote;
const talk: Channel<Event, { readonly text: string }> = rpc.todos.talk({ room: 'a' }, { signal: AbortSignal.timeout(1) });
void talk.send({ text: 'hi' });
// @ts-expect-error the message schema's input type
void talk.send({ words: 'hi' });
const bare: Channel<number, { readonly text: string }> = rpc.todos.bare();
const kind: 'channel' = rpc.todos.talk.kind;
// @ts-expect-error channel requires input
rpc.todos.talk();
// @ts-expect-error channels don't use the transfer cache
rpc.todos.bare({ transferCache: false });
const lines: Connection<string[], { readonly text: string }> = rpc.todos.talk.connect({
  input: () => ({ room: 'a' }),
  initial: () => [] as string[],
  reduce: (state, event) => [...state, event.kind],
});
// @ts-expect-error a channel with input needs the input option
rpc.todos.talk.connect({ initial: () => null });
route.queries.todos.list.queryOptions();
// @ts-expect-error channels have no TanStack options
route.queries.todos.talk;
void bare; void kind; void lines;
`,
  );
  await generate(root, { ...options, tanstackQuery: true });
  await generate(root, { ...options, tanstackQuery: true, check: true });

  const files = await snapshot(root);
  const copy = files["src/routes/left/route.generated.ts"].bytes;

  assert.deepEqual(ownData(copy).remote.todos.methods.slice(1, 3), [
    {
      name: "talk",
      input: true,
      kind: "channel",
      errors: [{ code: "GONE", status: 410, message: "Gone" }],
    },
    { name: "bare", input: false, kind: "channel", errors: [] },
  ]);
  assert.match(
    files["generated/server.generated.ts"].bytes,
    /export const handleUpgrade = \(request: Request, options: HandleOptions\) => handleChannelUpgrade\(application, request, options\);/,
  );

  // A channel needs its message schema, and only a channel takes one.
  await rm(resolve(root, "src/channel-checks.ts"));
  await put(root, "src/routes/left/route.ts", channels(""));
  await rejectUnchanged(root, /channel requires message/);
  await put(root, "src/routes/left/route.ts", channels(undefined, "message: text, "));
  await rejectUnchanged(root, /Unsupported Launch option: message/);
  // Its type must be concrete, as for an input schema.
  await put(root, "src/routes/left/route.ts", channels("message: maybe, "));
  await rejectUnchanged(root, /A channel's message must have a concrete Standard Schema type/);
});

test("declared error static DSL and schema/type/provenance failures reject cold, update and check without any publication", async () => {
  const cases = [
    "NOT_FOUND: { status: 399, message: 'Missing', data: schema }",
    "NOT_FOUND: { status: 600, message: 'Missing', data: schema }",
    "NOT_FOUND: { status: 400.5, message: 'Missing', data: schema }",
    "NOT_FOUND: { status, message: 'Missing', data: schema }",
    "NOT_FOUND: { status: 404, message: '', data: schema }",
    "NOT_FOUND: { status: 404, message, data: schema }",
    "NOT_FOUND: { status: 404, message: 'Missing' }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: schema, extra: true }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: undefined }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: null }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: maybe }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: anySchema }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: unknownSchema }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: dateSchema }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: undefinedSchema }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: anyOutputSchema }",
    "'bad-code': { status: 404, message: 'Missing', data: schema }",
    "__proto__: { status: 404, message: 'Missing', data: schema }",
    "NOT_FOUND: { status: 404, message: 'Missing', data: schema }, NOT_FOUND: { status: 404, message: 'Missing', data: schema }",
    "...otherErrors",
  ];

  for (const code of ["INVALID_INPUT", "FORBIDDEN", "INTERNAL", "RPC_NOT_FOUND"]) {
    cases.push(`${code}: { status: 404, message: 'Missing', data: schema }`);
  }

  const root = await fixture();
  const original = await readFile(resolve(root, "src/routes/left/route.ts"), "utf8");
  const imports = `
import type { Schema } from '@loozo/angular-launch/server';
const schema: Schema<string> = { '~standard': { version: 1, vendor: 'contracts', validate(value) {
  if (typeof value !== 'string') { return { issues: [{ message: 'string' }] }; }
  return { value };
} } };
declare const maybe: typeof schema | undefined;
declare const anySchema: any;
declare const unknownSchema: unknown;
declare const dateSchema: Schema<string, Date>;
declare const undefinedSchema: Schema<string, undefined>;
declare const anyOutputSchema: Schema<string, any>;
const status = 404;
const message = 'Missing';
const otherErrors = { OTHER: { status: 404, message: 'Missing', data: schema } };
`;

  // One fixture per mode retains byte+mtime comparisons without performing
  // dozens of unrelated successful generations between rejection cases.
  for (const mode of ["cold", "update", "check"]) {
    if (mode === "update") {
      await put(root, "src/routes/left/route.ts", original);
      await generate(root, options);
    }

    for (const fields of cases) {
      await put(
        root,
        "src/routes/left/route.ts",
        leaf(
          "left",
          `({mutation}) => ({ todos: { write: mutation({ errors: { ${fields} }, handler: () => 1 }) } })`,
          {
            before: imports,
          },
        ),
      );

      const before = await snapshot(root);
      const configuration = { ...options, check: mode === "check" };

      await assert.rejects(generate(root, configuration));
      assert.deepEqual(await snapshot(root), before);
    }

    for (const handler of ["() => new Date()", "async () => ({ value: undefined })"]) {
      await put(
        root,
        "src/routes/left/route.ts",
        leaf("left", `({mutation}) => ({ todos: { write: mutation({ handler: ${handler} }) } })`, {
          before: imports,
        }),
      );

      const before = await snapshot(root);

      await assert.rejects(generate(root, { ...options, check: mode === "check" }));
      assert.deepEqual(await snapshot(root), before);
    }
  }

  for (const invocation of ["fake", "(mutation)"]) {
    await put(
      root,
      "src/routes/left/route.ts",
      leaf(
        "left",
        `({ mutation }) => ({ todos: { write: ${invocation}({ handler: () => 1 }) } })`,
        {
          before: `${imports}
const fake = (options: unknown) => options;`,
        },
      ),
    );
    await rejectUnchanged(root, /callback's query, mutation, stream or channel/);
  }
});

test("effective TS 6 strict checking rejects false overrides and noCheck before cold/update/check publication", async () => {
  const strictFlags = [
    "noImplicitAny",
    "strictNullChecks",
    "strictFunctionTypes",
    "strictBindCallApply",
    "strictPropertyInitialization",
    "strictBuiltinIteratorReturn",
    "noImplicitThis",
    "useUnknownInCatchVariables",
  ];

  assert.deepEqual(
    strictFlags,
    ts.optionDeclarations.filter((option) => option.strictFlag).map((option) => option.name),
  );

  const unsafeHead = `
import type { Schema } from '@loozo/angular-launch/server';
const data: Schema<string, string | undefined> = {
  '~standard': { version: 1, vendor: 'strict-contracts', validate(value) {
    if (typeof value !== 'string') { return { issues: [{ message: 'string required' }] }; }
    return { value: undefined };
  } },
};
`;
  const unsafe = leaf(
    "left",
    `({mutation}) => ({ todos: {
  complete: mutation({
    errors: { NOT_FOUND: { status: 404, message: 'Unsafe updated contract', data } },
    handler: ({ errors }): string => { throw errors.NOT_FOUND('id'); },
  }),
} })`,
    { before: unsafeHead },
  );
  const implicitAnyHead = `
import type { Schema } from '@loozo/angular-launch/server';
function identity(value) { return value; }
const data: Schema<string, string> = {
  '~standard': { version: 1, vendor: 'strict-contracts', validate(value) {
    if (typeof value !== 'string') { return { issues: [{ message: 'string required' }] }; }
    return { value: identity(undefined) };
  } },
};
`;
  const implicitAny = leaf(
    "left",
    `({mutation}) => ({ todos: {
  complete: mutation({
    errors: { NOT_FOUND: { status: 404, message: 'Unsafe updated contract', data } },
    handler: ({ errors }): string => { throw errors.NOT_FOUND('id'); },
  }),
} })`,
    { before: implicitAnyHead },
  );

  for (const mode of ["cold", "update", "check"]) {
    const root = await fixture();
    const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));
    const strictOptions = { ...config.compilerOptions };
    const safeSource = await readFile(resolve(root, "src/routes/left/route.ts"), "utf8");

    if (mode !== "cold") {
      await generate(root, options);
    }

    const before = await snapshot(root);
    const configuration = { ...options, check: mode === "check" };

    await put(root, "src/routes/left/route.ts", unsafe);
    await assert.rejects(generate(root, configuration), /not assignable/);
    assert.deepEqual(await snapshot(root), before);

    const weakOptions = [];

    for (const flag of strictFlags) {
      weakOptions.push({ name: flag, options: { [flag]: false } });
    }

    weakOptions.push({ name: "noImplicitAny", options: { strict: false } });
    weakOptions.push({ name: "noCheck", options: { noCheck: true } });

    for (const weak of weakOptions) {
      config.compilerOptions = { ...strictOptions, ...weak.options };
      await put(root, "tsconfig.json", JSON.stringify(config));
      await put(root, "src/routes/left/route.ts", unsafe);

      const configBefore = await readFile(resolve(root, "tsconfig.json"), "utf8");

      await assert.rejects(
        generate(root, configuration),
        new RegExp(`effective strict TypeScript checking: ${weak.name}`),
      );
      assert.deepEqual(await snapshot(root), before);
      assert.equal(await readFile(resolve(root, "tsconfig.json"), "utf8"), configBefore);
    }

    config.compilerOptions = { ...strictOptions, noImplicitAny: false };
    await put(root, "tsconfig.json", JSON.stringify(config));
    await put(root, "src/routes/left/route.ts", implicitAny);
    await assert.rejects(
      generate(root, configuration),
      /effective strict TypeScript checking: noImplicitAny/,
    );
    assert.deepEqual(await snapshot(root), before);

    config.compilerOptions = strictOptions;
    await put(root, "tsconfig.json", JSON.stringify(config));
    await assert.rejects(generate(root, configuration), /implicitly has an 'any' type/);
    assert.deepEqual(await snapshot(root), before);

    // An inherited false remains disabled even when the child says strict:true.
    await put(
      root,
      "tsconfig.base.json",
      JSON.stringify({ compilerOptions: { ...strictOptions, noImplicitAny: false } }),
    );
    await put(
      root,
      "tsconfig.json",
      JSON.stringify({
        extends: "./tsconfig.base.json",
        compilerOptions: { strict: true },
        include: config.include,
      }),
    );
    await assert.rejects(
      generate(root, configuration),
      /effective strict TypeScript checking: noImplicitAny/,
    );
    assert.deepEqual(await snapshot(root), before);

    // Effective checking, not the spelling strict:true, determines admission.
    // TS 6 defaults these checks on; explicit per-flag true overrides strict:false.
    await put(root, "src/routes/left/route.ts", safeSource);
    config.compilerOptions = { ...strictOptions };
    delete config.compilerOptions.strict;
    await put(root, "tsconfig.json", JSON.stringify(config));
    await generate(root, options);
    await generate(root, { ...options, check: true });

    config.compilerOptions = { ...strictOptions, strict: false };

    for (const flag of strictFlags) {
      config.compilerOptions[flag] = true;
      assert.equal(ts.getStrictOptionValue(config.compilerOptions, flag), true);
    }

    await put(root, "tsconfig.json", JSON.stringify(config));

    const accepted = await snapshot(root);

    await generate(root, options);
    await generate(root, { ...options, check: true });
    assert.deepEqual(await snapshot(root), accepted);
  }
});

test("tanstackQuery adds route.queries and type Queries to each copy; off writes neither", async () => {
  const root = await fixture();

  await put(
    root,
    "src/schema.ts",
    `import type { Schema } from '@loozo/angular-launch/server';
export const schema: Schema<string, {length:number}> = {'~standard': {version:1,vendor:'test',validate: async value => {
if (typeof value !== 'string') { return {issues:[{message:'string required'}]}; }
return {value: {length: value.length}};
}}};`,
  );
  await put(
    root,
    "src/routes/left/route.ts",
    leaf(
      "left",
      `({query, mutation}) => ({todos: {
list: query({handler: async ({context}) => ({value: context.value})}),
length: query({input:schema, handler: ({input}) => ({length:input.length})}),
write: mutation({input:schema, handler: ({input}) => input.length}),
clear: mutation({handler: () => null}),
}})`,
      { before: "import {schema} from '../../schema';" },
    ),
  );
  await generate(root, options);

  const off = await snapshot(root);
  const left = off["src/routes/left/route.generated.ts"].bytes;

  assert.doesNotMatch(left, /Queries|tanstack|queries/);
  await generate(root, { ...options, tanstackQuery: false });
  assert.deepEqual(await snapshot(root), off);
  await generate(root, { ...options, tanstackQuery: true });

  const on = await snapshot(root);
  const copy = on["src/routes/left/route.generated.ts"].bytes;

  assert.match(
    copy,
    /import type \{ QueriesOf as routegen\$t2 \} from "@loozo\/angular-launch\/tanstack-query";/,
  );
  assert.match(copy, /export type Queries = routegen\$t2<typeof routegen\$route>;/);
  assert.match(
    copy,
    /type routegen\$Members = \{ readonly remote: Remote; readonly queries: Queries \};/,
  );
  assert.deepEqual(ownData(copy), ownData(left));
  assert.match(
    on["generated/routes.generated.ts"].bytes,
    /readonly queries: routegen\$t2<typeof route_left_route>/,
  );

  for (const [file, { bytes }] of Object.entries(on)) {
    if (!file.endsWith("route.generated.ts") && !file.endsWith("routes.generated.ts")) {
      assert.equal(bytes, off[file].bytes, file);
    }
  }

  await assert.rejects(generate(root, { ...options, check: true }), /Generated artifacts changed/);

  // Generation type-checks direct importers of generated files, so these are the public type tests.
  await put(
    root,
    "src/queries.ts",
    `import { injectMutation, injectQuery, QueryClient, skipToken } from '@tanstack/angular-query';
import { injectRoute, type Queries } from './routes/left/route.generated';
import { injectRoute as injectAuth } from './routes/+auth/route.generated';
const queries: Queries = injectRoute().queries;
const client = new QueryClient();
const namespace: readonly ['launch', 'todos'] = queries.todos.$key();
const session: readonly ['launch', 'session'] = queries.session.$key();
const procedure: readonly ['launch', 'todos', 'length'] = queries.todos.length.key();
const inputKey: readonly ['launch', 'todos', 'length', string] = queries.todos.length.key('hello');
const mutationKey: readonly ['launch', 'todos', 'write'] = queries.todos.write.key();
// Bound first, so the declared types don't drive inference.
const listedData = client.getQueryData(queries.todos.list.queryOptions().queryKey);
const listed: {value:number} | undefined = listedData;
const byInputData = client.getQueryData(queries.todos.length.key('hello'));
const byInput: {length:number} | undefined = byInputData;
// @ts-expect-error keys are tagged with the output type
const wrong: string | undefined = listedData;
declare const maybe: string | undefined;
const skippedData = client.getQueryData(queries.todos.length.queryOptions(maybe ?? skipToken).queryKey);
const skipped: {length:number} | undefined = skippedData;
queries.session.current.queryOptions({ staleTime: 0, refetchOnMount: 'always', retry: false });
// @ts-expect-error caller input is a string
queries.todos.length.queryOptions({length: 1});
// @ts-expect-error input queries need their input
queries.todos.length.queryOptions();
// @ts-expect-error queries have no mutation options
queries.todos.list.mutationOptions();
// @ts-expect-error mutations have no query options
queries.todos.write.queryOptions('hello');
// @ts-expect-error the key is generated
queries.todos.list.queryOptions({ queryKey: ['other'] });
// @ts-expect-error the mutation function is generated
queries.todos.write.mutationOptions({ mutationFn: async () => 1 });
// @ts-expect-error an ancestor has no descendant namespace
injectAuth().queries.todos;
export function page() {
  const list = injectQuery(() => queries.todos.list.queryOptions());
  const value: {value:number} | undefined = list.data();
  const write = injectMutation(() => queries.todos.write.mutationOptions({ onSuccess: (length: number, title: string) => { void length; void title; } }));
  write.mutate('title');
  // @ts-expect-error variables are the caller input
  write.mutate(1);
  const clear = injectMutation(() => queries.todos.clear.mutationOptions());
  clear.mutate();
  return { value };
}
void namespace; void session; void procedure; void inputKey; void mutationKey; void listed; void byInput; void wrong; void skipped;`,
  );
  await generate(root, { ...options, tanstackQuery: true });
  await generate(root, { ...options, tanstackQuery: true, check: true });

  const session = createGenerationSession(root, { ...options, tanstackQuery: true });

  try {
    await session.generate({ check: true });
  } finally {
    await session.dispose();
  }

  // Without the option, a page that reads route.queries is a type error.
  await rejectUnchanged(root, /queries\.ts.*Property 'queries' does not exist/s);
});
