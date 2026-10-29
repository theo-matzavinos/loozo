// Runs the built schematics (dist/) against workspaces made by Angular's own schematics.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { SchematicTestRunner } from "@angular-devkit/schematics/testing/index.js";

const dist = new URL("../dist/", import.meta.url);
const collection = fileURLToPath(new URL("schematics/collection.json", dist));
const ngAddModule = await import(new URL("schematics/ng-add/index.js", dist).href);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function createRunner() {
  const runner = new SchematicTestRunner("@loozo/fold-ui", collection);
  const warnings = [];

  runner.logger.subscribe((entry) => {
    if (entry.level === "warn") {
      warnings.push(entry.message);
    }
  });

  return { runner, warnings };
}

async function createWorkspace(runner, { style = "tailwind", name = "shop", newProjectRoot } = {}) {
  let tree = await runner.runExternalSchematic("@schematics/angular", "workspace", {
    name: "workspace",
    version: "22.2.2",
    newProjectRoot: newProjectRoot ?? "projects",
  });

  tree = await runner.runExternalSchematic(
    "@schematics/angular",
    "application",
    { name, style, projectRoot: newProjectRoot === undefined ? "" : undefined, skipTests: true },
    tree,
  );

  return tree;
}

async function setUp(runner, options = {}) {
  const tree = await createWorkspace(runner, options.workspace);

  return runner.runSchematic("ng-add", { project: "shop", prefix: "zz", ...options.ngAdd }, tree);
}

function readText(tree, path) {
  return tree.readText(path);
}

function editAngularJson(tree, edit) {
  const angularJson = JSON.parse(tree.readText("angular.json"));

  edit(angularJson);
  tree.overwrite("angular.json", JSON.stringify(angularJson, null, 2));
}

describe("ng-add", () => {
  test("rejects a project that isn't an application", async () => {
    const { runner } = createRunner();
    let tree = await createWorkspace(runner);

    tree = await runner.runExternalSchematic(
      "@schematics/angular",
      "library",
      { name: "kit", skipInstall: true },
      tree,
    );

    await assert.rejects(runner.runSchematic("ng-add", { project: "kit" }, tree), {
      message: `fold: "kit" isn't an application in this workspace.`,
    });
    await assert.rejects(runner.runSchematic("ng-add", { project: "missing" }, tree), {
      message: `fold: "missing" isn't an application in this workspace.`,
    });
  });

  test("rejects an application without a build target", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    editAngularJson(tree, (angularJson) => {
      delete angularJson.projects.shop.architect.build;
    });

    await assert.rejects(runner.runSchematic("ng-add", { project: "shop" }, tree), {
      message: `fold: "shop" has no build target.`,
    });
  });

  test("requires Tailwind CSS in a build stylesheet", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner, { style: "css" });

    await assert.rejects(runner.runSchematic("ng-add", { project: "shop" }, tree), {
      message:
        "fold needs Tailwind CSS v4 in this app. Run `ng add tailwindcss`, then `ng add @loozo/fold-ui` again.",
    });
  });

  test("rejects a Tailwind prefix", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    tree.overwrite("src/styles.css", '@import "tailwindcss" prefix(tw);\n');

    await assert.rejects(runner.runSchematic("ng-add", { project: "shop" }, tree), {
      message: /doesn't support Tailwind's prefix\(\) option, which src\/styles\.css sets/,
    });
  });

  test("finds Tailwind in an object styles entry", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    editAngularJson(tree, (angularJson) => {
      angularJson.projects.shop.architect.build.options.styles = [
        { input: "src/styles.css", bundleName: "global" },
      ];
    });

    const result = await runner.runSchematic("ng-add", { project: "shop" }, tree);

    assert.match(readText(result, "src/styles.css"), /@import "\.\/ui\/theme\.css";/);
  });

  test("writes fold.json with the prefix and <sourceRoot>/ui", async () => {
    const { runner } = createRunner();
    const tree = await setUp(runner);

    assert.deepEqual(JSON.parse(readText(tree, "fold.json")), {
      $schema: "./node_modules/@loozo/fold-ui/schematics/fold.schema.json",
      prefix: "zz",
      path: "src/ui",
    });
  });

  test("uses <sourceRoot>/ui for a project under projects/", async () => {
    const { runner } = createRunner();
    const tree = await setUp(runner, { workspace: { newProjectRoot: "projects" } });

    assert.equal(JSON.parse(readText(tree, "fold.json")).path, "projects/shop/src/ui");
    assert.ok(tree.exists("projects/shop/src/ui/theme.css"));
    assert.match(readText(tree, "projects/shop/src/styles.css"), /@import "\.\/ui\/theme\.css";/);
    assert.equal(
      JSON.parse(readText(tree, "package.json")).imports["#ui/*"],
      "./projects/shop/src/ui/*/index.ts",
    );
  });

  test("keeps an existing fold.json and uses its values", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);
    const existing = '{ "prefix": "acme", "path": "src/app/kit" }\n';

    tree.create("fold.json", existing);

    const result = await runner.runSchematic("ng-add", { project: "shop", prefix: "zz" }, tree);

    assert.equal(readText(result, "fold.json"), existing);
    assert.ok(result.exists("src/app/kit/theme.css"));
    assert.match(readText(result, "src/styles.css"), /@import "\.\/app\/kit\/theme\.css";/);
    assert.equal(
      JSON.parse(readText(result, "package.json")).imports["#ui/*"],
      "./src/app/kit/*/index.ts",
    );
  });

  test("rejects an invalid existing fold.json", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    tree.create("fold.json", '{ "prefix": "Acme", "path": "src/ui" }\n');

    await assert.rejects(runner.runSchematic("ng-add", { project: "shop" }, tree), {
      message: /fold\.json: "prefix" must be lowercase letters and digits/,
    });
  });

  test("creates theme.css once and keeps the consumer's copy", async () => {
    const { runner } = createRunner();
    const tree = await setUp(runner);
    const theme = await readFile(new URL("components/theme.css", dist), "utf8");

    assert.equal(readText(tree, "src/ui/theme.css"), theme);

    tree.overwrite("src/ui/theme.css", ":root { --primary: #000; }\n");

    const again = await runner.runSchematic("ng-add", { project: "shop" }, tree);

    assert.equal(readText(again, "src/ui/theme.css"), ":root { --primary: #000; }\n");
  });

  test("imports the theme right after Tailwind, once", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    tree.overwrite(
      "src/styles.css",
      "/* Global styles */\n@import 'tailwindcss';\n\nbody { margin: 0; }\n",
    );

    const result = await runner.runSchematic("ng-add", { project: "shop" }, tree);
    const expected =
      "/* Global styles */\n@import 'tailwindcss';\n@import \"./ui/theme.css\";\n\nbody { margin: 0; }\n";

    assert.equal(readText(result, "src/styles.css"), expected);

    const again = await runner.runSchematic("ng-add", { project: "shop" }, result);

    assert.equal(readText(again, "src/styles.css"), expected);
  });

  test("imports the theme relative to a nested stylesheet", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    tree.create("src/styles/global.css", '@import "tailwindcss";');
    editAngularJson(tree, (angularJson) => {
      angularJson.projects.shop.architect.build.options.styles = ["src/styles/global.css"];
    });

    const result = await runner.runSchematic("ng-add", { project: "shop" }, tree);

    assert.equal(
      readText(result, "src/styles/global.css"),
      '@import "tailwindcss";\n@import "../ui/theme.css";\n',
    );
  });

  test("doesn't count a commented-out Tailwind import", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    tree.overwrite("src/styles.css", '/* @import "tailwindcss"; */\nbody { margin: 0; }\n');

    await assert.rejects(runner.runSchematic("ng-add", { project: "shop" }, tree), {
      message: /^fold needs Tailwind CSS v4 in this app\./,
    });
  });

  test("imports the theme after the active Tailwind import, not a commented-out one", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);
    const previous = '/* Previous setup:\n@import "tailwindcss";\n*/\n';

    tree.overwrite("src/styles.css", `${previous}@import "tailwindcss";\n`);

    const result = await runner.runSchematic("ng-add", { project: "shop" }, tree);

    assert.equal(
      readText(result, "src/styles.css"),
      `${previous}@import "tailwindcss";\n@import "./ui/theme.css";\n`,
    );
  });

  test("imports the theme when its import is commented out", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    tree.overwrite("src/styles.css", '@import "tailwindcss";\n/* @import "./ui/theme.css"; */\n');

    const result = await runner.runSchematic("ng-add", { project: "shop" }, tree);

    assert.equal(
      readText(result, "src/styles.css"),
      '@import "tailwindcss";\n@import "./ui/theme.css";\n/* @import "./ui/theme.css"; */\n',
    );
  });

  test("rejects a Tailwind prefix after a commented-out import", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    tree.overwrite(
      "src/styles.css",
      '/* @import "tailwindcss"; */\n@import "tailwindcss" prefix(tw);\n',
    );

    await assert.rejects(runner.runSchematic("ng-add", { project: "shop" }, tree), {
      message: /doesn't support Tailwind's prefix\(\) option/,
    });
  });

  test("moves CSS on the Tailwind import's line after the theme import", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    tree.overwrite("src/styles.css", '@import "tailwindcss"; @import "./fonts.css";\n');

    const result = await runner.runSchematic("ng-add", { project: "shop" }, tree);

    assert.equal(
      readText(result, "src/styles.css"),
      '@import "tailwindcss";\n@import "./ui/theme.css";\n@import "./fonts.css";\n',
    );
  });

  test("maps #ui/* to the component barrels", async () => {
    const { runner } = createRunner();
    const tree = await setUp(runner);

    assert.deepEqual(JSON.parse(readText(tree, "package.json")).imports, {
      "#ui/*": "./src/ui/*/index.ts",
    });

    // Running again with the same mapping is fine.
    await runner.runSchematic("ng-add", { project: "shop" }, tree);
  });

  test("rejects a different #ui/* mapping", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);
    const packageJson = JSON.parse(readText(tree, "package.json"));

    packageJson.imports = { "#ui/*": "./src/lib/*.ts" };
    tree.overwrite("package.json", JSON.stringify(packageJson, null, 2));

    await assert.rejects(runner.runSchematic("ng-add", { project: "shop" }, tree), {
      message: `fold: package.json already maps "#ui/*" to "./src/lib/*.ts", not "./src/ui/*/index.ts".`,
    });
  });

  test("adds the runtime dependencies, keeps ones declared in any section and installs", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);
    const packageJson = JSON.parse(readText(tree, "package.json"));

    packageJson.dependencies["tailwind-variants"] = "^3.0.0";
    packageJson.devDependencies["@loozo/origami-ui"] = "file:../custom-origami";
    tree.overwrite("package.json", JSON.stringify(packageJson, null, 2));

    const result = await runner.runSchematic("ng-add", { project: "shop" }, tree);
    const written = JSON.parse(readText(result, "package.json"));
    const dependencies = written.dependencies;

    assert.equal(dependencies["tailwind-variants"], "^3.0.0");
    assert.equal(dependencies["@loozo/origami-ui"], undefined);
    assert.equal(written.devDependencies["@loozo/origami-ui"], "file:../custom-origami");
    assert.equal(
      dependencies["@lucide/angular"],
      ngAddModule.runtimeDependencies["@lucide/angular"],
    );
    assert.equal(
      dependencies["@fontsource-variable/hanken-grotesk"],
      ngAddModule.runtimeDependencies["@fontsource-variable/hanken-grotesk"],
    );
    assert.ok(runner.tasks.some((task) => task.name === "node-package"));
  });

  test("installs the versions fold is developed and tested with", async () => {
    const manifest = await readJson(new URL("../package.json", import.meta.url));
    const origami = await readJson(new URL("../../origami-ui/package.json", import.meta.url));
    const expected = {};

    for (const name of Object.keys(ngAddModule.runtimeDependencies)) {
      expected[name] = manifest.devDependencies[name];
    }

    assert.equal(expected["@loozo/origami-ui"], "workspace:*");
    expected["@loozo/origami-ui"] = origami.version;

    assert.deepEqual(ngAddModule.runtimeDependencies, expected);
  });
});

describe("add", () => {
  test("requires ng add first", async () => {
    const { runner } = createRunner();
    const tree = await createWorkspace(runner);

    await assert.rejects(runner.runSchematic("add", { names: ["button"] }, tree), {
      message: "fold isn't set up in this workspace. Run `ng add @loozo/fold-ui` first.",
    });
  });

  test("offers exactly the component folders", async () => {
    const schema = await readJson(new URL("schematics/add/schema.json", dist));
    const folders = [];

    for (const entry of await readdir(new URL("components/", dist), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        folders.push(entry.name);
      }
    }

    assert.deepEqual(
      schema.properties.names.items.enum,
      folders.sort((left, right) => left.localeCompare(right)),
    );
  });

  test("copies every file of a component with the prefix", async () => {
    const { runner } = createRunner();
    const tree = await runner.runSchematic("add", { names: ["button"] }, await setUp(runner));
    const files = await readdir(new URL("components/button/", dist));

    for (const file of files) {
      const source = await readFile(new URL(`components/button/${file}`, dist), "utf8");

      assert.equal(readText(tree, `src/ui/button/${file}`), source.replaceAll("fold__", "zz"));
    }

    assert.match(readText(tree, "src/ui/button/button.ts"), /selector: "button\[zzButton\]"/);
    assert.ok(tree.exists("src/ui/cn/index.ts"));
    assert.equal(tree.exists("src/ui/alert-dialog/index.ts"), false);
  });

  test("copies the components a component imports", async () => {
    const { runner } = createRunner();
    const tree = await runner.runSchematic("add", { names: ["alert-dialog"] }, await setUp(runner));

    assert.ok(tree.exists("src/ui/alert-dialog/alert-dialog-trigger.ts"));
    assert.ok(tree.exists("src/ui/button/button-style.ts"));
    assert.ok(tree.exists("src/ui/cn/cn.ts"));

    for (const path of tree.files) {
      if (path.startsWith("/src/ui/")) {
        assert.equal(readText(tree, path).includes("fold__"), false, path);
      }
    }
  });

  test("skips an existing named component by default, with a warning", async () => {
    const { runner, warnings } = createRunner();
    const tree = await runner.runSchematic("add", { names: ["button"] }, await setUp(runner));

    tree.overwrite("src/ui/button/button.ts", "// mine\n");

    const result = await runner.runSchematic("add", { names: ["button"] }, tree);

    assert.equal(readText(result, "src/ui/button/button.ts"), "// mine\n");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Kept your existing src\/ui\/button, src\/ui\/cn\./);
  });

  test("overwrites fold's files of a named component and leaves the consumer's", async () => {
    const { runner } = createRunner();
    const tree = await runner.runSchematic("add", { names: ["button"] }, await setUp(runner));
    const fresh = readText(tree, "src/ui/button/button.ts");

    tree.overwrite("src/ui/button/button.ts", "// mine\n");
    tree.create("src/ui/button/button-group.ts", "// mine too\n");

    const result = await runner.runSchematic(
      "add",
      { names: ["button"], existing: "overwrite" },
      tree,
    );

    assert.equal(readText(result, "src/ui/button/button.ts"), fresh);
    assert.equal(readText(result, "src/ui/button/button-group.ts"), "// mine too\n");
  });

  test("fails on an existing named component without writing anything", async () => {
    const { runner } = createRunner();
    const tree = await setUp(runner);

    tree.create("src/ui/alert-dialog/alert-dialog.ts", "// mine\n");

    await assert.rejects(
      runner.runSchematic("add", { names: ["alert-dialog", "button"], existing: "error" }, tree),
      { message: /^src\/ui\/alert-dialog already exist\. Re-run with --existing skip/ },
    );
    assert.equal(tree.exists("src/ui/button/index.ts"), false);
  });

  test("keeps an existing dependency even when overwriting", async () => {
    const { runner } = createRunner();
    const tree = await runner.runSchematic("add", { names: ["button"] }, await setUp(runner));

    tree.overwrite("src/ui/button/button-style.ts", "// mine\n");

    const result = await runner.runSchematic(
      "add",
      { names: ["alert-dialog"], existing: "overwrite" },
      tree,
    );

    assert.equal(readText(result, "src/ui/button/button-style.ts"), "// mine\n");
    assert.ok(result.exists("src/ui/alert-dialog/index.ts"));
  });

  test("doesn't fail on an existing dependency with --existing error", async () => {
    const { runner } = createRunner();
    const tree = await runner.runSchematic("add", { names: ["button"] }, await setUp(runner));
    const result = await runner.runSchematic(
      "add",
      { names: ["alert-dialog"], existing: "error" },
      tree,
    );

    assert.ok(result.exists("src/ui/alert-dialog/index.ts"));
  });

  test("uses fold.json's prefix and path", async () => {
    const { runner } = createRunner();
    const tree = await setUp(runner);

    tree.overwrite("fold.json", '{ "prefix": "acme", "path": "src/app/kit" }\n');

    const result = await runner.runSchematic("add", { names: ["alert-dialog"] }, tree);

    assert.match(
      readText(result, "src/app/kit/alert-dialog/alert-dialog-cancel.ts"),
      /selector: "button\[acmeAlertDialogCancel\]"/,
    );
    assert.ok(result.exists("src/app/kit/button/index.ts"));
  });
});
