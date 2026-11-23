import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";

const evidence = process.argv[2];

if (!evidence || !isAbsolute(evidence)) {
  throw new Error("Supply an absolute absent evidence directory");
}

await mkdir(evidence);
await mkdir(join(evidence, "tmp"));

const environment = {
  ...process.env,
  TMPDIR: join(evidence, "tmp"),
  XDG_CACHE_HOME: join(evidence, "cache"),
  XDG_STATE_HOME: join(evidence, "state"),
  XDG_DATA_HOME: join(evidence, "data"),
};
const repo = resolve(import.meta.dirname, "../../..");

async function run(command, args, cwd, label) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: environment });

  await writeFile(join(evidence, `${label}.log`), `${result.stdout}\n${result.stderr}`);
  assert.equal(result.status, 0, `${label}: ${result.stdout}\n${result.stderr}`);
}

for (const name of ["angular-router", "angular-launch"]) {
  await run(
    "pnpm",
    ["pack", "--out", join(evidence, `${name}.tgz`)],
    join(repo, "packages", name, "dist"),
    `pack-${name}`,
  );
}

const consumer = join(evidence, "consumer");

await mkdir(consumer);
await writeFile(
  join(consumer, "package.json"),
  JSON.stringify(
    {
      name: "packed-launch-consumer",
      private: true,
      type: "module",
      dependencies: {
        "@loozo/angular-router": `file:${join(evidence, "angular-router.tgz")}`,
        "@loozo/angular-launch": `file:${join(evidence, "angular-launch.tgz")}`,
        "@angular/core": "22.3.0",
        "@angular/common": "22.3.0",
        "@angular/compiler": "22.3.0",
        "@angular/router": "22.3.0",
        rxjs: "7.8.2",
        typescript: "6.0.3",
        "@types/node": "24.13.3",
      },
    },
    null,
    2,
  ),
);
// The workspace router may be unreleased or newer than the registry's artifact.
// Select its genuine new tarball for both direct and transitive dependencies,
// rather than accidentally testing a registry artifact.
await writeFile(
  join(consumer, "pnpm-workspace.yaml"),
  `overrides:\n  "@loozo/angular-router": ${JSON.stringify(`file:${join(evidence, "angular-router.tgz")}`)}\n`,
);
await run(
  "pnpm",
  [
    "install",
    "--store-dir",
    join(evidence, "pnpm-store"),
    "--state-dir",
    join(evidence, "pnpm-state"),
    "--reporter",
    "append-only",
    "--ignore-scripts",
  ],
  consumer,
  "install",
);
await mkdir(join(consumer, "src/routes"), { recursive: true });
await writeFile(
  join(consumer, "src/stage.ts"),
  `export const stage = async ({ request }: { request: Request }) => ({ request, value: 7, label: 'packed' });`,
);
await writeFile(
  join(consumer, "src/routes/route.ts"),
  `import { defineRoute } from '@loozo/angular-launch';
import { middleware } from '@loozo/angular-launch/server';
import type { Schema } from '@loozo/angular-launch/server';
import { stage } from '../stage.js';
const schema: Schema<string, { id: string }> = {
  '~standard': { version: 1, vendor: 'packed', async validate(value) {
    if (typeof value !== 'string') { return { issues: [{ message: 'string required' }] }; }
    return { value: { id: value.trim() } };
  } },
};
const timed = middleware(async ({ next }) => next());
export default defineRoute('', {}).context(stage).use(timed).remote(({ query, mutation }) => ({ packed: {
  read: query({ handler: ({ context }) => context.value }),
  label: query({ handler: ({ context, signal }) => ({ label: context.label, aborted: signal.aborted }) }),
  write: mutation({
    errors: { NOT_FOUND: { status: 404, message: 'Missing packed todo', data: schema } },
    handler: ({ errors }): { id: string } => { throw errors.NOT_FOUND(' packed-id '); },
  }),
} }));`,
);
await writeFile(
  join(consumer, "src/routes/page.ts"),
  `import {Component} from '@angular/core'; @Component({selector:'packed-page',template:'ok'}) export default class Page {}`,
);
await writeFile(
  join(consumer, "src/consumer.ts"),
  `import { injectRoute, type Remote } from './routes/route.generated.js';
import { generate, createGenerationSession, type GenerationSession } from '@loozo/angular-launch/generation';
import { discoverLaunchRoutes, emitLaunchRoutes } from '@loozo/angular-router/_generation';
const rpc: Remote = injectRoute().remote;
const promise: Promise<number> = rpc.packed.read();
const label: Promise<{ label: string; aborted: boolean }> = rpc.packed.label();
const kind: 'query' = rpc.packed.read.kind;
const write: Promise<{ id: string }> = rpc.packed.write({ transferCache: false });
const mutationKind: 'mutation' = rpc.packed.write.kind;
declare const error: unknown;
if (rpc.packed.write.isError(error) && error.code === 'NOT_FOUND') {
  const id: string = error.data.id;
  void id;
}
// @ts-expect-error mutations cannot opt into transfer cache
rpc.packed.write({ transferCache: true });
const session: GenerationSession = createGenerationSession('.', {tsconfig:'tsconfig.json',scanDirectories:['src/routes'],outDirectory:'generated'});
const update: Promise<void> = session.generate({check:true});
const disposal: Promise<void> = session.dispose();
void update; void disposal;
void promise; void label; void kind; void write; void mutationKind; void generate; void discoverLaunchRoutes; void emitLaunchRoutes;`,
);
await writeFile(
  join(consumer, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      module: "ESNext",
      moduleResolution: "Bundler",
      target: "ES2022",
      types: ["node"],
      strict: true,
      skipLibCheck: false,
      experimentalDecorators: true,
      noEmit: true,
    },
    include: ["src/**/*.ts", "generated/**/*.ts"],
  }),
);
await writeFile(
  join(consumer, "verify.mjs"),
  `import '@angular/compiler';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {generate,createGenerationSession} from '@loozo/angular-launch/generation';
import { forbidden, middleware } from '@loozo/angular-launch/server';
import {RpcError, defineRoute} from '@loozo/angular-launch';
import * as client from '@loozo/angular-launch';
import * as server from '@loozo/angular-launch/server';
import * as generatedServer from '@loozo/angular-launch/_server';
import {bindApplication, createRequestScope, handleRpc} from '@loozo/angular-launch/_server';
import {discoverLaunchRoutes,createValidationProgram} from '@loozo/angular-router/_generation';
const require=createRequire(import.meta.url);
for (const name of ['@loozo/angular-launch','@loozo/angular-launch/server','@loozo/angular-launch/_server','@loozo/angular-launch/generation','@loozo/angular-router/_generation']) {
 assert.ok(require.resolve(name).startsWith(import.meta.dirname+'/node_modules/.pnpm/'));
}
// Nothing generated imports Launch internals besides the server binding's entry.
for (const name of ['@loozo/angular-launch/_generated','@loozo/angular-launch/_tanstack-query']) {
 assert.throws(()=>require.resolve(name),/not exported|ERR_PACKAGE_PATH_NOT_EXPORTED/);
}
const router=JSON.parse(await readFile(require.resolve('@loozo/angular-router/package.json'),'utf8'));
const entry=new URL(router.exports['./_generation'].types,'file://'+require.resolve('@loozo/angular-router/package.json'));
assert.ok((await readFile(entry,'utf8')).includes('discoverLaunchRoutes'));
assert.equal(typeof discoverLaunchRoutes,'function');assert.equal(typeof createValidationProgram,'function');assert.equal(new RpcError('FORBIDDEN',403).code,'FORBIDDEN');
assert.deepEqual(Object.keys(client).sort(),['RpcError','RpcNotFound','RpcRedirect','defineRoute','frameworkFailures','rpcNavigationErrors','searchCookies']);
// The optional peer isn't installed here: the root and server entries must not need it.
assert.throws(()=>require.resolve('@tanstack/angular-query'),/Cannot find module/);
assert.deepEqual(Object.keys(server).sort(),['finishLaunchRendering','forbidden','middleware','notFound','readCookies','redirect']);
assert.deepEqual(Object.keys(generatedServer).sort(),['bindApplication','createRequestScope','handleChannelUpgrade','handleRpc','provideLaunchServer','runProcedure']);
const id = 'packed';
const schema = { '~standard': { version: 1, vendor: 'packed', async validate(value) {
  if (typeof value !== 'string') { return { issues: [{ message: 'private string detail' }] }; }
  return { value: { id: value.trim() } };
} } };
const refuse = middleware(async () => { throw forbidden(); });
let stages = 0;
const route = defineRoute('', {}).context(() => { stages += 1; return { value: 1 }; }).remote(({ query, mutation }) => ({ [id]: { write: mutation({
  errors: { NOT_FOUND: { status: 404, message: 'Missing packed todo', data: schema } },
  handler: ({ errors }) => { throw errors.NOT_FOUND(' packed-id '); },
}), refused: query({ use: [refuse], handler: () => 1 }) } }));
const application = bindApplication('packed-test-app', [[route, 'src/routes/route.ts']]);
const expected = { error: { code: 'NOT_FOUND', message: 'Missing packed todo', data: { id: 'packed-id' } } };
const response = await handleRpc(application, new Request('http://test/_rpc/'+id+'/write', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://test' }, body: JSON.stringify({ input: null }),
}), { allowedHosts: ['test'] });
assert.equal(response.status, 404); assert.deepEqual(await response.json(), expected);
const refused = await handleRpc(application, new Request('http://test/_rpc/'+id+'/refused', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://test' }, body: JSON.stringify({ input: null }),
}), { allowedHosts: ['test'] });
assert.equal(refused.status, 403); assert.equal((await refused.json()).error.code, 'FORBIDDEN');
assert.equal(stages, 2);
const scope = createRequestScope(application, new Request('http://test'));
assert.equal(scope.appId, application.id); assert.equal(stages, 2, 'a scope runs no stage');
const launch=JSON.parse(await readFile(require.resolve('@loozo/angular-launch/package.json'),'utf8'));
for(const entry of [router.exports['./_generation'],launch.exports['./generation']]) {
assert.equal(typeof entry.types,'string');assert.equal(typeof entry.node,'string');assert.equal(entry.default,undefined);
}
const options={tsconfig:'tsconfig.json',scanDirectories:['src/routes'],outDirectory:'generated'};
async function snapshot() {
  const result={};
  async function visit(directory) {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      if(entry.name==='node_modules'){continue;}
      const file=directory+'/'+entry.name;
      if(entry.isDirectory()){await visit(file);}
      else if(entry.name.includes('.generated.')) {
        result[file.slice(import.meta.dirname.length+1)]={bytes:await readFile(file,'utf8'),mtime:String((await stat(file,{bigint:true})).mtimeNs)};
      }
    }
  }
  await visit(import.meta.dirname);
  return result;
}
await generate(import.meta.dirname,options);
const cold=await snapshot();
const session=createGenerationSession(import.meta.dirname,options);
try {
  await session.generate();
  await session.generate({check:true});
  assert.deepEqual(await snapshot(),cold);
  const routeFile=import.meta.dirname+'/src/routes/route.ts';
  const routeText=await readFile(routeFile,'utf8');
  await writeFile(routeFile,routeText+'\\nconst invalid:string=123;\\nvoid invalid;\\n');
  await assert.rejects(session.generate(),/TS2322/);
  assert.deepEqual(await snapshot(),cold);
  await writeFile(routeFile,routeText);
  await session.generate({check:true});
  assert.deepEqual(await snapshot(),cold);
  await writeFile(routeFile,routeText.replace('Missing packed todo','Missing updated packed todo'));
  await session.generate();
  const updated=await snapshot();
  assert.notDeepEqual(updated,cold);
  await generate(import.meta.dirname,options);
  assert.deepEqual(await snapshot(),updated);

  const dependency=import.meta.dirname+'/node_modules/dependency';
  const stageFile=import.meta.dirname+'/src/stage.ts';
  const stageText=await readFile(stageFile,'utf8');
  await mkdir(dependency);
  const original=JSON.stringify({name:'dependency',version:'1.0.0',exports:{'./first':'./number.d.ts','./second':'./string.d.ts'}});
  const swapped=JSON.stringify({name:'dependency',version:'1.0.0',exports:{'./first':'./string.d.ts','./second':'./number.d.ts'}});
  await Promise.all([
    writeFile(dependency+'/package.json',original),
    writeFile(dependency+'/number.d.ts','export declare const value:number;'),
    writeFile(dependency+'/string.d.ts','export declare const value:string;'),
    writeFile(stageFile,"import {value as first} from 'dependency/first';import {value as second} from 'dependency/second';export const stage = ({request}:{request:Request})=>({request,value:first,second,label:'packed'});"),
    writeFile(routeFile,routeText.replace('handler: ({ context }) => context.value','handler: ({ context }): number => context.value')),
  ]);
  await session.generate();
  const beforeSwap=await snapshot();
  const appManifest=import.meta.dirname+'/package.json';
  const identity=await readFile(appManifest,'utf8');
  const changed=JSON.stringify({...JSON.parse(identity),name:'packed-identity-changed'});
  for(const action of [()=>session.generate(),()=>session.generate({check:true}),()=>generate(import.meta.dirname,options),()=>generate(import.meta.dirname,{...options,check:true})]) {
    await writeFile(dependency+'/package.json',original);
    await writeFile(appManifest,identity);
    await session.generate();
    await session.generate({check:true});
    assert.deepEqual(await snapshot(),beforeSwap);
    await writeFile(dependency+'/package.json',swapped);
    await writeFile(appManifest,changed);
    await assert.rejects(action(),/TS2322/);
    assert.deepEqual(await snapshot(),beforeSwap);
  }
  await writeFile(dependency+'/package.json',original);
  await session.generate();
  const repaired=await snapshot();
  assert.notEqual(repaired['generated/server.generated.ts'].bytes,beforeSwap['generated/server.generated.ts'].bytes);
  await session.generate({check:true});
  await generate(import.meta.dirname,options);
  assert.deepEqual(await snapshot(),repaired);
  // Restore the authored consumer before pnpm exec revalidates its install;
  // that may prune this deliberately uninstalled dependency-metadata fixture.
  await Promise.all([writeFile(stageFile,stageText),writeFile(routeFile,routeText)]);
  await session.generate();
} finally {
  await session.dispose();
}
const disposing=createGenerationSession(import.meta.dirname,options);
await disposing.generate();
const beforeDispose=await snapshot();
const appManifest=import.meta.dirname+'/package.json';
await writeFile(appManifest,JSON.stringify({...JSON.parse(await readFile(appManifest,'utf8')),name:'packed-disposal-changed'}));
let closing;
let stopCalls=0;
const pending=disposing.generate({},()=>{stopCalls+=1;closing=disposing.dispose();return false;});
await pending;
assert.equal(stopCalls,1);assert.ok(closing instanceof Promise);
await closing;
assert.deepEqual(await snapshot(),beforeDispose);
await assert.rejects(disposing.generate(),/disposed/);
await generate(import.meta.dirname,options);
assert.notEqual((await snapshot())['generated/server.generated.ts'].bytes,beforeDispose['generated/server.generated.ts'].bytes);
const generated=await readFile(import.meta.dirname+'/generated/server.generated.ts','utf8');
assert.ok(generated.includes("from '@loozo/angular-launch/_server';"));assert.ok(generated.includes('scopeFor(application, request)'));assert.ok(generated.includes('provideLaunchServer(application)'));
const copy=await readFile(import.meta.dirname+'/src/routes/route.generated.ts','utf8');
assert.ok(copy.includes('from "@loozo/angular-launch";'));assert.ok(!copy.includes('angular-launch/_generated'));assert.ok(!copy.includes('angular-launch/server'));
console.log('Packed exports, generation, mutation/error payloads and lazy request scope: PASS');`,
);
await run("node", ["verify.mjs"], consumer, "exports-and-generation");

// Use the same genuine native esbuild resolver as Angular's installed builder.
// Browser runtime resolution must not fall through to a default JS entry.
const { createRequire } = await import("node:module");
const builderRequire = createRequire(join(repo, "examples/angular-launch/package.json"));
const nativeRequire = createRequire(builderRequire.resolve("@angular/build/package.json"));
const { build } = nativeRequire("esbuild");

for (const entry of ["@loozo/angular-launch/generation", "@loozo/angular-router/_generation"]) {
  await assert.rejects(
    build({
      stdin: {
        contents: `import * as generation from '${entry}';console.log(generation);`,
        resolveDir: consumer,
      },
      bundle: true,
      write: false,
      platform: "browser",
      logLevel: "silent",
    }),
    /Could not resolve/,
  );
}

await run("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], consumer, "types-bundler");
// Native route lazy imports use Angular's Bundler contract. Also check every
// packed export and the generated Launch client in a separate strict NodeNext
// consumer, without pretending native route generation is a Node app builder.
await writeFile(
  join(consumer, "tsconfig.nodenext.json"),
  JSON.stringify({
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      types: ["node"],
      strict: true,
      skipLibCheck: false,
      noEmit: true,
    },
    files: ["src/consumer.ts"],
  }),
);
await run("pnpm", ["exec", "tsc", "-p", "tsconfig.nodenext.json"], consumer, "types-nodenext");

// Application exports inferred from public server APIs must emit declarations: every type
// their inferred types name has to be public (TS2883 otherwise). Only an installed package
// shows this; a workspace source path would be written as a relative import instead.
await writeFile(
  join(consumer, "src/declarations.ts"),
  `import {defineRoute} from '@loozo/angular-launch';
import {middleware, type MiddlewareArgs, type ProcedureBuilder, type StageArgs} from '@loozo/angular-launch/server';
export const labelled = middleware(async ({ next }) => next());
export const counted = middleware(async ({ context, next }: MiddlewareArgs<{ label: string }, { id: string }>) => { void context.label; return next(); });
export function labelStage({ context }: StageArgs<{ value: number }>) { return { ...context, label: String(context.value) }; }
export const route = defineRoute('declared', {}).context(() => ({ value: 1 })).use(labelled).remote(({ query }) => ({ declared: { list: query({ handler: ({ context }) => context.value }) } })).resolve({ list: ({ remote }) => remote.declared.list() });
export const child = defineRoute('child', { parent: route }).context(labelStage).remote(({ query }) => ({ child: { label: query({ handler: ({ context }) => context.label }) } }));
export function errorsOf(procedure: ReturnType<ProcedureBuilder<unknown>['query']>) { return procedure.errors; }
export function statusOf(procedure: ReturnType<ProcedureBuilder<unknown>['query']>) { return procedure.errors.NOT_FOUND.status; }`,
);
await writeFile(
  join(consumer, "tsconfig.declarations.json"),
  JSON.stringify({
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      types: ["node"],
      strict: true,
      skipLibCheck: false,
      declaration: true,
      emitDeclarationOnly: true,
      rootDir: ".",
      outDir: "declarations",
    },
    files: ["src/declarations.ts"],
  }),
);
await run(
  "pnpm",
  ["exec", "tsc", "-p", "tsconfig.declarations.json"],
  consumer,
  "types-declarations",
);

// A consumer with the optional TanStack peer: the subpaths resolve, generation with
// tanstackQuery type-checks, and the generated factories type-check under both resolutions.
const queriesConsumer = join(evidence, "consumer-tanstack-query");

await mkdir(join(queriesConsumer, "src/routes"), { recursive: true });

const consumerManifest = await readFile(join(consumer, "package.json"), "utf8");
const queriesManifest = JSON.parse(consumerManifest);

queriesManifest.name = "packed-launch-tanstack-query-consumer";
queriesManifest.dependencies["@tanstack/angular-query"] = "5.0.0-rc.5";
await writeFile(join(queriesConsumer, "package.json"), JSON.stringify(queriesManifest, null, 2));

for (const file of [
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "tsconfig.nodenext.json",
  "src/stage.ts",
  "src/routes/route.ts",
  "src/routes/page.ts",
]) {
  await writeFile(join(queriesConsumer, file), await readFile(join(consumer, file), "utf8"));
}

await run(
  "pnpm",
  [
    "install",
    "--store-dir",
    join(evidence, "pnpm-store"),
    "--state-dir",
    join(evidence, "pnpm-state"),
    "--reporter",
    "append-only",
    "--ignore-scripts",
  ],
  queriesConsumer,
  "install-tanstack-query",
);
await writeFile(
  join(queriesConsumer, "src/consumer.ts"),
  `import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query';
import { provideLaunchQueries, type QueriesOf } from '@loozo/angular-launch/tanstack-query';
import type { EnvironmentProviders } from '@angular/core';
import { injectRoute, route, type Queries } from './routes/route.generated.js';
const providers: EnvironmentProviders = provideLaunchQueries();
const queries: Queries = injectRoute().queries;
const same: QueriesOf<typeof route> = queries;
const key: readonly ['launch', 'packed', 'read'] = queries.packed.read.key();
const data = new QueryClient().getQueryData(queries.packed.read.queryOptions().queryKey);
const value: number | undefined = data;
// @ts-expect-error queries have no mutation options
queries.packed.read.mutationOptions();
export function page() {
  const read = injectQuery(() => queries.packed.read.queryOptions({ staleTime: 0 }));
  const write = injectMutation(() => queries.packed.write.mutationOptions());
  write.mutate();
  return read.data();
}
void providers; void same; void key; void value;`,
);
await writeFile(
  join(queriesConsumer, "verify.mjs"),
  `import '@angular/compiler';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {dirname,join,relative,resolve} from 'node:path';
import {generate} from '@loozo/angular-launch/generation';
import * as queries from '@loozo/angular-launch/tanstack-query';
const require=createRequire(import.meta.url);
for (const name of ['@loozo/angular-launch/tanstack-query','@tanstack/angular-query']) {
  assert.ok(require.resolve(name).startsWith(import.meta.dirname+'/node_modules/.pnpm/'));
}
assert.deepEqual(Object.keys(queries).sort(),['provideLaunchQueries']);
const launchManifest=await readFile(require.resolve('@loozo/angular-launch/package.json'),'utf8');
const launch=JSON.parse(launchManifest);
assert.equal(launch.peerDependencies['@tanstack/angular-query'],'^5.0.0-rc.5');
assert.deepEqual(launch.peerDependenciesMeta,{'@tanstack/angular-query':{optional:true}});
// The entry's guide ships, and its relative links resolve inside the installed package.
const installed=dirname(require.resolve('@loozo/angular-launch/package.json'));
const guideFile=join(installed,'tanstack-query','README.md');
const guide=await readFile(guideFile,'utf8');
assert.ok(guide.startsWith('# TanStack Query\\n'));
const guideLinks=[];
for (const match of guide.matchAll(/\\]\\(([^)\\s]+)\\)/g)) {
  const href=match[1];
  if (/^[a-z][a-z\\d+.-]*:/i.test(href)||href.startsWith('#')) {continue;}
  guideLinks.push(href);
  const [path,fragment]=href.split('#');
  const target=resolve(dirname(guideFile),path);
  assert.ok(!relative(installed,target).startsWith('..'),href);
  assert.ok(existsSync(target),href);
  if (fragment!==undefined) {
    const linked=await readFile(target,'utf8');
    const headings=[];
    for (const heading of linked.matchAll(/^#+ (.+)$/gm)) {
      headings.push(heading[1].toLowerCase().replace(/[^a-z0-9 -]/g,'').replaceAll(' ','-'));
    }
    assert.ok(headings.includes(fragment),href);
  }
}
assert.ok(guideLinks.length>0);
await generate(import.meta.dirname,{tsconfig:'tsconfig.json',scanDirectories:['src/routes'],outDirectory:'generated',tanstackQuery:true});
const generated=await readFile(import.meta.dirname+'/src/routes/route.generated.ts','utf8');
assert.ok(generated.includes('from "@loozo/angular-launch/tanstack-query";'));
assert.ok(generated.includes('export type { routegen$type_Queries as Queries };'));
assert.ok(generated.includes('readonly queries: routegen$type_Queries'));
console.log('Packed TanStack Query subpaths and generation: PASS');`,
);
await run("node", ["verify.mjs"], queriesConsumer, "tanstack-query-exports-and-generation");
await run(
  "pnpm",
  ["exec", "tsc", "-p", "tsconfig.json"],
  queriesConsumer,
  "tanstack-query-types-bundler",
);
await run(
  "pnpm",
  ["exec", "tsc", "-p", "tsconfig.nodenext.json"],
  queriesConsumer,
  "tanstack-query-types-nodenext",
);

const lock = await readFile(join(consumer, "pnpm-lock.yaml"), "utf8");

assert.ok(lock.includes("22.3.0") && lock.includes("6.0.3") && lock.includes("7.8.2"));
await writeFile(
  join(evidence, "report.json"),
  JSON.stringify(
    {
      success: true,
      consumer,
      store: join(evidence, "pnpm-store"),
      state: join(evidence, "pnpm-state"),
      checks: [
        "real tarballs",
        "normal private pnpm installation",
        "packed Node runtime exports and actual browser resolver rejection",
        "packed seam declarations",
        "producer generation with genuine mutation and declared-error metadata",
        "packed session types, cold/session byte+mtime parity, invalid-edit repair and updated output parity",
        "metadata-only export swap rejects warm/cold generate/check, blocks identity publication and repairs on the same session",
        "reentrant stop-predicate disposal suppresses changed publication and settles generation/disposal promises",
        "public and internal entry export lists",
        "HTTP transformed declared-error payloads and a lazy bound request scope",
        "strict Bundler native routes and strict NodeNext exports/generated mutation/error consumer",
        "root and generated entries without the optional TanStack peer",
        "TanStack Query subpaths, generation and generated factory types with the peer installed",
        "the TanStack Query guide ships with relative links that resolve inside the package",
      ],
    },
    null,
    2,
  ),
);
console.log(`Packed consumption PASS: ${evidence}`);
