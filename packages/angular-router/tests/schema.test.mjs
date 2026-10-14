import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { applicationSchema } from "../scripts/application-schema.mjs";

const require = createRequire(import.meta.url);
const core = createRequire(require.resolve("@angular-devkit/architect"))("@angular-devkit/core");
const committed = await readFile(new URL("../schemas/application.json", import.meta.url), "utf8");
const router = {
  tsconfig: "tsconfig.routes.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
  browser: "src/main.ts",
  tsConfig: "tsconfig.app.json",
};

// Validates as Architect does, so the result is what both builders and Angular's dev server see.
async function validate(options) {
  const registry = new core.json.schema.CoreSchemaRegistry();

  registry.addPostTransform(core.json.schema.transforms.addUndefinedDefaults);

  const validator = await registry.compile(JSON.parse(committed));

  return validator(structuredClone(options));
}

await test("the committed application schema matches the installed @angular/build", async () => {
  assert.equal(
    committed,
    await applicationSchema(),
    "Regenerate with node scripts/application-schema.mjs",
  );
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
  assert.equal(result.data.autoDefineRoutes, undefined);
  assert.equal(result.data.sourceMap.vendor, true);
  assert.equal(result.data.sourceMap.scripts, true);
  assert.equal(result.data.sourceMap.styles, true);
  assert.equal(result.data.optimization.styles, false);
  assert.equal(result.data.optimization.scripts, true);
  assert.equal(result.data.optimization.fonts, true);
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
