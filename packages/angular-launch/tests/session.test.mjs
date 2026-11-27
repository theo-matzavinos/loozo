import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile, readdir, writeFile, stat, rm, rename } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { generate, createGenerationSession } from "../dist/generation/index.js";

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

// A route under the root whose `.remote()` declares `namespace`, or none without one.
function leaf(name, namespace) {
  const head = `import {defineRoute} from '@loozo/angular-launch';import {schema} from '../../schema';import parent from '../route';void schema;export default defineRoute('${name}',{parent})`;

  if (namespace === undefined) {
    return `${head};`;
  }

  return `${head}.remote(({query}) => ({'${namespace}': {read:query({input:schema,handler:({input,context})=>({length:input.length,value:context.value})})}}));`;
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
      "import {value} from './value'; export const stage = ({request}:{request:Request})=>({request,value});",
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
      "import {defineRoute} from '@loozo/angular-launch';import {stage} from '../context';export default defineRoute('',{}).context(stage);",
    ),
    put(
      root,
      "src/checks.ts",
      "import {injectRoute} from './routes/left/route.generated';const result:Promise<{length:number;value:number}>=injectRoute().remote.todos.read('hello');void result;",
    ),
  ];

  for (const [name, namespace] of [
    ["left", "todos"],
    ["right", "items"],
  ]) {
    writes.push(
      put(root, `src/routes/${name}/route.ts`, leaf(name, namespace)),
      put(
        root,
        `src/routes/${name}/page.ts`,
        "import {Component} from '@angular/core';@Component({selector:'session-page',template:'ok'}) export default class Page {}",
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

        // Keyed with / on every platform, as the tests look files up.
        files[relative(root, path).split(sep).join("/")] = { bytes, mtime: String(info.mtimeNs) };
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

    const rpc = await readFile(resolve(root, "src/routes/left/route.ts"), "utf8");

    await put(root, "src/routes/left/route.ts", rpc.replace("'todos'", "'changed'"));
    await put(
      root,
      "src/checks.ts",
      "import {injectRoute} from './routes/left/route.generated';const result:Promise<{length:number;value:number}>=injectRoute().remote.changed.read('hello');void result;",
    );
    await session.generate();
    assert.notEqual(
      (await snapshot(root))["src/routes/left/route.generated.ts"].bytes,
      first["src/routes/left/route.generated.ts"].bytes,
    );

    await rename(resolve(root, "src/routes/left"), resolve(root, "src/routes/moved"));
    await put(
      root,
      "src/checks.ts",
      "import {injectRoute} from './routes/moved/route.generated';injectRoute().remote.changed.read('hello');",
    );
    await session.generate();
    assert.equal((await snapshot(root))["src/routes/left/route.generated.ts"], undefined);
    await rename(resolve(root, "src/routes/moved"), resolve(root, "src/routes/left"));
    await put(
      root,
      "src/checks.ts",
      "import {injectRoute} from './routes/left/route.generated';injectRoute().remote.changed.read('hello');",
    );
    await session.generate();
    await put(root, "src/routes/left/route.ts", rpc.replace("'todos'", "'returned'"));
    await put(
      root,
      "src/checks.ts",
      "import {injectRoute} from './routes/left/route.generated';injectRoute().remote.returned.read('hello');",
    );
    await session.generate();
    assert.match((await snapshot(root))["src/routes/left/route.generated.ts"].bytes, /returned/);

    await put(root, "src/routes/right/route.ts", leaf("right"));
    await session.generate();
    assert.doesNotMatch(
      (await snapshot(root))["src/routes/right/route.generated.ts"].bytes,
      /items/,
    );
    await put(root, "src/routes/right/route.ts", leaf("right", "added"));
    await session.generate();
    assert.match((await snapshot(root))["src/routes/right/route.generated.ts"].bytes, /added/);
    await rm(resolve(root, "src/routes/right"), { recursive: true });
    await session.generate();
    assert.doesNotMatch((await snapshot(root))["generated/routes.generated.ts"].bytes, /right/);

    const final = await snapshot(root);

    await generate(root, options);
    await session.generate({ check: true });
    assert.deepEqual(await snapshot(root), final);

    await rm(resolve(root, "generated/server.generated.ts"));

    const missing = await snapshot(root);

    await assert.rejects(session.generate({ check: true }), /missing/);
    assert.deepEqual(await snapshot(root), missing);
    await session.generate();
    assert.equal(
      (await snapshot(root))["generated/server.generated.ts"].bytes,
      final["generated/server.generated.ts"].bytes,
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

// A case-only directory rename is a plain rename on Linux; on case-insensitive macOS and Windows
// volumes the old and new names are the same entry, which a warm session may still know by its
// old spelling.
test("a warm session republishes a case-only route directory rename under the new casing, with cold parity", async () => {
  const root = await fixture();
  const session = createGenerationSession(root, options);

  try {
    await session.generate();
    await rename(resolve(root, "src/routes/left"), resolve(root, "src/routes/Left"));
    await put(
      root,
      "src/checks.ts",
      "import {injectRoute} from './routes/Left/route.generated';const result:Promise<{length:number;value:number}>=injectRoute().remote.todos.read('hello');void result;",
    );
    await session.generate();

    const files = await snapshot(root);
    const server = files["generated/server.generated.ts"].bytes;

    assert.match(files["src/routes/Left/route.generated.ts"].bytes, /todos/);
    assert.match(server, /from "\.\.\/src\/routes\/Left\/route\.js";/);
    assert.match(server, /"src\/routes\/Left\/route\.ts"\]/);

    // The route's own path stays "left"; only the directory's old spelling must be gone.
    for (const [file, { bytes }] of Object.entries(files)) {
      assert.doesNotMatch(file, /left\//, file);
      assert.doesNotMatch(bytes, /left\/|_left_/, file);
    }

    await session.generate({ check: true });
    await generate(root, options);
    assert.deepEqual(await snapshot(root), files);
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
      "import {injectRoute} from './routes/left/route.generated';const result:Promise<{length:number;value:string}>=injectRoute().remote.todos.read('hello');void result;",
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
    // Generation scans the route directory, like the router: a syntax error there fails it.
    const left = await readFile(resolve(root, "src/routes/left/route.ts"), "utf8");

    await put(root, "src/routes/left/route.ts", left.replace("({query})", "({query}) =>"));
    await rejectsUnchanged(root, session, /Expression expected|expected/);
    await put(root, "src/routes/left/route.ts", left);
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
      "import {injectRoute} from './routes/left/route.generated';export const read = injectRoute().remote.todos.read;",
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

test("warm genuine aliases, lookalike/ambient factories, underlying router redirection and fresh suffix resolution", async () => {
  const root = await fixture();
  const session = createGenerationSession(root, options);
  const route = await readFile(resolve(root, "src/routes/left/route.ts"), "utf8");
  const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

  try {
    await session.generate();
    await put(
      root,
      "src/routes/left/route.ts",
      route
        .replace("{defineRoute}", "{defineRoute as declareRoute}")
        .replace("default defineRoute", "default declareRoute"),
    );
    await session.generate();
    await generate(root, options);
    await put(root, "src/fake.ts", "export const query=(value:unknown)=>value;");
    await put(
      root,
      "src/routes/left/route.ts",
      route
        .replace("read:query(", "read:fake(")
        .replace("import {schema}", "import {query as fake} from '../../fake';import {schema}"),
    );
    await rejectsUnchanged(root, session, /callback's query, mutation, stream or channel/);
    await put(root, "src/routes/left/route.ts", route);
    await session.generate();
    await put(
      root,
      "src/ambient.d.ts",
      "declare module '@loozo/angular-launch' {export const defineRoute:any;}",
    );
    await rejectsUnchanged(root, session, /[Ff]actory|anchored|canonical|concrete/);
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
    await rejectsUnchanged(root, session, /[Ff]actory|anchored|canonical|concrete|_core/);
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
      "src/routes/left/route.fake.ts",
      "import {defineRoute} from '@loozo/angular-launch';export default defineRoute('fake',{}).remote(({query}) => ({fake: {read: query({handler: () => 999})}}));",
    );
    await rejectsUnchanged(root, session, /Generated payload import must resolve/);
    await rm(resolve(root, "src/routes/left/route.fake.ts"));
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
      "import {value as first} from 'dependency/first';import {value as second} from 'dependency/second';export const stage = ({request}:{request:Request})=>({request,value:first,second});",
    ),
    put(
      root,
      "src/routes/left/route.ts",
      "import {defineRoute} from '@loozo/angular-launch';import parent from '../route';export default defineRoute('left',{parent}).remote(({query}) => ({todos: {read:query({handler:({context}):number=>context.value})}}));",
    ),
    put(
      root,
      "src/checks.ts",
      "import {injectRoute} from './routes/left/route.generated';const result:Promise<number>=injectRoute().remote.todos.read();void result;",
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
    "import {injectRoute} from './routes/left/route.generated';const result:Promise<{length:number;value:string}>=injectRoute().remote.todos.read('hello');void result;",
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
  } finally {
    await Promise.all([first.dispose(), second.dispose()]);
  }
});

const checks = (body) =>
  `import {injectRoute} from './routes/left/route.generated';const result:Promise<{length:number;value:number}>=injectRoute().remote.todos.read('hello');void result;${body}`;

// Each change runs after two warm passes on one session; `setup` runs before them and `between`
// between them, and any may leave the project invalid. `fails` is the error the changed project
// gives, if any. src/checks.ts
// imports a generated output, so Launch checks it with the generated files and declarations.
const reuseChanges = {
  "a route's own edit": {
    change: (root) =>
      put(
        root,
        "src/routes/left/route.ts",
        leaf("left", "todos").replace("value:context.value", "value:context.value+1"),
      ),
  },
  "a schema type reaching a .remote() handler and its importer": {
    fails: /checks\.ts[^]*TS2322/,
    change: (root) => put(root, "src/schema-type.ts", "export interface Output {length:string}"),
  },
  "a context value reaching every handler through the root stage": {
    fails: /checks\.ts[^]*TS2322/,
    change: (root) => put(root, "src/value.ts", "export const value = 'seven';"),
  },
  "a global augmentation's type without an import edge": {
    fails: /checks\.ts[^]*TS2322/,
    setup: async (root) => {
      await put(root, "src/augment.ts", "declare global {var launchFlag: number;} export {};");
      await put(
        root,
        "src/checks.ts",
        checks("const flag:number=globalThis.launchFlag;void flag;"),
      );
    },
    change: (root) =>
      put(root, "src/augment.ts", "declare global {var launchFlag: string;} export {};"),
  },
  "a dependency's declaration edit": {
    fails: /checks\.ts[^]*TS2322/,
    setup: async (root) => {
      await put(
        root,
        "node_modules/launch-extra/package.json",
        JSON.stringify({ name: "launch-extra", version: "1.0.0", types: "./a.d.ts" }),
      );
      await put(root, "node_modules/launch-extra/a.d.ts", "export type Flag = number;");
      await put(
        root,
        "src/checks.ts",
        checks("import type {Flag} from 'launch-extra';const flag:Flag=1;void flag;"),
      );
    },
    change: (root) => put(root, "node_modules/launch-extra/a.d.ts", "export type Flag = string;"),
  },
  "a transitive type change through a re-export with assumeChangesOnlyAffectDirectDependencies": {
    fails: /checks\.ts[^]*TS2322/,
    setup: async (root) => {
      const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

      config.compilerOptions.assumeChangesOnlyAffectDirectDependencies = true;
      await put(root, "tsconfig.json", JSON.stringify(config));
      await put(root, "src/reexport.ts", "export type {Output} from './schema-type';");
      await put(
        root,
        "src/checks.ts",
        checks(
          "import type {Output} from './reexport';const output:Output={length:1};void output;",
        ),
      );
    },
    // A declaration-preserving edit, so the next pass records the re-export's emitted signature.
    between: (root) =>
      put(
        root,
        "src/reexport.ts",
        "export type {Output} from './schema-type';const ignored=1;void ignored;",
      ),
    change: (root) => put(root, "src/schema-type.ts", "export interface Output {length:string}"),
  },
  "a transitive type change with assumeChangesOnlyAffectDirectDependencies and isolatedModules": {
    fails: /checks\.ts[^]*TS2322/,
    setup: async (root) => {
      const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

      config.compilerOptions.assumeChangesOnlyAffectDirectDependencies = true;
      config.compilerOptions.isolatedModules = true;
      await put(root, "tsconfig.json", JSON.stringify(config));
      await put(root, "src/reexport.ts", "export type {Output} from './schema-type';");
      await put(
        root,
        "src/checks.ts",
        checks(
          "import type {Output} from './reexport';const output:Output={length:1};void output;",
        ),
      );
    },
    change: (root) => put(root, "src/schema-type.ts", "export interface Output {length:string}"),
  },
  "a context value fixed after a failed pass": {
    setup: (root) => put(root, "src/value.ts", "export const value = 'seven';"),
    change: (root) => put(root, "src/value.ts", "export const value = 7;"),
  },
  "a context value change under declaration emit": {
    fails: /checks\.ts[^]*TS2322/,
    setup: async (root) => {
      const config = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));

      config.compilerOptions.declaration = true;
      await put(root, "tsconfig.json", JSON.stringify(config));
    },
    change: (root) => put(root, "src/value.ts", "export const value = 'seven';"),
  },
};

async function reuseOutcome(root, run) {
  const files = {};
  let error;

  try {
    await run();
  } catch (failure) {
    error = failure.message;
  }

  for (const [path, { bytes }] of Object.entries(await snapshot(root))) {
    files[path] = bytes;
  }

  return { error, files };
}

// Launch serve's passes carry semantic diagnostics across a session; after each kind of change, a
// warm pass must publish the same bytes, or fail with the same error, as a cold one.
test("a warm session pass matches a cold pass after each kind of change", async (t) => {
  for (const [name, { setup, between, change, fails }] of Object.entries(reuseChanges)) {
    await t.test(name, async () => {
      const root = await fixture();
      const session = createGenerationSession(root, options);

      try {
        await setup?.(root);
        await reuseOutcome(root, () => session.generate());
        await between?.(root);
        await reuseOutcome(root, () => session.generate());
        await change(root);

        const warm = await reuseOutcome(root, () => session.generate());
        const cold = await reuseOutcome(root, () => generate(root, options));

        if (fails) {
          assert.match(cold.error ?? "", fails);
        } else {
          assert.equal(cold.error, undefined);
        }

        assert.deepEqual(warm, cold);
      } finally {
        await session.dispose();
      }
    });
  }
});
