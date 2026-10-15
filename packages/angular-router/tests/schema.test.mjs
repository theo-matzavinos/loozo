import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { angularSchema, applicationSchema, serveSchema } from "../scripts/builder-schemas.mjs";

const require = createRequire(import.meta.url);
const core = createRequire(require.resolve("@angular-devkit/architect"))("@angular-devkit/core");
const [committed, committedServe, devServer] = await Promise.all([
  readFile(new URL("../schemas/application.json", import.meta.url), "utf8"),
  readFile(new URL("../schemas/serve.json", import.meta.url), "utf8"),
  angularSchema("dev-server"),
]);
const application = JSON.parse(committed);
const serve = JSON.parse(committedServe);
const angularServe = { $schema: devServer.$schema, ...devServer.schema };
const router = {
  tsconfig: "tsconfig.routes.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
  browser: "src/main.ts",
  tsConfig: "tsconfig.app.json",
};

// Validates as Architect does, so the result is what both builders and Angular's dev server see.
async function validate(options, schema = application) {
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  const validator = await registry.compile(schema);

  return validator(structuredClone(options));
}

await test("the committed builder schemas match the installed @angular/build", async () => {
  const [expectedApplication, expectedServe] = await Promise.all([
    applicationSchema(),
    serveSchema(),
  ]);

  assert.equal(committed, expectedApplication, "Regenerate with node scripts/builder-schemas.mjs");
  assert.equal(committedServe, expectedServe, "Regenerate with node scripts/builder-schemas.mjs");
});

await test("Angular's defaults apply to the application options, including nested ones", async () => {
  const result = await validate({
    ...router,
    sourceMap: { vendor: true },
    optimization: { styles: false },
  });

  assert.equal(result.success, true, JSON.stringify(result.errors));
  assert.equal(result.data.aot, true);
  assert.equal(result.data.check, false);
  assert.equal(result.data.sourceMap.vendor, true);
  assert.equal(result.data.sourceMap.scripts, true);
  assert.equal(result.data.sourceMap.styles, true);
  assert.equal(result.data.optimization.styles, false);
  assert.equal(result.data.optimization.scripts, true);
  assert.equal(result.data.optimization.fonts, true);
});

await test("autoDefineRoutes is false or an object, and stays omitted for the generator's default", async () => {
  const omitted = await validate(router);

  assert.equal(omitted.success, true, JSON.stringify(omitted.errors));
  assert.equal(omitted.data.autoDefineRoutes, undefined);

  for (const autoDefineRoutes of [false, {}, { filename: "definition.ts" }]) {
    const result = await validate({ ...router, autoDefineRoutes });

    assert.equal(result.success, true, JSON.stringify(result.errors));
    // Angular's transform adds undefined nested defaults, which JSON drops again.
    assert.deepEqual(JSON.parse(JSON.stringify(result.data.autoDefineRoutes)), autoDefineRoutes);
  }

  for (const autoDefineRoutes of [
    true,
    null,
    [],
    { extra: true },
    { filename: "route.generated.ts" },
  ]) {
    const result = await validate({ ...router, autoDefineRoutes });

    assert.equal(result.success, false, JSON.stringify(autoDefineRoutes));
  }
});

await test("Angular's checks apply to the application options", async () => {
  for (const options of [
    { ...router, browsr: "src/main.ts" },
    { ...router, aot: "yes" },
    { ...router, tsConfig: undefined },
    { ...router, scanDirectories: ["src/routes", "src/other"] },
  ]) {
    const result = await validate(options);

    assert.equal(result.success, false, JSON.stringify(options));
  }
});

await test("the serve schema is Angular's dev-server schema with the router's poll", () => {
  const { poll, buildTarget, ...rest } = serve.properties;
  const {
    poll: angularPoll,
    buildTarget: angularBuildTarget,
    ...angularRest
  } = angularServe.properties;

  assert.deepEqual(rest, angularRest);
  assert.ok(Object.hasOwn(rest, "port"));
  assert.equal(buildTarget.pattern, angularBuildTarget.pattern);
  assert.match(buildTarget.description, /@loozo\/angular-router:application/);
  assert.equal(angularPoll.type, "number");
  assert.deepEqual(poll.oneOf, [{ type: "number", exclusiveMinimum: 0 }, { const: false }]);
  assert.equal(serve.additionalProperties, false);
  assert.deepEqual(serve.required, ["buildTarget"]);
});

await test("poll is positive milliseconds or false, and stays omitted for the builder's default", async () => {
  const omitted = await validate({ buildTarget: "app:build" }, serve);

  assert.equal(omitted.success, true, JSON.stringify(omitted.errors));
  assert.equal(omitted.data.poll, undefined);

  for (const poll of [false, 1, 500]) {
    const result = await validate({ buildTarget: "app:build", poll }, serve);

    assert.equal(result.success, true, JSON.stringify(result.errors));
    assert.equal(result.data.poll, poll);
  }

  for (const poll of [0, -1, true, "1000"]) {
    const result = await validate({ buildTarget: "app:build", poll }, serve);

    assert.equal(result.success, false, JSON.stringify(poll));
  }
});

await test("Angular's dev-server checks apply to the serve options", async () => {
  for (const options of [
    {},
    { buildTarget: "app build" },
    { buildTarget: "app:build", port: "bad" },
    { buildTarget: "app:build", prot: 4300 },
  ]) {
    const result = await validate(options, serve);

    assert.equal(result.success, false, JSON.stringify(options));
  }
});

// Serve forwards its validated options, defaults included, and Angular's dev server validates them
// again with its own schema. Applying the copied defaults first must not change what it sees.
await test("the serve schema's defaults are the ones the dev server applies itself", async () => {
  for (const options of [
    { buildTarget: "app:build" },
    { buildTarget: "app:build", port: 0, host: "127.0.0.1", liveReload: false },
    { buildTarget: "app:build", poll: 250, prebundle: { exclude: ["a"] }, allowedHosts: true },
  ]) {
    const [served, direct] = await Promise.all([
      validate(options, serve),
      validate(options, angularServe),
    ]);

    assert.equal(served.success, true, JSON.stringify(served.errors));
    assert.equal(direct.success, true, JSON.stringify(direct.errors));

    const forwarded = await validate(served.data, angularServe);

    assert.equal(forwarded.success, true, JSON.stringify(forwarded.errors));
    assert.deepEqual(forwarded.data, direct.data);
  }
});
