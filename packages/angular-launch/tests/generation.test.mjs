import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { mkdir, writeFile, readFile, readdir, stat, rm, rename, symlink } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { generate, createGenerationSession } from "../dist/generation/index.js";
import { generate as generateRouter } from "../../angular-router/node/src/generation/generate.js";

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
    "src/context.ts",
    `import { defineContext as context } from '@loozo/angular-launch/server';
export default context(async (request: Request) => ({ request, user: null as {id: string} | null, value: 7 }));`,
  );
  await put(
    root,
    "src/routes/route.ts",
    `import { defineRoute } from '@loozo/angular-router'; export default defineRoute('', {});`,
  );
  await put(
    root,
    "src/routes/+auth/route.ts",
    `import { defineRoute } from '@loozo/angular-router'; import parent from '../route'; export default defineRoute('', {parent});`,
  );
  await put(
    root,
    "src/routes/+auth/rpc.ts",
    `import { defineRpc as rpc } from '@loozo/angular-launch/server'; export default rpc('session', ({query}) => ({current: query({handler: ({context}) => context.value})}));`,
  );

  for (const [name, namespace] of [
    ["left", "todos"],
    ["right", "items"],
  ]) {
    // Explicit parent need not match directory ancestry.
    await put(
      root,
      `src/routes/${name}/route.ts`,
      `import { defineRoute } from '@loozo/angular-router'; import parent from '../+auth/route'; export default defineRoute('${name}', {parent});`,
    );
    await put(
      root,
      `src/routes/${name}/page.ts`,
      `import { Component } from '@angular/core'; @Component({selector:'fixture-${name}',template:'ok'}) export default class Page {}`,
    );
    await put(
      root,
      `src/routes/${name}/rpc.ts`,
      `import { defineRpc } from '@loozo/angular-launch/server'; export default defineRpc('${namespace}', ({query}) => ({list: query({handler: async ({context}) => ({value: context.value})})}));`,
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

async function rejectUnchanged(root, expected) {
  const before = await snapshot(root);

  await assert.rejects(generate(root, options), expected);
  assert.deepEqual(await snapshot(root), before);
}

test("combined cold generation, scope, actual schema/context/client types, deterministic bytes and stop/check", async () => {
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
    "src/routes/left/rpc.ts",
    `import { defineRpc, middleware, type MiddlewareArgs } from '@loozo/angular-launch/server'; import {schema} from '../../schema';
const checked = middleware(async ({context,request,input,signal,next}: MiddlewareArgs<{value:number}, {length:number}>) => {
if (!(request instanceof Request) || signal.aborted || input.length === 0 || context.value === 0) { throw new Error('unexpected'); }
return next();
});
export default defineRpc('todos', ({query}) => ({
list: query({handler: async ({context}) => ({value: context.value})}),
length: query({input:schema, use:[checked], handler: ({input,context}) => {
// @ts-expect-error ordinary nullable context; middleware that adds nothing does not narrow
context.user.id;
// @ts-expect-error transformed input is not caller string
input.toUpperCase();
return {length:input.length};
}})}));`,
  );
  await put(
    root,
    "src/checks.ts",
    `import { injectRpc } from './routes/left/rpc.generated';
import { injectRpc as injectRoot } from './routes/rpc.generated';
import { injectRpc as injectAuth } from './routes/+auth/rpc.generated';
import { injectRpc as injectRight } from './routes/right/rpc.generated';
import type {ContextOf} from '@loozo/angular-launch/server';
import context from './context';
const value: ContextOf<typeof context> = {request:new Request('http://test'),user:null,value:7};
const client = injectRpc();
const result: Promise<{length:number}> = client.todos.length('hello', {signal:new AbortController().signal});
const kind: 'query' = client.todos.length.kind;
client.todos.list({signal:new AbortController().signal});
client.session.current();
if (client.todos.list.isError(value)) { if (value.code === 'INVALID_INPUT') { const issues: readonly {readonly path: readonly (string|number)[]; readonly message: string}[] = value.data.issues; void issues; } else { const data:null = value.data; } }
// @ts-expect-error missing caller input
client.todos.length();
// @ts-expect-error caller is string, not validated object
client.todos.length({length:1});
// @ts-expect-error no input procedure options only
client.todos.list('input');
// @ts-expect-error no descendant group
injectRoot().todos;
// @ts-expect-error ancestor facade has no descendant
injectAuth().todos;
// @ts-expect-error no sibling method
injectRight().items.length;
// @ts-expect-error no traversal API
client.at('/right');
// @ts-expect-error cannot relabel kind
const mutation: 'mutation' = kind;
// @ts-expect-error framework errors have no declared payload factory
client.todos.list.errors;
void result;`,
  );
  await generate(root, options);

  const first = await snapshot(root);

  assert.ok(Object.keys(first).length >= 12);

  const left = first["src/routes/left/rpc.generated.ts"].bytes;

  assert.match(left, /session/);
  assert.match(left, /todos/);
  assert.doesNotMatch(first["src/routes/+auth/rpc.generated.ts"].bytes, /todos/);
  await generate(root, options);
  assert.deepEqual(await snapshot(root), first);
  await generate(root, { ...options, check: true });

  const routes = resolve(root, "generated/routes.generated.ts");

  await writeFile(routes, first["generated/routes.generated.ts"].bytes + "\n// drift");

  const drift = await snapshot(root);

  await assert.rejects(generate(root, { ...options, check: true }), /Generated artifacts changed/);
  assert.deepEqual(await snapshot(root), drift);
});

test("generated project preserves DTO interfaces and exact awaited/transformed types without index signatures", async () => {
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
    "src/routes/left/rpc.ts",
    `import {defineRpc,middleware,type MiddlewareArgs} from '@loozo/angular-launch/server';
import {schema,identity,mutableIdentity,aliasIdentity,aliasTodo,functionInput,undefinedInput,dateSchema,list,readonlyList,tuple} from '../../dto';
import type {Input,Transformed,Todo} from '../../dto';
export default defineRpc('todos',({query}) => ({
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
}));`,
  );
  await put(
    root,
    "src/checks.ts",
    `import {injectRpc} from './routes/left/rpc.generated';
import type {Todo,ReadonlyTodo,Input,MutableInput,AliasTodo} from './dto';
import context from './context';
import {createRequestScope,provideLaunchServer} from '@loozo/angular-launch/_server';
import {handleRequest} from '../generated/server.generated';
const binding={id:'compile-app',context};
const handled:Promise<Response|null>=handleRequest(new Request('http://test'),{allowedHosts:['test'],origins:['https://public.test']});
// @ts-expect-error handleRequest requires options
handleRequest(new Request('http://test'));
// @ts-expect-error allowedHosts is required
handleRequest(new Request('http://test'),{origins:[]});
void handled;
const scope=createRequestScope(binding,new Request('http://test'));
// @ts-expect-error no unbound factory-only fallback
createRequestScope(context,new Request('http://test'));
// @ts-expect-error backend requires application binding
provideLaunchServer({});
void scope;
const rpc=injectRpc();
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

test("generated context and every group payload import reject native suffix redirection before writes/check", async () => {
  for (const target of ["context", "rpc"]) {
    const root = await fixture();

    await generate(root, options);

    const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

    config.compilerOptions.moduleSuffixes = [".fake", ""];
    config.exclude = ["**/*.fake.ts"];
    await put(root, "tsconfig.json", JSON.stringify(config));

    if (target === "context") {
      await put(
        root,
        "src/context.fake.ts",
        `export default {create:(request:Request)=>({request,user:null,value:999})};`,
      );
    } else {
      await put(
        root,
        "src/routes/left/rpc.fake.ts",
        `const kind:'query'='query';export default {name:'todos',use:[],procedures:{list:{kind,input:undefined,use:[],handler:async()=>({value:999})}}};`,
      );
    }

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

    // Cold publication must also remain completely empty.
    for (const file of Object.keys(before)) {
      await rm(resolve(root, file));
    }

    await rejectUnchanged(root, /Generated payload import must resolve/);
    assert.deepEqual(await snapshot(root), {});
  }
});

test("nonwriting check and stop; namespace wire IDs stable across relocation", async () => {
  const root = await fixture();

  await generate(root, options, () => true);
  assert.deepEqual(await snapshot(root), {});
  await generate(root, options);

  const first = await snapshot(root);
  const appId = /appBinding = \{ id: "([a-f0-9]{64})"/.exec(
    first["generated/server.generated.ts"].bytes,
  )[1];
  const file = "generated/routes.generated.ts";

  await put(root, file, first[file].bytes + "\n// drift");

  const drift = await snapshot(root);

  await assert.rejects(generate(root, { ...options, check: true }), /Generated artifacts changed/);
  assert.deepEqual(await snapshot(root), drift);
  await generate(root, options);

  const registry = /export const registry = .*;/.exec(
    first["generated/server.generated.ts"].bytes,
  )[0];

  assert.match(registry, /"session": group\d, "todos": group\d, "items": group\d/);
  assert.doesNotMatch(first["src/routes/left/rpc.generated.ts"].bytes, /"id"/);
  await rename(resolve(root, "src/routes/left"), resolve(root, "src/routes/relocated"));
  await generate(root, options);
  assert.equal(
    /export const registry = .*;/.exec(
      (await snapshot(root))["generated/server.generated.ts"].bytes,
    )[0],
    registry,
  );
  await rename(resolve(root, "src/routes/relocated"), resolve(root, "src/routes/left"));
  await put(
    root,
    "src/routes/left/rpc.ts",
    `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('renamed', ({query}) => ({different:query({handler:()=>8})}));`,
  );
  await generate(root, options);
  assert.match((await snapshot(root))["generated/server.generated.ts"].bytes, /"renamed": group/);

  const moved = root + "-moved";

  await rename(root, moved);
  await generate(moved, options);
  assert.match((await snapshot(moved))["generated/server.generated.ts"].bytes, new RegExp(appId));
  await put(
    moved,
    "src/context.ts",
    `import {defineContext} from '@loozo/angular-launch/server';export default defineContext(async(request:Request)=>({request,user:null,value:8}));`,
  );
  await generate(moved, options);
  assert.doesNotMatch(
    (await snapshot(moved))["generated/server.generated.ts"].bytes,
    new RegExp(appId),
  );
});

test("combined semantic preflight is strict and prevents all router and Launch writes", async () => {
  const root = await fixture();

  await put(
    root,
    "src/routes/left/rpc.ts",
    `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('todos',({query}) => ({list:query({handler:({context})=>context.nonexistent})}));`,
  );
  await rejectUnchanged(root, /nonexistent/);
  await put(
    root,
    "src/routes/left/rpc.ts",
    `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('todos',({query}) => ({list:query({handler:()=>7})}));`,
  );

  const route = await readFile(resolve(root, "src/routes/left/route.ts"), "utf8");

  await put(
    root,
    "src/routes/left/route.ts",
    `import {defineRoute} from '@loozo/angular-router'; import parent from '../+auth/route'; export default defineRoute('left',{parent,resolve:{x:()=>missingRouteValue}});`,
  );
  await rejectUnchanged(root, /missingRouteValue/);
  // Generation checks only its own domain; an unrelated application declaration
  // error is left to the application's build and no longer blocks publication.
  await put(root, "src/routes/left/route.ts", route);
  await put(root, "src/broken.d.ts", "export interface Broken { value: MissingType; }");
  await generate(root, options);

  const stale = await fixture();

  await generate(stale, options);
  await put(
    stale,
    "generated/routes.generated.ts",
    "// @loozo/angular-router routegen: owned routes.generated.ts\n// obsolete",
  );
  await rm(resolve(stale, "generated/destinations.generated.ts"));
  await put(
    stale,
    "src/routes/left/rpc.ts",
    `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('todos',({query}) => ({list:query({handler:({context})=>context.nonexistent})}));`,
  );
  await rejectUnchanged(stale, /nonexistent/);
});

test("final check covers generated outputs, declarations and direct importers but not unrelated files", async () => {
  const root = await fixture();

  await put(root, "src/unrelated.ts", "export const wrong: number = 'unrelated';");
  await generate(root, options);
  await generate(root, { ...options, check: true });

  for (const reference of [
    "import {injectRpc} from './routes/left/rpc.generated'; void injectRpc;",
    "export {injectRpc} from './routes/left/rpc.generated';",
    "export const load = () => import('./routes/left/rpc.generated');",
    "export type Rpc = import('./routes/left/rpc.generated').Rpc;",
  ]) {
    await put(root, "src/consumer.ts", `${reference}\nexport const wrong: number = 'importer';`);
    await rejectUnchanged(root, /consumer\.ts/);
  }

  await rm(resolve(root, "src/consumer.ts"));
  await generate(root, { ...options, check: true });

  // The generated registration is checked despite the consumer's skipLibCheck:true.
  await put(
    root,
    "src/register.d.ts",
    "declare module '@loozo/angular-launch/server' { interface Register { context: number } } export {};",
  );
  await rejectUnchanged(root, /context\.generated\.d\.ts/);
});

test("only __proto__ namespace/procedure is reserved before cold publication, updates or check", async () => {
  for (const [body, diagnostic] of [
    [
      "defineRpc('__proto__',({query}) => ({list:query({handler:()=>1})}))",
      "RPC namespace '__proto__' is reserved",
    ],
    [
      "defineRpc('todos',({query}) => ({__proto__:query({handler:()=>1})}))",
      "RPC procedure '__proto__' is reserved",
    ],
    [
      "defineRpc('todos',({query}) => ({'__proto__':query({handler:()=>1})}))",
      "RPC procedure '__proto__' is reserved",
    ],
  ]) {
    const root = await fixture();
    const authored = `import {defineRpc} from '@loozo/angular-launch/server';export default ${body};`;
    const expected = (error) =>
      error.message.includes("src/routes/left/rpc.ts:") && error.message.includes(diagnostic);

    await put(root, "src/routes/left/rpc.ts", authored);
    await rejectUnchanged(root, expected);
    assert.deepEqual(await snapshot(root), {});
    await assert.rejects(generate(root, { ...options, check: true }), expected);
    assert.deepEqual(await snapshot(root), {});
    await put(
      root,
      "src/routes/left/rpc.ts",
      `import {defineRpc} from '@loozo/angular-launch/server';export default defineRpc('todos',({query}) => ({list:query({handler:()=>1})}));`,
    );
    await generate(root, options);
    await put(root, "src/routes/left/rpc.ts", authored);
    await rejectUnchanged(root, expected);

    const before = await snapshot(root);

    await assert.rejects(generate(root, { ...options, check: true }), expected);
    assert.deepEqual(await snapshot(root), before);
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
    "src/routes/left/rpc.ts",
    `import {defineRpc} from '@loozo/angular-launch/server';import {schema} from '../../schema';
export default defineRpc('constructor',({query}) => ({
constructor:query({input:schema,handler:({input})=>{
const text:string=input.text;
// @ts-expect-error transformed input is not the caller union
const caller:string|number=input;
return {text};
}}),toString:query({handler:()=>1})}));`,
  );
  await put(
    root,
    "src/routes/right/rpc.ts",
    `import {defineRpc} from '@loozo/angular-launch/server';
export default defineRpc('toString',({query}) => ({constructor:query({handler:()=>1}),toString:query({handler:()=>2})}));`,
  );
  await put(
    root,
    "src/checks.ts",
    `import {injectRpc as left} from './routes/left/rpc.generated';import {injectRpc as right} from './routes/right/rpc.generated';
const a:Promise<{text:string}>=left().constructor.constructor('one');
const b:Promise<{text:string}>=left().constructor.constructor(1);
const c:Promise<number>=left().constructor.toString();
const d:Promise<number>=right().toString.constructor();
const e:Promise<number>=right().toString.toString();
// @ts-expect-error caller input union excludes boolean
left().constructor.constructor(true);
// @ts-expect-error awaited result is not any
const wrong:Promise<string>=left().constructor.constructor(1);
void a;void b;void c;void d;void e;`,
  );
  await generate(root, options);
  await generate(root, { ...options, check: true });

  const facade = await readFile(resolve(root, "src/routes/left/rpc.generated.ts"), "utf8");

  assert.ok(facade.includes('"constructor":{"methods":'));
  assert.match(
    await readFile(resolve(root, "generated/server.generated.ts"), "utf8"),
    /"constructor": group\d, "toString": group\d/,
  );
  assert.ok(facade.includes('"name":"constructor","input":true'));
  assert.ok(facade.includes('"name":"toString","input":false'));
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
    "src/routes/left/rpc.ts",
    `import {defineRpc} from '@loozo/angular-launch/server';import {optionalSchema} from '../../schema';
export default defineRpc('todos',({query}) => ({list:query({input:optionalSchema,handler:()=>1})}));`,
  );

  const native = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(native.config, ts.sys, root);
  const consumer = ts.createProgram(parsed.fileNames, parsed.options);

  assert.deepEqual(ts.getPreEmitDiagnostics(consumer), []);

  const expected = (error) =>
    error.message.includes("src/routes/left/rpc.ts:") &&
    error.message.includes("Explicit query input must have a concrete Standard Schema type");

  await rejectUnchanged(root, expected);

  const before = await snapshot(root);

  await assert.rejects(generate(root, { ...options, check: true }), expected);
  assert.deepEqual(await snapshot(root), before);

  for (const file of Object.keys(before)) {
    await rm(resolve(root, file));
  }

  await rejectUnchanged(root, expected);
  assert.deepEqual(await snapshot(root), {});
});

test("missing/duplicate context, unknown defaults, missing/redirect owners and namespace collisions", async () => {
  const cases = [
    ["missing", async (root) => rm(resolve(root, "src/context.ts")), /exactly one/],
    [
      "duplicate",
      async (root) =>
        put(
          root,
          "src/another.ts",
          `import {defineContext} from '@loozo/angular-launch/server'; export default defineContext(()=>({value:7}));`,
        ),
      /exactly one/,
    ],
    [
      "unknown",
      async (root) => put(root, "src/routes/unknown.ts", "export default function bootstrap() {}"),
      /Default export/,
    ],
    [
      "missing owner",
      async (root) =>
        put(
          root,
          "src/routes/missing/rpc.ts",
          `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('missing',({query}) => ({x:query({handler:()=>7})}));`,
        ),
      /colocated retained/,
    ],
    [
      "redirect owner",
      async (root) => {
        await rm(resolve(root, "src/routes/left/page.ts"));
        await put(
          root,
          "src/routes/left/route.ts",
          `import {defineRoute} from '@loozo/angular-router'; import to from '../right/route'; export default defineRoute('old',{redirect:{to,search:{mode:'drop'},fragment:{mode:'drop'}}});`,
        );
      },
      /colocated retained/,
    ],
    [
      "ancestry",
      async (root) =>
        put(
          root,
          "src/routes/left/rpc.ts",
          `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('session',({query}) => ({x:query({handler:()=>7})}));`,
        ),
      /Duplicate RPC namespace: session/,
    ],
    [
      "sibling namespace",
      async (root) =>
        put(
          root,
          "src/routes/right/rpc.ts",
          `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('todos',({query}) => ({x:query({handler:()=>7})}));`,
        ),
      /Duplicate RPC namespace: todos/,
    ],
    [
      "same-directory groups",
      async (root) =>
        put(
          root,
          "src/routes/left/another.ts",
          `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('another',({query}) => ({x:query({handler:()=>1})}));`,
        ),
      /one RPC group/,
    ],
    [
      "pruned owner",
      async (root) => {
        await put(
          root,
          "src/routes/destination/route.ts",
          `import {defineRoute} from '@loozo/angular-router'; export default defineRoute('destination',{});`,
        );
        await put(
          root,
          "src/routes/destination/page.ts",
          `import {Component} from '@angular/core'; @Component({selector:'fixture-destination',template:'ok'}) export default class Page {}`,
        );

        for (const name of ["left", "right"]) {
          await rm(resolve(root, `src/routes/${name}/page.ts`));
          await rm(resolve(root, `src/routes/${name}/rpc.ts`));
          await put(
            root,
            `src/routes/${name}/route.ts`,
            `import {defineRoute} from '@loozo/angular-router'; import parent from '../+auth/route'; import to from '../destination/route'; export default defineRoute('${name}',{parent,redirect:{to,search:{mode:'drop'},fragment:{mode:'drop'}}});`,
          );
        }
      },
      /colocated retained/,
    ],
  ];

  for (const [label, mutate, expected] of cases) {
    const root = await fixture();

    await mutate(root);
    await rejectUnchanged(root, expected);
    console.log(`qualified ${label}`);
  }
});

// Type-checks the fixture project with `text` as an extra file, src/checks-extra.ts,
// returning the diagnostics' messages.
function diagnostics(root, text) {
  const file = resolve(root, "src/checks-extra.ts");
  const config = ts.readConfigFile(resolve(root, "tsconfig.json"), (name) => ts.sys.readFile(name));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const host = ts.createCompilerHost(parsed.options);
  const readFile = host.readFile;

  host.readFile = (name) => {
    if (resolve(name) === file) {
      return text;
    }

    return readFile(name);
  };
  host.fileExists = (name) => resolve(name) === file || ts.sys.fileExists(name);

  const program = ts.createProgram([...parsed.fileNames, file], parsed.options, host);
  const messages = [];

  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    messages.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
  }

  return messages;
}

test("middleware narrows through the group, takes procedure input and fails on the offending use entry", async () => {
  const root = await fixture();

  await put(
    root,
    "src/auth.ts",
    `import { forbidden, middleware, type MiddlewareArgs, type Schema } from '@loozo/angular-launch/server';
export const idSchema: Schema<{id:string}> = {'~standard': {version:1,vendor:'test',validate: value => {
if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') { return {issues:[{message:'id'}]}; }
return {value: {id: value.id}};
}}};
export const lengthSchema: Schema<string, {id:string;length:number}> = {'~standard': {version:1,vendor:'test',validate: value => {
if (typeof value !== 'string') { return {issues:[{message:'string'}]}; }
return {value: {id: value, length: value.length}};
}}};
export const titleSchema: Schema<{title:string}> = {'~standard': {version:1,vendor:'test',validate: value => {
if (typeof value !== 'object' || value === null || !('title' in value) || typeof value.title !== 'string') { return {issues:[{message:'title'}]}; }
return {value: {title: value.title}};
}}};
export const signedIn = middleware(async ({ context, next }) => {
if (context.user === null) { throw forbidden(); }
return next({ user: context.user });
});
export const timing = middleware(async ({ next }) => {
try { return await next(); } finally { void 0; }
});
export const owned = middleware(async ({ context, input, next }: MiddlewareArgs<{ user: { id: string } }, { id: string }>) => {
if (input.id !== context.user.id) { throw forbidden(); }
return next({ owner: context.user.id });
});`,
  );
  await put(
    root,
    "src/routes/left/rpc.ts",
    `import { defineRpc } from '@loozo/angular-launch/server';
import { idSchema, lengthSchema, owned, signedIn, timing } from '../../auth';
export default defineRpc('todos', ({ query, mutation }) => ({
list: query({ handler: ({ context, request, signal }) => {
const user: { id: string } = context.user;
return { id: user.id, url: request.url, aborted: signal.aborted, value: context.value };
} }),
get: query({ input: idSchema, use: [owned], handler: ({ context }) => {
const owner: string = context.owner;
return owner;
} }),
length: mutation({ input: lengthSchema, use: [owned], handler: ({ context, input }) => context.owner.length + input.length }),
}), { use: [timing, signedIn] });`,
  );
  await put(
    root,
    "src/checks.ts",
    `import { injectRpc } from './routes/left/rpc.generated';
const rpc = injectRpc();
const list: Promise<{ id: string; url: string; aborted: boolean; value: number }> = rpc.todos.list();
const get: Promise<string> = rpc.todos.get({ id: '1' });
const length: Promise<number> = rpc.todos.length('abc');
// @ts-expect-error callers pass the schema's input, not middleware values
rpc.todos.get({ owner: '1' });
void list; void get; void length;`,
  );
  await generate(root, options);

  const left = await readFile(resolve(root, "src/routes/left/rpc.generated.ts"), "utf8");

  assert.match(
    left,
    /"todos":\{"methods":\[\{"name":"list","input":false,"kind":"query","errors":\[\]\},\{"name":"get","input":true,"kind":"query","errors":\[\]\},\{"name":"length","input":true,"kind":"mutation","errors":\[\]\}\]\}/,
  );

  // Generation only accepts default-exported groups, so the misfits compile on their own
  // against the registered context.
  const misfits = `import { defineRpc, middleware, type MiddlewareArgs } from '@loozo/angular-launch/server';
import { idSchema, owned, signedIn, titleSchema } from './auth';
defineRpc('needsEarlierValue', ({ query }) => ({
// @ts-expect-error owned needs user, which no earlier middleware adds
get: query({ input: idSchema, use: [owned], handler: () => null }),
}));
// @ts-expect-error owned needs input, which group middleware doesn't get
defineRpc('needsInputAtGroup', ({ query }) => ({ get: query({ handler: () => null }) }), { use: [signedIn, owned] });
defineRpc('mismatchedInput', ({ query }) => ({
get: query({ input: titleSchema,
// @ts-expect-error owned needs { id }, the schema gives { title }
use: [owned], handler: () => null }),
}), { use: [signedIn] });
defineRpc('wrongOrder', ({ query }) => ({
get: query({ input: idSchema,
// @ts-expect-error owned runs before signedIn adds user
use: [owned, signedIn], handler: () => null }),
}));
defineRpc('notNarrowed', ({ query }) => ({
get: query({ handler: ({ context }) => {
// @ts-expect-error without signedIn, user stays nullable
const user: { id: string } = context.user;
return user.id;
} }),
}));
const optionalUser = middleware(async ({ next }) => {
const added: { user?: { id: string } } = {};
// @ts-expect-error a missing optional value would leave the earlier user in place
return next(added);
});
const readsUser = middleware(async ({ context, next }: MiddlewareArgs<{ user?: { id: string } }>) => {
if (context.user !== undefined) { void context.user.id; }
return next();
});
// @ts-expect-error optionalUser's addition has an optional key, so the chain can't follow it
defineRpc('optionalAddition', ({ query }) => ({ get: query({ handler: () => null }) }), { use: [optionalUser, readsUser] });
const maybeUser = middleware(async ({ context, next }) => next({ user: context.user }));
defineRpc('maybeAddition', ({ query }) => ({
get: query({ handler: ({ context }) => {
const user: { id: string } | null = context.user;
// @ts-expect-error the added user may be null
const present: { id: string } = context.user;
return [user, present];
} }),
}), { use: [maybeUser] });
type Patch = { mode: 'optional'; user?: { id: string } } | { mode: 'unchanged' };
const unionPatch = middleware(async ({ next }) => {
// @ts-expect-error a union could hide an optional key in one of its members
return next<Patch>({ mode: 'optional' });
});
const readsMode = middleware(async ({ context, next }: MiddlewareArgs<{ mode: 'optional'; user: { id: string } } | { mode: 'unchanged'; user: { id: string } | null }>) => {
if (context.mode === 'optional') { void context.user.id; }
return next();
});
// @ts-expect-error unionPatch's addition is a union, so the chain can't follow it
defineRpc('unionAddition', ({ query }) => ({ get: query({ handler: () => null }) }), { use: [unionPatch, readsMode] });
declare const flag: boolean;
const eitherKey = middleware(async ({ next }) =>
// @ts-expect-error alternatives inferred from a conditional are a union too
next(flag ? { a: 1 } : { b: 2 }));
void eitherKey;
declare const anonymous: boolean;
const needsUser = middleware(async ({ next }: MiddlewareArgs<{ user: { id: string } }>) => next());
// @ts-expect-error next({ user: null }) and next() add different keys
const maybeAnonymous = middleware(async ({ next }) => {
if (anonymous) { return next({ user: null }); }
return next();
});
defineRpc('maybeAnonymous', ({ query }) => ({ current: query({ handler: ({ context }) => context.user.id }) }), { use: [signedIn, maybeAnonymous, needsUser] });
// @ts-expect-error { traceId } and { traceId, user } are different keys
const maybeTraced = middleware(async ({ next }) => {
if (anonymous) { return next({ traceId: 'a', user: null }); }
return next({ traceId: 'b' });
});
defineRpc('maybeTraced', ({ query }) => ({ current: query({ handler: ({ context }) => context.user.id }) }), { use: [signedIn, maybeTraced, needsUser] });
const sameKeys = middleware(async ({ context, next }) => {
if (anonymous) { return next({ user: null }); }
return next({ user: context.user });
});
defineRpc('sameKeys', ({ query }) => ({
current: query({ handler: ({ context }) => {
const user: { id: string } | null = context.user;
// @ts-expect-error either branch may have added a null user
const present: { id: string } = context.user;
return [user, present];
} }),
}), { use: [signedIn, sameKeys] });
const previewUser = middleware(async ({ context, request, next }: MiddlewareArgs<{ user: { id: string } }>) =>
next({ user: request.headers.has('x-preview') ? null : context.user }));
defineRpc('previewUser', ({ query }) => ({
current: query({ handler: ({ context }) => {
const user: { id: string } | null = context.user;
// @ts-expect-error the preview branch adds a null user
const present: { id: string } = context.user;
return [user, present];
} }),
}), { use: [signedIn, previewUser] });
const stringOne = middleware(async ({ next }) => next({ '1': 'old' }));
const numericOne = middleware(async ({ next }) => next({ 1: 42 }));
const needsStringOne = middleware(async ({ next }: MiddlewareArgs<{ '1': string }>) => next());
defineRpc('numericOverwrite', ({ query }) => ({
current: query({ handler: ({ context }) => {
const value: number = context[1];
// @ts-expect-error the numeric key replaced the string one
const old: string = context['1'];
return [value, old];
} }),
}), { use: [stringOne, numericOne] });
// @ts-expect-error after numericOne, '1' is a number, not the string needsStringOne needs
defineRpc('numericOverwriteChain', ({ query }) => ({ get: query({ handler: () => null }) }), { use: [stringOne, numericOne, needsStringOne] });
const numericTwo = middleware(async ({ next }) => next({ 2: 42 }));
const stringTwo = middleware(async ({ next }) => next({ '2': 'new' }));
const needsNumericTwo = middleware(async ({ next }: MiddlewareArgs<{ 2: number }>) => next());
defineRpc('stringOverwrite', ({ query }) => ({
current: query({ handler: ({ context }) => {
const value: string = context['2'];
// @ts-expect-error the string key replaced the numeric one
const old: number = context[2];
return [value, old];
} }),
}), { use: [numericTwo, stringTwo] });
// @ts-expect-error after stringTwo, 2 is a string, not the number needsNumericTwo needs
defineRpc('stringOverwriteChain', ({ query }) => ({ get: query({ handler: () => null }) }), { use: [numericTwo, stringTwo, needsNumericTwo] });
const numericSeed = middleware(async ({ next }) => next({ 3: 'keep' }));
const needsNumericThree = middleware(async ({ next }: MiddlewareArgs<{ 3: string }>) => next());
const leadingZero = middleware(async ({ next }) => next({ '03': 42 }));
const decimal = middleware(async ({ next }) => next({ '3.0': 42 }));
const exponent = middleware(async ({ next }) => next({ '3e0': 42 }));
defineRpc('distinctSpellings', ({ query }) => ({
current: query({ handler: ({ context }) => {
const kept: string = context[3];
const added: number = context['03'] + context['3.0'] + context['3e0'];
return [kept.toUpperCase(), added];
} }),
}), { use: [numericSeed, leadingZero, decimal, exponent, needsNumericThree] });
// @ts-expect-error known limit: separate branches with disjoint values don't infer a union
const disjointBranches = middleware(async ({ context, request, next }: MiddlewareArgs<{ user: { id: string } }>) => {
if (request.headers.has('x-preview')) { return next({ user: null }); }
return next({ user: context.user });
});
void disjointBranches;
const anonymousPreview = middleware(async ({ context, request, next }) => {
if (request.headers.get('x-preview') === 'anonymous') {
// @ts-expect-error the context is read-only at the top level, so a write can't undo signedIn's narrowing
context.user = null;
}
return next();
});
defineRpc('anonymousPreview', ({ query }) => ({
current: query({ handler: ({ context }) => {
// @ts-expect-error handlers get the same read-only context
context.value = 0;
return context.user.id;
} }),
}), { use: [signedIn, anonymousPreview, needsUser] });
const withStats = middleware(async ({ next }) => next({ stats: { calls: 0 } }));
const countCalls = middleware(async ({ context, next }: MiddlewareArgs<{ stats: { calls: number } }>) => {
context.stats.calls += 1;
return next();
});
defineRpc('nestedWrite', ({ query }) => ({
current: query({ handler: ({ context }) => {
context.stats.calls += 1;
return context.stats.calls;
} }),
}), { use: [withStats, countCalls] });`;

  assert.deepEqual(diagnostics(root, misfits), []);

  // Each expectation is load-bearing: a fitting chain leaves its directives unused.
  const unused = "Unused '@ts-expect-error' directive.";

  for (const [misfit, fit, expected = [unused]] of [
    ["get: query({ input: idSchema, use: [owned]", "get: query({ input: idSchema, use: []"],
    ["{ use: [signedIn, owned] }", "{ use: [signedIn] }"],
    ["input: titleSchema", "input: idSchema"],
    ["use: [owned, signedIn]", "use: [signedIn, owned]"],
    ["const user: { id: string } = context.user;", "const user = context.user ?? { id: '' };"],
    // A required user fits both the next() call and the chain.
    [
      "const added: { user?: { id: string } } = {};",
      "const added: { user: { id: string } } = { user: { id: '' } };",
      [unused, unused],
    ],
    ["use: [optionalUser, readsUser]", "use: [signedIn, readsUser]"],
    ["next({ user: context.user })", "next({ user: context.user ?? { id: '' } })"],
    // A single object type fits both the next() call and the chain.
    [
      "next<Patch>({ mode: 'optional' })",
      "next({ mode: 'optional' as const, user: { id: '' } })",
      [unused, unused],
    ],
    ["next(flag ? { a: 1 } : { b: 2 })", "next({ a: flag ? 1 : 2 })"],
    // Branches that add the same keys fit, so the chain and handler see what runs.
    ["if (anonymous) { return next({ user: null }); }\nreturn next();", "return next();"],
    ["next({ traceId: 'a', user: null })", "next({ traceId: 'a' })"],
    // Without the null branch, the added user is the signed-in one.
    [
      "if (anonymous) { return next({ user: null }); }\nreturn next({ user: context.user });",
      "return next({ user: context.user ?? { id: '' } });",
    ],
    // The single-call form adds the null user only on the preview branch.
    [
      "next({ user: request.headers.has('x-preview') ? null : context.user })",
      "next({ user: context.user })",
    ],
    // One next() with a union value is the documented form of the same middleware.
    [
      "if (request.headers.has('x-preview')) { return next({ user: null }); }\nreturn next({ user: context.user });",
      "return next({ user: request.headers.has('x-preview') ? null : context.user });",
    ],
    ["context.user = null;", "void context.user;"],
    ["context.value = 0;", "void context.value;"],
  ]) {
    assert.ok(misfits.includes(misfit), misfit);
    assert.deepEqual(diagnostics(root, misfits.replace(misfit, fit)), expected, misfit);
  }
});

test("a discriminated-union context keeps its correlation through empty and non-empty next()", async () => {
  const root = await fixture();

  await put(
    root,
    "src/context.ts",
    `import { defineContext } from '@loozo/angular-launch/server';
export type Session =
  | { signedIn: true; user: { id: string }; value: number }
  | { signedIn: false; user: null; value: number };
export default defineContext(async (request: Request): Promise<Session> =>
  request.headers.has('cookie') ? { signedIn: true, user: { id: 'a' }, value: 7 } : { signedIn: false, user: null, value: 7 });`,
  );
  await generate(root, options);

  const checks = `import { defineRpc, middleware, type MiddlewareArgs } from '@loozo/angular-launch/server';
import type { Session } from './context';
const timing = middleware(async ({ next }) => next());
const needsSession = middleware(async ({ context, next }: MiddlewareArgs<Session>) => {
if (context.signedIn) { void context.user.id; }
return next();
});
const withDb = middleware(async ({ next }) => next({ db: 1 }));
defineRpc('unchanged', ({ query }) => ({
current: query({ handler: ({ context }) => {
if (context.signedIn) { return context.user.id; }
const none: null = context.user;
return none;
} }),
}), { use: [timing, needsSession] });
defineRpc('added', ({ query }) => ({
current: query({ use: [needsSession], handler: ({ context }) => {
const db: number = context.db;
if (context.signedIn) { return context.user.id + db; }
const none: null = context.user;
return none;
} }),
}), { use: [withDb] });`;

  assert.deepEqual(diagnostics(root, checks), []);
});

test("defineRpc's builder callback rejects renames, defaults, rest, non-arrows, block bodies, foreign calls and unknown keys", async () => {
  const header = `import { defineRpc } from '@loozo/angular-launch/server';`;
  const shape = /arrow function destructuring query and\/or mutation/;
  const binding = /may only destructure query and mutation, without renaming/;
  const cases = [
    [`defineRpc('todos', ({ query: read }) => ({ x: read({ handler: () => 1 }) }))`, binding],
    [
      `defineRpc('todos', ({ query = undefined as never }) => ({ x: query({ handler: () => 1 }) }))`,
      binding,
    ],
    [
      `defineRpc('todos', ({ ...builders }) => ({ x: builders.query({ handler: () => 1 }) }))`,
      binding,
    ],
    [`defineRpc('todos', ({ query, other }: any) => ({ x: query({ handler: () => 1 }) }))`, shape],
    [
      `defineRpc('todos', function ({ query }) { return { x: query({ handler: () => 1 }) }; })`,
      shape,
    ],
    [`defineRpc('todos', build)`, shape],
    [`defineRpc('todos', async ({ query }) => ({ x: query({ handler: () => 1 }) }))`, shape],
    [`defineRpc('todos', (builders) => ({ x: builders.query({ handler: () => 1 }) }))`, shape],
    [`defineRpc('todos', ({ query }) => { return { x: query({ handler: () => 1 }) }; })`, shape],
    [`defineRpc('todos', ({ query }) => (procedures))`, /RPC procedures must be an inline object/],
    [
      `defineRpc('todos', ({ query }) => ({ x: helper({ handler: () => 1 }) }))`,
      /callback's query or mutation/,
    ],
    [
      `defineRpc('todos', ({ query }) => ({ x: (query)({ handler: () => 1 }) }))`,
      /callback's query or mutation/,
    ],
    [
      `defineRpc('todos', ({ query }) => ({ x: query({ handler: () => 1, canActivate: [] }) }))`,
      /Unsupported Launch option: canActivate/,
    ],
    [
      `defineRpc('todos', ({ query }) => ({ x: query({ handler: () => 1 }) }), { canActivate: [] })`,
      /Unsupported Launch option: canActivate/,
    ],
  ];

  for (const [call, expected] of cases) {
    const root = await fixture();

    await put(
      root,
      "src/routes/left/rpc.ts",
      `${header}
const build = ({ query }: any) => ({ x: query({ handler: () => 1 }) });
const helper = (options: unknown) => options;
const procedures = {};
void build; void helper; void procedures;
export default ${call};`,
    );
    await rejectUnchanged(root, expected);
  }
});

test("unsupported shapes and fake/namespace/type-only/path/ambient factories reject", async () => {
  const cases = [
    `import {defineRpc} from '@loozo/angular-launch/server'; const name='todos'; export default defineRpc(name,({query}) => ({x:query({handler:()=>1})}));`,
    `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('todos',({query}) => ({x:query({handler:()=>1,kind:'mutation'})}));`,
    `import {defineRpc} from '@loozo/angular-launch/server'; const options={}; export default defineRpc('todos',({query}) => ({x:query({handler:()=>1})}),options);`,
    `import {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('todos',({query}) => ({x:query({handler:()=>1}),x:query({handler:()=>2})}));`,
    `import * as launch from '@loozo/angular-launch/server'; export default launch.defineRpc('todos',({query}) => ({x:query({handler:()=>1})}));`,
    `import type {defineRpc} from '@loozo/angular-launch/server'; export default defineRpc('todos',({query}) => ({x:query({handler:()=>1})}));`,
    `function defineRpc(...args:unknown[]){return args;} export default defineRpc('todos',{});`,
    `import {defineRpc} from '../../fake'; export default defineRpc('todos',({query}) => ({x:query({handler:()=>1})}));`,
  ];

  for (const source of cases) {
    const root = await fixture();

    await put(root, "src/fake.ts", "export function defineRpc(...args:unknown[]){return args;}");
    await put(root, "src/routes/left/rpc.ts", source);
    await rejectUnchanged(
      root,
      /Factory|factory|concrete|inline|Unsupported|Duplicate|literal|genuine/,
    );
  }

  for (const ambient of [false, true]) {
    const root = await fixture();
    const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

    if (ambient) {
      await put(
        root,
        "src/fake.d.ts",
        `declare module '@loozo/angular-launch/server' { export function defineRpc(...args:any[]):any; export function defineContext(...args:any[]):any; }`,
      );
    } else {
      config.compilerOptions.paths = { "@loozo/angular-launch/server": ["src/fake.ts"] };
      await put(root, "tsconfig.json", JSON.stringify(config));
      await put(
        root,
        "src/fake.ts",
        "export function defineContext(...args:unknown[]){return args;} export const defineRpc=defineContext;",
      );
    }

    await rejectUnchanged(root, /concrete|canonical/);
  }
});

test("exact ownership markers, excluded stale facade inventory, standalone isolation and link audit", async () => {
  const root = await fixture();

  await put(root, "src/routes/left/rpc.generated.ts", "// foreign facade");
  await rejectUnchanged(root, /Unmarked generated-output collision/);
  await rm(resolve(root, "src/routes/left/rpc.generated.ts"));
  await generate(root, options);

  const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

  config.exclude = ["src/routes/stale"];
  await put(root, "tsconfig.json", JSON.stringify(config));
  await put(
    root,
    "src/routes/stale/rpc.generated.ts",
    "// @loozo/angular-launch: owned rpc.generated.ts\nexport const stale=1;",
  );
  await put(root, "src/routes/foreign/rpc.generated.ts", "// foreign facade");
  await generate(root, options);
  await assert.rejects(readFile(resolve(root, "src/routes/stale/rpc.generated.ts")), /ENOENT/);
  assert.equal(
    await readFile(resolve(root, "src/routes/foreign/rpc.generated.ts"), "utf8"),
    "// foreign facade",
  );
  await put(root, "src/routes/stray.ts", `import './stale/rpc.generated';`);
  await rejectUnchanged(root, /Generated import is not a retained/);
  await put(
    root,
    "src/ambient.d.ts",
    `declare module '*rpc.generated' { export const spoof: number; }`,
  );
  await rejectUnchanged(root, /Generated import is not a retained/);
  await rm(resolve(root, "src/ambient.d.ts"));
  await rm(resolve(root, "src/routes/stray.ts"));

  const beforeEscape = await snapshot(root);

  await assert.rejects(
    generate(root, { ...options, outDirectory: "../escaped-output" }),
    /escapes application/,
  );
  assert.deepEqual(await snapshot(root), beforeEscape);
  await symlink(resolve(root, "src/context.ts"), resolve(root, "generated/unsafe.ts"));
  await rejectUnchanged(root, /symbolic link/);
  await rm(resolve(root, "generated/unsafe.ts"));
  // Remove Launch authored declarations before standalone router generation.
  await rm(resolve(root, "src/routes/+auth/rpc.ts"));
  await rm(resolve(root, "src/routes/left/rpc.ts"));
  await rm(resolve(root, "src/routes/right/rpc.ts"));

  const launchBefore = (await snapshot(root))["src/routes/left/rpc.generated.ts"];

  // Exclude retained facades whose type-only server imports were removed.
  config.exclude.push("**/rpc.generated.ts", "generated/server.generated.ts");
  await put(root, "tsconfig.json", JSON.stringify(config));
  await generateRouter(root, { ...options, autoDefineRoutes: false }, () => false);
  assert.deepEqual((await snapshot(root))["src/routes/left/rpc.generated.ts"], launchBefore);
});

test("mutations and declared errors preserve exact inputs, awaited outputs, code/data narrowing and browser-only metadata", async () => {
  const root = await fixture();

  await put(
    root,
    "src/schema.ts",
    `
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
`,
  );
  await put(
    root,
    "src/routes/left/rpc.ts",
    `
import { defineRpc } from '@loozo/angular-launch/server';
import { schema, nullSchema, dateInputSchema } from '../../schema';
export default defineRpc('todos', ({ query, mutation }) => ({
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
}));
`,
  );
  await put(
    root,
    "src/mutation-checks.ts",
    `
import { injectRpc } from './routes/left/rpc.generated';
import type { ClientRpcError, InputIssue, InvalidInputData, RpcError } from '@loozo/angular-launch';
import type group from './routes/left/rpc';
const rpc = injectRpc();
const result: Promise<{ id: string; length: number }> = rpc.todos.complete({ id: 'todo' }, { transferCache: false });
const kind: 'mutation' = rpc.todos.complete.kind;
rpc.todos.list({ transferCache: true });
declare const error: unknown;
if (rpc.todos.complete.isError(error)) {
  const typed: ClientRpcError<typeof group.procedures.complete> = error;
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
    const path: readonly (string | number)[] | undefined = issue?.path;
    const message: string | undefined = issue?.message;
    const framework: RpcError<'INVALID_INPUT', InvalidInputData> = error;
    const shorthand: RpcError<'INVALID_INPUT'> = error;
    const bare: RpcError = error;
    const shorthandIssues: readonly InputIssue[] = shorthand.data.issues;
    // @ts-expect-error a bare RpcError may be any framework failure, so its data may be null
    bare.data.issues;
    // @ts-expect-error INVALID_INPUT data is not null
    const nullData: null = error.data;
    // @ts-expect-error issues are read-only
    error.data.issues.push({ path: [], message: '' });
    // @ts-expect-error paths hold property names and indexes only
    const symbolPath: readonly symbol[] | undefined = issue?.path;
    void data; void path; void message; void framework; void shorthandIssues; void nullData; void symbolPath;
  } else {
    const noData: null = error.data;
    // @ts-expect-error other framework failures have no issues
    error.data.issues;
    void noData;
  }
  void typed;
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
  const facade = first["src/routes/left/rpc.generated.ts"].bytes;

  assert.match(facade, /"kind":"mutation"/);
  assert.match(facade, /"code":"NOT_FOUND","status":404,"message":"Todo does not exist"/);
  assert.doesNotMatch(facade, /validate|~standard|nullSchema|node:|handler/);
  assert.match(facade, /import type group1/);
  await generate(root, options);
  assert.deepEqual(await snapshot(root), first);
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
  const original = await readFile(resolve(root, "src/routes/left/rpc.ts"), "utf8");
  const imports = `
import { defineRpc } from '@loozo/angular-launch/server';
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
      await put(root, "src/routes/left/rpc.ts", original);
      await generate(root, options);
    }

    for (const fields of cases) {
      await put(
        root,
        "src/routes/left/rpc.ts",
        `${imports}
export default defineRpc('todos', ({mutation}) => ({ write: mutation({ errors: { ${fields} }, handler: () => 1 }) }));`,
      );

      const before = await snapshot(root);
      const configuration = { ...options, check: mode === "check" };

      await assert.rejects(generate(root, configuration));
      assert.deepEqual(await snapshot(root), before);
    }

    for (const handler of ["() => new Date()", "async () => ({ value: undefined })"]) {
      await put(
        root,
        "src/routes/left/rpc.ts",
        `${imports}
export default defineRpc('todos', ({mutation}) => ({ write: mutation({ handler: ${handler} }) }));`,
      );

      const before = await snapshot(root);

      await assert.rejects(generate(root, { ...options, check: mode === "check" }));
      assert.deepEqual(await snapshot(root), before);
    }
  }

  for (const invocation of ["fake", "(mutation)"]) {
    await put(
      root,
      "src/routes/left/rpc.ts",
      `${imports}
const fake = (options: unknown) => options;
export default defineRpc('todos', ({ mutation }) => ({ write: ${invocation}({ handler: () => 1 }) }));`,
    );
    await rejectUnchanged(root, /callback's query or mutation/);
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

  const unsafe = `
import { defineRpc } from '@loozo/angular-launch/server';
import type { Schema } from '@loozo/angular-launch/server';
const data: Schema<string, string | undefined> = {
  '~standard': { version: 1, vendor: 'strict-contracts', validate(value) {
    if (typeof value !== 'string') { return { issues: [{ message: 'string required' }] }; }
    return { value: undefined };
  } },
};
export default defineRpc('todos', ({mutation}) => ({
  complete: mutation({
    errors: { NOT_FOUND: { status: 404, message: 'Unsafe updated contract', data } },
    handler: ({ errors }): string => { throw errors.NOT_FOUND('id'); },
  }),
}));`;
  const implicitAny = `
import { defineRpc } from '@loozo/angular-launch/server';
import type { Schema } from '@loozo/angular-launch/server';
function identity(value) { return value; }
const data: Schema<string, string> = {
  '~standard': { version: 1, vendor: 'strict-contracts', validate(value) {
    if (typeof value !== 'string') { return { issues: [{ message: 'string required' }] }; }
    return { value: identity(undefined) };
  } },
};
export default defineRpc('todos', ({mutation}) => ({
  complete: mutation({
    errors: { NOT_FOUND: { status: 404, message: 'Unsafe updated contract', data } },
    handler: ({ errors }): string => { throw errors.NOT_FOUND('id'); },
  }),
}));`;

  for (const mode of ["cold", "update", "check"]) {
    const root = await fixture();
    const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));
    const strictOptions = { ...config.compilerOptions };
    const safeSource = await readFile(resolve(root, "src/routes/left/rpc.ts"), "utf8");

    if (mode !== "cold") {
      await generate(root, options);
    }

    const before = await snapshot(root);
    const configuration = { ...options, check: mode === "check" };

    await put(root, "src/routes/left/rpc.ts", unsafe);
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
      await put(root, "src/routes/left/rpc.ts", unsafe);

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
    await put(root, "src/routes/left/rpc.ts", implicitAny);
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
    await put(root, "src/routes/left/rpc.ts", safeSource);
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

test("tanstackQuery adds injectQueries() and Queries; off is byte-identical to today", async () => {
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
    "src/routes/left/rpc.ts",
    `import { defineRpc } from '@loozo/angular-launch/server'; import {schema} from '../../schema';
export default defineRpc('todos', ({query, mutation}) => ({
list: query({handler: async ({context}) => ({value: context.value})}),
length: query({input:schema, handler: ({input}) => ({length:input.length})}),
write: mutation({input:schema, handler: ({input}) => input.length}),
clear: mutation({handler: () => null}),
}));`,
  );
  await generate(root, options);

  const off = await snapshot(root);
  const left = off["src/routes/left/rpc.generated.ts"].bytes;

  assert.equal(
    left,
    [
      "// @loozo/angular-launch: owned rpc.generated.ts",
      "import { injectClient } from '@loozo/angular-launch/_generated';",
      "import type { Client } from '@loozo/angular-launch';",
      'import type group0 from "../+auth/rpc.js";',
      'import type group1 from "./rpc.js";',
      'export type Rpc = { readonly "session": Client<typeof group0>; readonly "todos": Client<typeof group1> };',
      'export function injectRpc(): Rpc { return injectClient({"session":{"methods":[{"name":"current","input":false,"kind":"query","errors":[]}]},"todos":{"methods":[{"name":"list","input":false,"kind":"query","errors":[]},{"name":"length","input":true,"kind":"query","errors":[]},{"name":"write","input":true,"kind":"mutation","errors":[]},{"name":"clear","input":false,"kind":"mutation","errors":[]}]}} as const) as Rpc; }',
      "",
    ].join("\n"),
  );
  await generate(root, { ...options, tanstackQuery: false });

  const explicitlyOff = await snapshot(root);

  assert.deepEqual(explicitlyOff, off);

  await generate(root, { ...options, tanstackQuery: true });

  const on = await snapshot(root);
  const lines = left.split("\n");

  lines.splice(
    3,
    0,
    "import { createQueries } from '@loozo/angular-launch/_tanstack-query';",
    "import type { RpcQueries } from '@loozo/angular-launch/tanstack-query';",
  );
  lines.splice(
    -1,
    0,
    'export type Queries = { readonly "session": RpcQueries<typeof group0>; readonly "todos": RpcQueries<typeof group1> };',
    'export function injectQueries(): Queries { return createQueries(injectRpc(), {"session":{"current":{"kind":"query","input":false}},"todos":{"list":{"kind":"query","input":false},"length":{"kind":"query","input":true},"write":{"kind":"mutation","input":true},"clear":{"kind":"mutation","input":false}}} as const) as Queries; }',
  );
  assert.equal(on["src/routes/left/rpc.generated.ts"].bytes, lines.join("\n"));
  assert.match(on["src/routes/rpc.generated.ts"].bytes, /export type Queries = {  };/);

  for (const [file, { bytes }] of Object.entries(on)) {
    if (!file.endsWith("rpc.generated.ts")) {
      assert.equal(bytes, off[file].bytes, file);
    }
  }

  await assert.rejects(generate(root, { ...options, check: true }), /Generated artifacts changed/);

  // Generation type-checks direct importers of generated files, so these are the public type tests.
  await put(
    root,
    "src/queries.ts",
    `import { injectMutation, injectQuery, QueryClient, skipToken } from '@tanstack/angular-query';
import { injectQueries } from './routes/left/rpc.generated';
import { injectQueries as injectRoot } from './routes/rpc.generated';
const queries = injectQueries();
const client = new QueryClient();
const group: readonly ['launch', 'todos'] = queries.todos.$key();
const session: readonly ['launch', 'session'] = queries.session.$key();
const procedure: readonly ['launch', 'todos', 'length'] = queries.todos.length.key();
const inputKey: readonly ['launch', 'todos', 'length', string] = queries.todos.length.key('hello');
const mutationKey: readonly ['launch', 'todos', 'write'] = queries.todos.write.key();
// Bound first, so the declared types don't drive inference.
const listedData = client.getQueryData(queries.todos.list.queryOptions().queryKey);
const listed: {value:number} | undefined = listedData;
const listedByKeyData = client.getQueryData(queries.todos.list.key());
const listedByKey: {value:number} | undefined = listedByKeyData;
const byInputData = client.getQueryData(queries.todos.length.key('hello'));
const byInput: {length:number} | undefined = byInputData;
const byOptionsData = client.getQueryData(queries.todos.length.queryOptions('hello').queryKey);
const byOptions: {length:number} | undefined = byOptionsData;
// @ts-expect-error keys are tagged with the output type
const wrong: string | undefined = listedByKeyData;
const state = client.getQueryState(queries.todos.list.key());
// @ts-expect-error errors are unknown until narrowed with isError
const error: Error | null | undefined = state?.error;
declare const maybe: string | undefined;
const skippedData = client.getQueryData(queries.todos.length.queryOptions(maybe ?? skipToken).queryKey);
const skipped: {length:number} | undefined = skippedData;
queries.todos.length.queryOptions(skipToken, { staleTime: 0 });
queries.session.current.queryOptions({ staleTime: 0, refetchOnMount: 'always', retry: false });
// @ts-expect-error caller input is a string
queries.todos.length.queryOptions({length: 1});
// @ts-expect-error input queries need their input
queries.todos.length.queryOptions();
// @ts-expect-error no-input queries take overrides only
queries.todos.list.queryOptions('hello');
// @ts-expect-error queries have no mutation options
queries.todos.list.mutationOptions();
// @ts-expect-error mutations have no query options
queries.todos.write.queryOptions('hello');
// @ts-expect-error the key is generated
queries.todos.list.queryOptions({ queryKey: ['other'] });
// @ts-expect-error the query function is generated
queries.todos.list.queryOptions({ queryFn: async () => ({value: 1}) });
// @ts-expect-error the mutation key is generated
queries.todos.write.mutationOptions({ mutationKey: ['other'] });
// @ts-expect-error the mutation function is generated
queries.todos.write.mutationOptions({ mutationFn: async () => 1 });
// @ts-expect-error no descendant group
injectRoot().todos;
export function page() {
  const list = injectQuery(() => queries.todos.list.queryOptions());
  const value: {value:number} | undefined = list.data();
  const selected = injectQuery(() => queries.todos.list.queryOptions({ select: (data) => data.value }));
  const count: number | undefined = selected.data();
  const write = injectMutation(() => queries.todos.write.mutationOptions({ onSuccess: (length: number, title: string) => { void length; void title; } }));
  write.mutate('title');
  // @ts-expect-error variables are the caller input
  write.mutate(1);
  const clear = injectMutation(() => queries.todos.clear.mutationOptions());
  clear.mutate();
  const result: null | undefined = clear.data();
  return { value, count, result };
}
void group; void session; void procedure; void inputKey; void mutationKey; void listed; void listedByKey; void byInput; void byOptions; void wrong; void error; void skipped;`,
  );
  await generate(root, { ...options, tanstackQuery: true });
  await generate(root, { ...options, tanstackQuery: true, check: true });

  const session = createGenerationSession(root, { ...options, tanstackQuery: true });

  try {
    await session.generate({ check: true });
  } finally {
    await session.dispose();
  }

  await put(
    root,
    "src/queries.ts",
    `import { injectQueries } from './routes/left/rpc.generated';
// @ts-expect-error a stale expectation fails generation
injectQueries().todos.list.queryOptions();`,
  );
  await assert.rejects(generate(root, { ...options, tanstackQuery: true }), /TS2578/);
});
