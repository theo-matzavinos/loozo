import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile, readdir, writeFile, stat, rm, rename } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { generate, createGenerationSession } from "../dist/generation/index.js";
import { generate as generateRouter } from "../../angular-router/node/src/generation/generate.js";

const scratch = resolve(import.meta.dirname, "../../../examples/angular-launch/.scratch");
const options = {
  tsconfig: "tsconfig.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
};
let sequence = 0;

async function put(root, name, text) {
  const path = resolve(root, name);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

async function fixture() {
  const root = resolve(scratch, `session-${process.pid}-${++sequence}`);

  const writes = [
    put(
      root,
      "package.json",
      JSON.stringify({ name: "session-consumer", private: true, type: "module" }),
    ),
    put(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
          strict: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          types: ["node"],
        },
        include: ["src/**/*.ts", "generated/**/*.ts"],
      }),
    ),
    put(root, "src/value.ts", "export const value = 7;"),
    put(
      root,
      "src/context.ts",
      "import {defineContext} from '@loozo/angular-launch/server'; import {value} from './value'; export default defineContext((request:Request)=>({request,value}));",
    ),
    put(root, "src/schema-type.ts", "export interface Output {length:number}"),
    put(
      root,
      "src/schema.ts",
      "import type {Schema} from '@loozo/angular-launch/server';import type {Output} from './schema-type';export const schema:Schema<string,Output>={'~standard':{version:1,vendor:'session',validate:value=>{if(typeof value!=='string'){return {issues:[{message:'string'}]};}return {value:{length:value.length}};}}};",
    ),
    put(
      root,
      "src/routes/route.ts",
      "import {defineRoute} from '@loozo/angular-router';export default defineRoute('',{});",
    ),
    put(
      root,
      "src/checks.ts",
      "import {injectRpc} from './routes/left/rpc.generated';const result:Promise<{length:number;value:number}>=injectRpc().todos.read('hello');void result;",
    ),
  ];

  for (const name of ["left", "right"]) {
    writes.push(
      put(
        root,
        `src/routes/${name}/route.ts`,
        `import {defineRoute} from '@loozo/angular-router';import parent from '../route';export default defineRoute('${name}',{parent});`,
      ),
      put(
        root,
        `src/routes/${name}/page.ts`,
        "import {Component} from '@angular/core';@Component({selector:'session-page',template:'ok'}) export default class Page {}",
      ),
      put(
        root,
        `src/routes/${name}/rpc.ts`,
        "import {defineRpc,query} from '@loozo/angular-launch/server';import {schema} from '../../schema';export default defineRpc('todos',{read:query({input:schema,handler:({input,context})=>({length:input.length,value:context.value})})});",
      ),
    );
  }

  await Promise.all(writes);

  return root;
}

async function snapshot(root) {
  const files = {};

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name.includes(".generated.")) {
        const [bytes, info] = await Promise.all([
          readFile(path, "utf8"),
          stat(path, { bigint: true }),
        ]);

        files[relative(root, path)] = { bytes, mtime: String(info.mtimeNs) };
      }
    }
  }

  await visit(root);

  return files;
}

async function rejectsUnchanged(root, session, expected) {
  const before = await snapshot(root);

  await assert.rejects(session.generate(), expected);
  assert.deepEqual(await snapshot(root), before);
  await assert.rejects(session.generate({ check: true }), expected);
  assert.deepEqual(await snapshot(root), before);
}

test("explicit session has cold parity, unchanged/template/check mtimes, contract edits, removal/addition and move-return-edit", async () => {
  const root = await fixture();
  const fixed = { ...options, scanDirectories: [...options.scanDirectories] };
  const session = createGenerationSession(root, fixed);

  fixed.scanDirectories[0] = "wrong";
  fixed.tsconfig = "wrong.json";
  fixed.outDirectory = "wrong-output";

  try {
    await session.generate();

    const first = await snapshot(root);

    await session.generate();
    await session.generate({ check: true });
    await generate(root, options);
    assert.deepEqual(await snapshot(root), first);
    await put(
      root,
      "src/routes/left/page.ts",
      "import {Component} from '@angular/core';@Component({selector:'session-page',template:'real changed template'}) export default class Page {}",
    );
    await session.generate();
    assert.deepEqual(await snapshot(root), first);

    const rpc = await readFile(resolve(root, "src/routes/left/rpc.ts"), "utf8");

    await put(root, "src/routes/left/rpc.ts", rpc.replace("'todos'", "'changed'"));
    await put(
      root,
      "src/checks.ts",
      "import {injectRpc} from './routes/left/rpc.generated';const result:Promise<{length:number;value:number}>=injectRpc().changed.read('hello');void result;",
    );
    await session.generate();
    assert.notEqual(
      (await snapshot(root))["src/routes/left/rpc.generated.ts"].bytes,
      first["src/routes/left/rpc.generated.ts"].bytes,
    );

    await rename(resolve(root, "src/routes/left"), resolve(root, "src/routes/moved"));
    await put(
      root,
      "src/checks.ts",
      "import {injectRpc} from './routes/moved/rpc.generated';injectRpc().changed.read('hello');",
    );
    await session.generate();
    assert.equal((await snapshot(root))["src/routes/left/rpc.generated.ts"], undefined);
    await rename(resolve(root, "src/routes/moved"), resolve(root, "src/routes/left"));
    await put(
      root,
      "src/checks.ts",
      "import {injectRpc} from './routes/left/rpc.generated';injectRpc().changed.read('hello');",
    );
    await session.generate();
    await put(root, "src/routes/left/rpc.ts", rpc.replace("'todos'", "'returned'"));
    await put(
      root,
      "src/checks.ts",
      "import {injectRpc} from './routes/left/rpc.generated';injectRpc().returned.read('hello');",
    );
    await session.generate();
    assert.match((await snapshot(root))["src/routes/left/rpc.generated.ts"].bytes, /returned/);

    await rm(resolve(root, "src/routes/right/rpc.ts"));
    await session.generate();
    assert.doesNotMatch((await snapshot(root))["src/routes/right/rpc.generated.ts"].bytes, /todos/);
    await put(root, "src/routes/right/rpc.ts", rpc.replace("'todos'", "'added'"));
    await session.generate();
    assert.match((await snapshot(root))["src/routes/right/rpc.generated.ts"].bytes, /added/);
    await rm(resolve(root, "src/routes/right"), { recursive: true });
    await session.generate();
    assert.doesNotMatch(
      (await snapshot(root))["generated/destinations.generated.ts"].bytes,
      /right/,
    );

    const final = await snapshot(root);

    await generate(root, options);
    await session.generate({ check: true });
    assert.deepEqual(await snapshot(root), final);

    await rm(resolve(root, "generated/context.generated.d.ts"));

    const missing = await snapshot(root);

    await assert.rejects(session.generate({ check: true }), /missing/);
    assert.deepEqual(await snapshot(root), missing);
    await session.generate();
    assert.equal(
      (await snapshot(root))["generated/context.generated.d.ts"].bytes,
      final["generated/context.generated.d.ts"].bytes,
    );
    await put(
      root,
      "generated/server.generated.ts",
      final["generated/server.generated.ts"].bytes + "\n// drift",
    );

    const drift = await snapshot(root);

    await assert.rejects(session.generate({ check: true }), /changed/);
    assert.deepEqual(await snapshot(root), drift);
    await session.generate();
  } finally {
    await session.dispose();
  }
});

test("warm transitive schema/context/import edits, invalid diagnostics and declarations remain repairable", async () => {
  const root = await fixture();
  const session = createGenerationSession(root, options);

  try {
    await session.generate();

    const first = await snapshot(root);

    await put(root, "src/schema-type.ts", "export interface Output {length:string}");
    await rejectsUnchanged(root, session, /not assignable/);
    await put(root, "src/schema-type.ts", "export interface Output {length:number}");
    await session.generate({ check: true });
    assert.deepEqual(await snapshot(root), first);

    await put(root, "src/value.ts", "export const value = 'context changed';");
    await rejectsUnchanged(root, session, /not assignable/);
    await put(
      root,
      "src/checks.ts",
      "import {injectRpc} from './routes/left/rpc.generated';const result:Promise<{length:number;value:string}>=injectRpc().todos.read('hello');void result;",
    );
    await session.generate();

    const current = await snapshot(root);

    await generate(root, options);
    assert.deepEqual(await snapshot(root), current);

    await rename(resolve(root, "src/value.ts"), resolve(root, "src/renamed-value.ts"));
    await rejectsUnchanged(root, session, /Unresolved import|Cannot find module/);

    const context = await readFile(resolve(root, "src/context.ts"), "utf8");

    await put(root, "src/context.ts", context.replace("'./value'", "'./renamed-value'"));
    await session.generate();
    await rename(resolve(root, "src/renamed-value.ts"), resolve(root, "src/value.ts"));
    await put(root, "src/context.ts", context);
    await session.generate();
    await put(root, "src/value.ts", "export const value = 9;");
    await rejectsUnchanged(root, session, /not assignable/);
    await put(root, "src/value.ts", "export const value = 'repaired';");
    await session.generate({ check: true });

    // Generation checks only its own domain; an unrelated application declaration
    // error is left to the application's build and no longer blocks publication.
    await put(root, "src/broken.d.ts", "export interface Broken {value:MissingType}");
    await session.generate();
    await session.generate({ check: true });
    await rm(resolve(root, "src/broken.d.ts"));
    await session.generate({ check: true });
    await put(root, "src/value.ts", "export const value = ;");
    await rejectsUnchanged(root, session, /Expression expected/);
    await put(root, "src/value.ts", "export const value = 'repaired';");
    await session.generate({ check: true });
  } finally {
    await session.dispose();
  }
});

test("warm config strict/noCheck/inherited flags and declaration diagnostics preserve last-good outputs", async () => {
  const root = await fixture();
  const session = createGenerationSession(root, options);
  const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));
  const flags = [
    "noImplicitAny",
    "strictNullChecks",
    "strictFunctionTypes",
    "strictBindCallApply",
    "strictPropertyInitialization",
    "strictBuiltinIteratorReturn",
    "noImplicitThis",
    "useUnknownInCatchVariables",
  ];

  try {
    await session.generate();

    for (const flag of flags) {
      await put(root, "tsconfig.json", JSON.stringify(config));
      await session.generate();
      await put(
        root,
        "tsconfig.json",
        JSON.stringify({
          ...config,
          compilerOptions: { ...config.compilerOptions, [flag]: false },
        }),
      );
      await rejectsUnchanged(root, session, new RegExp(flag));
    }

    await put(root, "tsconfig.json", JSON.stringify(config));
    await session.generate();
    await put(
      root,
      "tsconfig.json",
      JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, noCheck: true } }),
    );
    await rejectsUnchanged(root, session, /noCheck/);
    await put(root, "base.json", JSON.stringify({ compilerOptions: config.compilerOptions }));
    await put(
      root,
      "tsconfig.json",
      JSON.stringify({
        extends: "./base.json",
        compilerOptions: { strict: true },
        include: config.include,
      }),
    );
    await session.generate();
    await put(
      root,
      "base.json",
      JSON.stringify({ compilerOptions: { ...config.compilerOptions, noImplicitAny: false } }),
    );
    await rejectsUnchanged(root, session, /noImplicitAny/);
    await put(
      root,
      "tsconfig.json",
      JSON.stringify({
        ...config,
        compilerOptions: { ...config.compilerOptions, declaration: true, noEmit: true },
      }),
    );
    await session.generate();

    // Exported generated callables must stay nameable through public entry points.
    await put(
      root,
      "src/callable.ts",
      "import {injectRpc} from './routes/left/rpc.generated';export const read = injectRpc().todos.read;",
    );
    await session.generate();
    await rm(resolve(root, "src/callable.ts"));

    const exposed = "export const exposed = new class {private secret=1;}();";

    // Declaration emit is checked for generation's own domain only: an unrelated
    // file is left to the application's build, a direct importer still blocks.
    await put(root, "src/private.ts", exposed);
    await session.generate();
    await rm(resolve(root, "src/private.ts"));

    const checks = await readFile(resolve(root, "src/checks.ts"), "utf8");

    await put(root, "src/checks.ts", `${checks}\n${exposed}`);
    await rejectsUnchanged(root, session, /private|named/);
    await put(root, "src/checks.ts", checks);
    await session.generate({ check: true });
  } finally {
    await session.dispose();
  }
});

test("direct-dependency, isolated and verbatim modes still reject errors through transitive imports", async () => {
  for (const flag of [
    "assumeChangesOnlyAffectDirectDependencies",
    "isolatedModules",
    "verbatimModuleSyntax",
  ]) {
    const root = await fixture();
    const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

    config.compilerOptions[flag] = true;
    await put(root, "tsconfig.json", JSON.stringify(config));
    await put(root, "src/context-value.ts", "export {value} from './value';");

    const context = await readFile(resolve(root, "src/context.ts"), "utf8");

    await put(root, "src/context.ts", context.replace("'./value'", "'./context-value'"));

    const session = createGenerationSession(root, options);

    try {
      await session.generate();
      await session.generate();
      await put(root, "src/value.ts", "export const value = 'invalid transitive value';");
      await rejectsUnchanged(root, session, /not assignable/);
      await put(root, "src/value.ts", "export const value = 7;");
      await session.generate({ check: true });
    } finally {
      await session.dispose();
    }
  }
});

test("warm genuine aliases/facades, lookalike/ambient factories, underlying router redirection and fresh suffix resolution", async () => {
  const root = await fixture();
  const session = createGenerationSession(root, options);
  const rpc = await readFile(resolve(root, "src/routes/left/rpc.ts"), "utf8");
  const route = await readFile(resolve(root, "src/routes/left/route.ts"), "utf8");
  const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

  try {
    await session.generate();
    await put(
      root,
      "src/routes/left/route.ts",
      route.replace("'@loozo/angular-router'", "'./route.generated.js'"),
    );
    await put(
      root,
      "src/routes/left/rpc.ts",
      rpc
        .replace("defineRpc,query", "defineRpc as rpc,query as read")
        .replace("default defineRpc", "default rpc")
        .replace("read:query", "read:read"),
    );
    await session.generate();
    await generate(root, options);
    await put(root, "src/fake.ts", "export const query=(value:unknown)=>value;");
    await put(
      root,
      "src/routes/left/rpc.ts",
      rpc
        .replace("defineRpc,query", "defineRpc")
        .replace("import {schema}", "import {query} from '../../fake';import {schema}"),
    );
    await rejectsUnchanged(root, session, /genuine|canonical|concrete/);
    await put(root, "src/routes/left/rpc.ts", rpc);
    await session.generate();
    await put(
      root,
      "src/ambient.d.ts",
      "declare module '@loozo/angular-launch/server' {export function defineContext(...args:any[]):any;export function defineRpc(...args:any[]):any;export function query(...args:any[]):any;}",
    );
    await rejectsUnchanged(root, session, /canonical|concrete/);
    await rm(resolve(root, "src/ambient.d.ts"));
    await session.generate();
    await put(
      root,
      "src/fake-router.ts",
      "export function defineRoute(path:string,config:unknown){return {path,config};}",
    );
    await put(
      root,
      "tsconfig.json",
      JSON.stringify({
        ...config,
        compilerOptions: {
          ...config.compilerOptions,
          paths: { "@loozo/angular-router/_core": ["src/fake-router.ts"] },
        },
      }),
    );
    await rejectsUnchanged(root, session, /Factory binding.*concrete/);
    await put(
      root,
      "tsconfig.json",
      JSON.stringify({
        ...config,
        compilerOptions: { ...config.compilerOptions, moduleSuffixes: [".fake", ""] },
        exclude: ["**/*.fake.ts"],
      }),
    );
    await session.generate();
    // Config and authored imports stay identical while a higher-priority target appears.
    await put(
      root,
      "src/context.fake.ts",
      "export default {create:(request:Request)=>({request,value:999})};",
    );
    await rejectsUnchanged(root, session, /Generated payload import must resolve/);
    await rm(resolve(root, "src/context.fake.ts"));
    await session.generate();
    await put(
      root,
      "src/routes/left/rpc.fake.ts",
      "const kind:'query'='query';export default {name:'todos',canActivate:[],procedures:{read:{kind,input:undefined,canActivate:[],handler:()=>({length:1,value:999})}}};",
    );
    await rejectsUnchanged(root, session, /Generated payload import must resolve/);
    await rm(resolve(root, "src/routes/left/rpc.fake.ts"));
    await session.generate({ check: true });
  } finally {
    await session.dispose();
  }
});

test("metadata-only export swaps block warm/cold generate/check and app-identity publication, then repair", async () => {
  const root = await fixture();
  const session = createGenerationSession(root, options);
  const original = JSON.stringify({
    name: "dependency",
    version: "1.0.0",
    exports: { "./first": "./number.d.ts", "./second": "./string.d.ts" },
  });
  const swapped = JSON.stringify({
    name: "dependency",
    version: "1.0.0",
    exports: { "./first": "./string.d.ts", "./second": "./number.d.ts" },
  });
  const manifest = "node_modules/dependency/package.json";

  await Promise.all([
    put(root, manifest, original),
    put(root, "node_modules/dependency/number.d.ts", "export declare const value:number;"),
    put(root, "node_modules/dependency/string.d.ts", "export declare const value:string;"),
    put(
      root,
      "src/context.ts",
      "import {defineContext} from '@loozo/angular-launch/server';import {value as first} from 'dependency/first';import {value as second} from 'dependency/second';export default defineContext((request:Request)=>({request,value:first,second}));",
    ),
    put(
      root,
      "src/routes/left/rpc.ts",
      "import {defineRpc,query} from '@loozo/angular-launch/server';export default defineRpc('todos',{read:query({handler:({context}):number=>context.value})});",
    ),
    put(
      root,
      "src/checks.ts",
      "import {injectRpc} from './routes/left/rpc.generated';const result:Promise<number>=injectRpc().todos.read();void result;",
    ),
  ]);

  try {
    await session.generate();

    const before = await snapshot(root);
    const identity = await readFile(resolve(root, "package.json"), "utf8");
    const changedIdentity = JSON.stringify({
      name: "session-consumer-changed",
      private: true,
      type: "module",
    });

    for (const action of [
      () => session.generate(),
      () => session.generate({ check: true }),
      () => generate(root, options),
      () => generate(root, { ...options, check: true }),
    ]) {
      // Rewarm each case: a prior rejection clears the session's slots.
      await put(root, manifest, original);
      await put(root, "package.json", identity);
      await session.generate();
      await session.generate({ check: true });
      assert.deepEqual(await snapshot(root), before);
      await put(root, manifest, swapped);
      await put(root, "package.json", changedIdentity);
      await assert.rejects(action(), /TS2322/);
      assert.deepEqual(await snapshot(root), before);
    }

    await put(root, manifest, original);
    // Keep the identity edit to prove invalidity blocked a genuinely changed plan.
    await session.generate();

    const repaired = await snapshot(root);

    assert.notEqual(
      repaired["generated/server.generated.ts"].bytes,
      before["generated/server.generated.ts"].bytes,
    );
    await session.generate({ check: true });
    await generate(root, options);
    assert.deepEqual(await snapshot(root), repaired);
  } finally {
    await session.dispose();
  }
});

test("disposal inside the final stop predicate returning false suppresses changed-output publication", async () => {
  const root = await fixture();
  const session = createGenerationSession(root, options);

  await session.generate();

  const before = await snapshot(root);

  await put(
    root,
    "package.json",
    JSON.stringify({ name: "disposed-identity-change", private: true, type: "module" }),
  );

  let closing;
  let calls = 0;
  const work = session.generate({}, () => {
    calls += 1;
    closing = session.dispose();

    return false;
  });

  await work;
  assert.equal(calls, 1);
  assert.ok(closing instanceof Promise);
  await closing;
  assert.deepEqual(await snapshot(root), before);
  await assert.rejects(session.generate(), /disposed/);
  await session.dispose();
  // The edit really requires publication; the predicate prevented that write.
  await generate(root, options);
  assert.notEqual(
    (await snapshot(root))["generated/server.generated.ts"].bytes,
    before["generated/server.generated.ts"].bytes,
  );
});

test("session stop/overlap/dispose and independent application registrations do not publish or poison later calls", async () => {
  const root = await fixture();
  const session = createGenerationSession(root, options);

  await session.generate({}, () => true);
  assert.deepEqual(await snapshot(root), {});

  const work = session.generate();

  await assert.rejects(session.generate(), /sequential/);

  const disposal = session.dispose();

  await assert.rejects(session.generate(), /disposed/);
  await Promise.all([work, disposal, session.dispose()]);
  assert.deepEqual(await snapshot(root), {});

  const first = createGenerationSession(root, options);
  const secondRoot = await fixture();

  await put(secondRoot, "src/value.ts", "export const value = 'independent';");
  await put(
    secondRoot,
    "src/checks.ts",
    "import {injectRpc} from './routes/left/rpc.generated';const result:Promise<{length:number;value:string}>=injectRpc().todos.read('hello');void result;",
  );

  const second = createGenerationSession(secondRoot, options);

  try {
    await Promise.all([first.generate(), second.generate()]);
    await Promise.all([first.generate({ check: true }), second.generate({ check: true })]);
    await put(root, "src/value.ts", "export const value = 'invalid for first';");
    await rejectsUnchanged(root, first, /not assignable/);
    await second.generate({ check: true });
    await put(root, "src/value.ts", "export const value = 7;");
    await first.generate({ check: true });

    const before = await snapshot(root);

    await put(
      root,
      "generated/server.generated.ts",
      before["generated/server.generated.ts"].bytes + "\n// stopped check drift",
    );

    const drift = await snapshot(root);

    await first.generate({ check: true }, () => true);
    assert.deepEqual(await snapshot(root), drift);
    await first.generate();
    assert.equal(
      (await snapshot(root))["generated/server.generated.ts"].bytes,
      before["generated/server.generated.ts"].bytes,
    );

    const repaired = await snapshot(root);
    const pending = first.generate();

    await Promise.all([pending, first.dispose()]);
    assert.deepEqual(await snapshot(root), repaired);

    const invalid = createGenerationSession(root, options);

    await put(root, "src/value.ts", "export const value = 'invalid during disposal';");

    const rejected = invalid.generate();
    const closed = invalid.dispose();

    await assert.rejects(rejected, /not assignable/);
    await closed;
    await assert.rejects(invalid.generate(), /disposed/);
    assert.deepEqual(await snapshot(root), repaired);

    // Standalone router remains cold and cannot clean retained Launch products.
    for (const name of ["left", "right"]) {
      await rm(resolve(secondRoot, `src/routes/${name}/rpc.ts`));
    }

    const config = JSON.parse(await readFile(resolve(secondRoot, "tsconfig.json"), "utf8"));

    config.exclude = ["**/rpc.generated.ts", "generated/server.generated.ts", "src/checks.ts"];
    await put(secondRoot, "tsconfig.json", JSON.stringify(config));

    const launchBefore = (await snapshot(secondRoot))["src/routes/left/rpc.generated.ts"];

    await generateRouter(secondRoot, { ...options, autoDefineRoutes: false }, () => false);
    assert.deepEqual(
      (await snapshot(secondRoot))["src/routes/left/rpc.generated.ts"],
      launchBefore,
    );
  } finally {
    await Promise.all([first.dispose(), second.dispose()]);
  }
});
