import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const tool = fileURLToPath(new URL("..", import.meta.url));
const tsc = join(
  dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
  "bin/tsc",
);

let out;
let router;
let launch;
let origami;

before(async () => {
  out = await mkdtemp(join(tmpdir(), "docs-content-repository-"));
  execFileSync(process.execPath, [join(tool, "src/cli.ts"), "--out", join(out, "content")], {
    stdio: "pipe",
  });

  const routerModule = await import(
    pathToFileURL(join(out, "content/angular-router.generated.ts")).href
  );
  const launchModule = await import(
    pathToFileURL(join(out, "content/angular-launch.generated.ts")).href
  );

  const origamiModule = await import(
    pathToFileURL(join(out, "content/origami-ui.generated.ts")).href
  );

  router = routerModule.content;
  launch = launchModule.content;
  origami = origamiModule.content;
});

after(async () => {
  await rm(out, { recursive: true, force: true });
});

function entryPoint(content, importPath) {
  for (const candidate of content.entryPoints) {
    if (candidate.importPath === importPath) {
      return candidate;
    }
  }

  return undefined;
}

test("router's root entry point yields its 9 public symbols with descriptions", () => {
  const names = [];

  for (const apiSymbol of entryPoint(router, "@loozo/angular-router").symbols) {
    names.push(apiSymbol.name);
    assert.notEqual(apiSymbol.summaryHtml, "", `${apiSymbol.name} has a description`);
  }

  assert.equal(names.length, 9);
  assert.deepEqual(
    new Set(names),
    new Set([
      "ParamCodec",
      "Route",
      "booleanParam",
      "createUrl",
      "defineRoute",
      "enumParam",
      "numberParam",
      "stringParam",
      "withFallback",
    ]),
  );
  assert.deepEqual(
    router.entryPoints.map((candidate) => candidate.importPath),
    ["@loozo/angular-router"],
  );
});

test("router's defineRoute carries params, returns, throws and an example", () => {
  let defineRoute;

  for (const apiSymbol of entryPoint(router, "@loozo/angular-router").symbols) {
    if (apiSymbol.name === "defineRoute") {
      defineRoute = apiSymbol;
    }
  }

  assert.equal(defineRoute.slug, "define-route");
  assert.equal(defineRoute.signatures.length, 1);

  const [signature] = defineRoute.signatures;

  assert.deepEqual(
    signature.params.map((param) => param.name),
    ["path", "config"],
  );
  assert.match(signature.params[0].descriptionHtml, /^<p>The literal local path/);
  assert.notEqual(signature.returnsHtml, "");
  assert.equal(signature.throwsHtml.length, 1);
  assert.equal(defineRoute.examplesHtml.length, 1);
  assert.match(
    defineRoute.sourceUrl,
    /\/blob\/[0-9a-f]{40}\/packages\/angular-router\/_core\/src\/route\.ts#L\d+-L\d+$/,
  );
});

test("router's Handle and Destination land in generatedApi without _core duplicates", () => {
  const publicNames = new Set();
  const generated = new Map();

  for (const apiSymbol of entryPoint(router, "@loozo/angular-router").symbols) {
    publicNames.add(apiSymbol.name);
  }

  for (const apiSymbol of router.generatedApi) {
    generated.set(apiSymbol.name, apiSymbol);
    assert.equal(publicNames.has(apiSymbol.name), false, `${apiSymbol.name} is not public`);
  }

  assert.equal(generated.get("Handle").importPath, "@loozo/angular-router/_generated");
  assert.equal(generated.get("Destination").importPath, "@loozo/angular-router/_generated");
  assert.equal(generated.get("Destination").kind, "class");
  // #private and symbol-keyed members are not documented.
  assert.deepEqual(generated.get("Destination").members, []);
});

test("router's Handle groups link/navigate overloads with per-overload params", () => {
  let handle;

  for (const apiSymbol of router.generatedApi) {
    if (apiSymbol.name === "Handle") {
      handle = apiSymbol;
    }
  }

  const members = new Map();

  for (const member of handle.members) {
    assert.equal(members.has(member.name), false, `${member.name} is unique`);
    members.set(member.name, member);
  }

  for (const name of ["link", "navigate"]) {
    const member = members.get(name);
    const params = [];

    for (const signature of member.signatures) {
      params.push(signature.params.map((param) => param.name).join(","));
      assert.notEqual(signature.returnsHtml, "", `${name} overload returns`);
      assert.equal(signature.throwsHtml.length, 1, `${name} overload throws`);

      for (const param of signature.params) {
        assert.notEqual(param.descriptionHtml, "", `${name} ${param.name} is described`);
      }
    }

    assert.equal(member.kind, "method");
    assert.deepEqual(params, ["values", "selector,values", "selector,values", "selector,values"]);
  }

  // Each selector overload documents its own selector.
  const selectors = new Set();

  for (const signature of members.get("link").signatures.slice(1)) {
    selectors.add(signature.params[0].descriptionHtml);
  }

  assert.equal(selectors.size, 3);
});

test("router's Handle and Destination list their documented type params", () => {
  const typeParams = {};

  for (const apiSymbol of router.generatedApi) {
    if (apiSymbol.name !== "Handle" && apiSymbol.name !== "Destination") {
      continue;
    }

    typeParams[apiSymbol.name] = [];

    for (const typeParam of apiSymbol.typeParams) {
      assert.notEqual(typeParam.descriptionHtml, "", `${apiSymbol.name} ${typeParam.name}`);
      typeParams[apiSymbol.name].push(typeParam.name);
    }
  }

  assert.deepEqual(typeParams.Handle, ["Target", "Selected", "Set", "References"]);
  assert.deepEqual(typeParams.Destination, ["Target", "Set", "Id"]);
});

test("launch's RpcError documents code/status/data and frameworkFailures is not truncated", () => {
  const symbols = new Map();

  for (const apiSymbol of entryPoint(launch, "@loozo/angular-launch").symbols) {
    symbols.set(apiSymbol.name, apiSymbol);
  }

  const members = new Map();

  for (const member of symbols.get("RpcError").members) {
    members.set(member.name, member);
  }

  for (const name of ["code", "status", "data"]) {
    assert.equal(members.get(name)?.kind, "property", `${name} is a property`);
    assert.equal(members.get(name).readonly, true, `${name} is readonly`);
  }

  const failures = symbols.get("frameworkFailures").signatures[0].html;

  assert.doesNotMatch(failures, /\.\.\./);
  assert.match(failures, /RPC_NOT_FOUND/);
  assert.match(failures, /404/);
  assert.match(failures, /Internal server error/);
});

test("launch's ./server entry point extracts", () => {
  const server = entryPoint(launch, "@loozo/angular-launch/server");
  const names = new Set();

  for (const apiSymbol of server.symbols) {
    names.add(apiSymbol.name);
  }

  for (const name of ["defineRpc", "defineContext", "query", "mutation", "finishLaunchRendering"]) {
    assert.equal(names.has(name), true, `${name} is extracted`);
  }

  assert.deepEqual(
    launch.entryPoints.map((candidate) => candidate.importPath),
    ["@loozo/angular-launch", "@loozo/angular-launch/server", "@loozo/angular-launch/generation"],
  );
});

test("origami's empty root is left out and its secondary entry points list the public API", () => {
  const names = {};

  for (const candidate of origami.entryPoints) {
    names[candidate.importPath] = [];

    for (const apiSymbol of candidate.symbols) {
      names[candidate.importPath].push(apiSymbol.name);
    }
  }

  assert.deepEqual(Object.keys(names), [
    "@loozo/origami-ui/utils",
    "@loozo/origami-ui/collection",
    "@loozo/origami-ui/presence",
    "@loozo/origami-ui/collapsible",
    "@loozo/origami-ui/accordion",
    "@loozo/origami-ui/popover",
    "@loozo/origami-ui/toggle",
  ]);
  assert.deepEqual(names["@loozo/origami-ui/utils"], ["injectDeferred", "injectUniqueId"]);
  // Compiler-required ɵ exports are not application API.
  assert.equal(names["@loozo/origami-ui/accordion"].includes("ɵOrigamiAccordionRoot"), false);
  assert.equal(names["@loozo/origami-ui/accordion"].length, 11);
  assert.equal(names["@loozo/origami-ui/popover"].length, 12);
  assert.deepEqual(origami.generatedApi, []);
});

test("generated modules typecheck against model.generated.ts under strict settings", async () => {
  await writeFile(
    join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2022"],
        types: [],
        noUnusedLocals: true,
        noImplicitReturns: true,
        exactOptionalPropertyTypes: true,
      },
      include: ["content/*.ts", "consumer.ts"],
    }),
  );
  // The index types each listed slug as a PackageSlug.
  await writeFile(
    join(out, "consumer.ts"),
    'import { loadPackage, packages, type PackageSlug } from "./content/index.generated.js";\n\n' +
      "const slug: PackageSlug = packages[0]!.slug;\n\n" +
      "export const content = loadPackage(slug);\n",
  );

  execFileSync(process.execPath, [tsc, "-p", join(out, "tsconfig.json")], { stdio: "pipe" });
});
