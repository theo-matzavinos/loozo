import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { mkdir, writeFile, readFile, readdir, stat, rm, rename, symlink } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { generate } from "../dist/generation/index.js";
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
    `import { defineRpc as rpc, query as read } from '@loozo/angular-launch/server'; export default rpc('session', {current: read({handler: ({context}) => context.value})});`,
  );

  for (const name of ["left", "right"]) {
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
      `import { defineRpc, query } from '@loozo/angular-launch/server'; export default defineRpc('todos', {list: query({handler: async ({context}) => ({value: context.value})})});`,
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
    `import { defineRpc, query } from '@loozo/angular-launch/server'; import {schema} from '../../schema';
export default defineRpc('todos', {
list: query({handler: async ({context}) => ({value: context.value})}),
length: query({input:schema, canActivate:[({context,request,input}) => request instanceof Request && input.length > 0 && context.value > 0], handler: ({input,context}) => {
// @ts-expect-error ordinary nullable context; guard does not narrow
context.user.id;
// @ts-expect-error transformed input is not caller string
input.toUpperCase();
return {length:input.length};
}})});`,
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
if (client.todos.list.isError(value)) { const data:null = value.data; }
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
injectRight().todos.length;
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
    `import {defineRpc,query} from '@loozo/angular-launch/server';
import {schema,identity,mutableIdentity,aliasIdentity,aliasTodo,functionInput,undefinedInput,dateSchema,list,readonlyList,tuple} from '../../dto';
import type {Input,Transformed,Todo} from '../../dto';
export default defineRpc('todos',{
list:query({handler:list}),readonlyList:query({handler:readonlyList}),tuple:query({handler:tuple}),
get:query({input:schema,canActivate:[({input})=>{const transformed:Transformed=input;return transformed.length>0;}],handler:async({input,context})=>{
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
});`,
  );
  await put(
    root,
    "src/checks.ts",
    `import {injectRpc} from './routes/left/rpc.generated';
import type {Todo,ReadonlyTodo,Input,MutableInput,AliasTodo} from './dto';
import context from './context';
import {createRequestScope,provideLaunchServer} from '@loozo/angular-launch/server';
import type {ApplicationBinding} from '@loozo/angular-launch/server';
const binding:ApplicationBinding<typeof context>={id:'compile-app',context};
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
        `const kind:'query'='query';export default {name:'todos',canActivate:[],procedures:{list:{kind,input:undefined,canActivate:[],handler:async()=>({value:999})}}};`,
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

test("nonwriting check and stop; stable opaque source IDs across relocation and nonnamespace edits", async () => {
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

  const id = /"id":"([a-f0-9]{24})"/.exec(first["src/routes/left/rpc.generated.ts"].bytes)[1];

  await put(
    root,
    "src/routes/left/rpc.ts",
    `import {defineRpc,query} from '@loozo/angular-launch/server'; export default defineRpc('renamed', {different:query({handler:()=>8})});`,
  );
  await generate(root, options);
  assert.match((await snapshot(root))["src/routes/left/rpc.generated.ts"].bytes, new RegExp(id));

  const moved = root + "-moved";

  await rename(root, moved);
  await generate(moved, options);
  assert.match((await snapshot(moved))["src/routes/left/rpc.generated.ts"].bytes, new RegExp(id));
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
  assert.match((await snapshot(moved))["src/routes/left/rpc.generated.ts"].bytes, new RegExp(id));
});

test("combined semantic preflight is strict and prevents all router and Launch writes", async () => {
  const root = await fixture();

  await put(
    root,
    "src/routes/left/rpc.ts",
    `import {defineRpc,query} from '@loozo/angular-launch/server'; export default defineRpc('todos',{list:query({handler:({context})=>context.nonexistent})});`,
  );
  await rejectUnchanged(root, /nonexistent/);
  await put(
    root,
    "src/routes/left/rpc.ts",
    `import {defineRpc,query} from '@loozo/angular-launch/server'; export default defineRpc('todos',{list:query({handler:()=>7})});`,
  );
  await put(root, "src/broken.d.ts", "export interface Broken { value: MissingType; }");
  await rejectUnchanged(root, /MissingType/);
  await rm(resolve(root, "src/broken.d.ts"));
  await put(
    root,
    "src/routes/left/route.ts",
    `import {defineRoute} from '@loozo/angular-router'; import parent from '../+auth/route'; export default defineRoute('left',{parent,resolve:{x:()=>missingRouteValue}});`,
  );
  await rejectUnchanged(root, /missingRouteValue/);

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
    `import {defineRpc,query} from '@loozo/angular-launch/server'; export default defineRpc('todos',{list:query({handler:({context})=>context.nonexistent})});`,
  );
  await rejectUnchanged(stale, /nonexistent/);
});

test("only __proto__ namespace/procedure is reserved before cold publication, updates or check", async () => {
  for (const [body, diagnostic] of [
    [
      "defineRpc('__proto__',{list:query({handler:()=>1})})",
      "RPC namespace '__proto__' is reserved",
    ],
    [
      "defineRpc('todos',{__proto__:query({handler:()=>1})})",
      "RPC procedure '__proto__' is reserved",
    ],
    [
      "defineRpc('todos',{'__proto__':query({handler:()=>1})})",
      "RPC procedure '__proto__' is reserved",
    ],
  ]) {
    const root = await fixture();
    const authored = `import {defineRpc,query} from '@loozo/angular-launch/server';export default ${body};`;
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
      `import {defineRpc,query} from '@loozo/angular-launch/server';export default defineRpc('todos',{list:query({handler:()=>1})});`,
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
    `import {defineRpc,query} from '@loozo/angular-launch/server';import {schema} from '../../schema';
export default defineRpc('constructor',{
constructor:query({input:schema,handler:({input})=>{
const text:string=input.text;
// @ts-expect-error transformed input is not the caller union
const caller:string|number=input;
return {text};
}}),toString:query({handler:()=>1})});`,
  );
  await put(
    root,
    "src/routes/right/rpc.ts",
    `import {defineRpc,query} from '@loozo/angular-launch/server';
export default defineRpc('toString',{constructor:query({handler:()=>1}),toString:query({handler:()=>2})});`,
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

  assert.ok(facade.includes('"constructor":{"id":'));
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
    `import {defineRpc,query} from '@loozo/angular-launch/server';import {optionalSchema} from '../../schema';
export default defineRpc('todos',{list:query({input:optionalSchema,handler:()=>1})});`,
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

test("missing/duplicate context, unknown defaults, missing/redirect owners and ancestry namespace collisions", async () => {
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
          `import {defineRpc,query} from '@loozo/angular-launch/server'; export default defineRpc('missing',{x:query({handler:()=>7})});`,
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
          `import {defineRpc,query} from '@loozo/angular-launch/server'; export default defineRpc('session',{x:query({handler:()=>7})});`,
        ),
      /Duplicate RPC namespace/,
    ],
    [
      "same-directory groups",
      async (root) =>
        put(
          root,
          "src/routes/left/another.ts",
          `import {defineRpc,query} from '@loozo/angular-launch/server'; export default defineRpc('another',{x:query({handler:()=>1})});`,
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

test("unsupported shapes and fake/namespace/wrapper/type-only/path/ambient factories reject", async () => {
  const cases = [
    `import {defineRpc,query} from '@loozo/angular-launch/server'; const name='todos'; export default defineRpc(name,{x:query({handler:()=>1})});`,
    `import {defineRpc,query} from '@loozo/angular-launch/server'; export default defineRpc('todos',{x:query({handler:()=>1,kind:'mutation'})});`,
    `import {defineRpc,query} from '@loozo/angular-launch/server'; const methods={x:query({handler:()=>1})}; export default defineRpc('todos',methods);`,
    `import {defineRpc,query} from '@loozo/angular-launch/server'; const options={}; export default defineRpc('todos',{x:query({handler:()=>1})},options);`,
    `import {defineRpc,query} from '@loozo/angular-launch/server'; export default defineRpc('todos',{x:query({handler:()=>1}),x:query({handler:()=>2})});`,
    `import * as launch from '@loozo/angular-launch/server'; export default launch.defineRpc('todos',{x:launch.query({handler:()=>1})});`,
    `import {defineRpc,query} from '@loozo/angular-launch/server'; const wrapped=query; export default defineRpc('todos',{x:wrapped({handler:()=>1})});`,
    `import type {defineRpc} from '@loozo/angular-launch/server'; import {query} from '@loozo/angular-launch/server'; export default defineRpc('todos',{x:query({handler:()=>1})});`,
    `function defineRpc(...args:unknown[]){return args;} export default defineRpc('todos',{});`,
    `import {defineRpc,query} from '../../fake'; export default defineRpc('todos',{x:query({handler:()=>1})});`,
  ];

  for (const source of cases) {
    const root = await fixture();

    await put(
      root,
      "src/fake.ts",
      "export function defineRpc(...args:unknown[]){return args;} export const query=defineRpc;",
    );
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
        `declare module '@loozo/angular-launch/server' { export function defineRpc(...args:any[]):any; export function query(...args:any[]):any; export function defineContext(...args:any[]):any; }`,
      );
    } else {
      config.compilerOptions.paths = { "@loozo/angular-launch/server": ["src/fake.ts"] };
      await put(root, "tsconfig.json", JSON.stringify(config));
      await put(
        root,
        "src/fake.ts",
        "export function defineContext(...args:unknown[]){return args;} export const defineRpc=defineContext; export const query=defineContext;",
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
  await generateRouter(root, options, () => false);
  assert.deepEqual((await snapshot(root))["src/routes/left/rpc.generated.ts"], launchBefore);
});

test("genuine mutation aliases and declared errors preserve exact inputs, awaited outputs, code/data narrowing and browser-only metadata", async () => {
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
import { defineRpc, query, mutation as write } from '@loozo/angular-launch/server';
import { schema, nullSchema, dateInputSchema } from '../../schema';
export default defineRpc('todos', {
  list: query({ handler: () => ({ value: 1 }) }),
  complete: write({
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
});
`,
  );
  await put(
    root,
    "src/mutation-checks.ts",
    `
import { injectRpc } from './routes/left/rpc.generated';
import type { ClientRpcError, RpcError } from '@loozo/angular-launch';
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
  } else {
    const noData: null = error.data;
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
import { defineRpc, mutation } from '@loozo/angular-launch/server';
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
export default defineRpc('todos', { write: mutation({ errors: { ${fields} }, handler: () => 1 }) });`,
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
export default defineRpc('todos', { write: mutation({ handler: ${handler} }) });`,
      );

      const before = await snapshot(root);

      await assert.rejects(generate(root, { ...options, check: mode === "check" }));
      assert.deepEqual(await snapshot(root), before);
    }
  }

  for (const invocation of ["wrapped", "fake", "namespace.mutation"]) {
    await put(
      root,
      "src/routes/left/rpc.ts",
      `${imports}
import * as namespace from '@loozo/angular-launch/server';
const wrapped = mutation;
const fake = (options: unknown) => options;
export default defineRpc('todos', { write: ${invocation}({ handler: () => 1 }) });`,
    );
    await rejectUnchanged(root, /genuine|factory|Factory/);
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
import { defineRpc, mutation } from '@loozo/angular-launch/server';
import type { Schema } from '@loozo/angular-launch/server';
const data: Schema<string, string | undefined> = {
  '~standard': { version: 1, vendor: 'strict-contracts', validate(value) {
    if (typeof value !== 'string') { return { issues: [{ message: 'string required' }] }; }
    return { value: undefined };
  } },
};
export default defineRpc('todos', {
  complete: mutation({
    errors: { NOT_FOUND: { status: 404, message: 'Unsafe updated contract', data } },
    handler: ({ errors }): string => { throw errors.NOT_FOUND('id'); },
  }),
});`;
  const implicitAny = `
import { defineRpc, mutation } from '@loozo/angular-launch/server';
import type { Schema } from '@loozo/angular-launch/server';
function identity(value) { return value; }
const data: Schema<string, string> = {
  '~standard': { version: 1, vendor: 'strict-contracts', validate(value) {
    if (typeof value !== 'string') { return { issues: [{ message: 'string required' }] }; }
    return { value: identity(undefined) };
  } },
};
export default defineRpc('todos', {
  complete: mutation({
    errors: { NOT_FOUND: { status: 404, message: 'Unsafe updated contract', data } },
    handler: ({ errors }): string => { throw errors.NOT_FOUND('id'); },
  }),
});`;

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
