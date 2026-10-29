// End to end, the way a consumer meets fold: a fresh `ng new --style=tailwind --ssr` app installs
// the packed fold and Origami, runs `ng add` and `add` for every component with the prefix `zz`,
// builds for production with prerendering and passes a Chromium smoke (consumer-smoke.mjs).
//
// Browser and AOT build steps take Origami's machine-wide gate lock. Needs network access for the
// app's npm install.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const packageDirectory = resolve(import.meta.dirname, "..");
const repository = resolve(packageDirectory, "../..");
const scratch = join(packageDirectory, ".scratch");
const app = join(scratch, "consumer");
const gateLock = join(repository, "packages/origami-ui/tests/acceptance/gate-lock.sh");
const angularVersion = "22.2.2";
const environment = { ...process.env, NG_CLI_ANALYTICS: "false", CI: "1" };

function run(command, args, cwd) {
  console.log(`\n$ ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, { cwd, env: environment, stdio: "inherit" });

  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed`);
}

function ng(args) {
  run("node", [join(app, "node_modules/@angular/cli/bin/ng.js"), ...args], app);
}

function pack(directory) {
  const result = spawnSync(
    "npm",
    [
      "pack",
      directory,
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      join(scratch, "packages"),
    ],
    { cwd: scratch, encoding: "utf8", env: environment },
  );

  assert.equal(result.status, 0, result.stderr);

  const [receipt] = JSON.parse(result.stdout);

  return join(scratch, "packages", receipt.filename);
}

async function filesUnder(directory) {
  const files = [];

  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      files.push(join(entry.parentPath, entry.name));
    }
  }

  return files;
}

await rm(scratch, { recursive: true, force: true });
await mkdir(join(scratch, "packages"), { recursive: true });

run("pnpm", ["--filter", "@loozo/origami-ui", "run", "build"], repository);
run("pnpm", ["run", "build"], packageDirectory);

const origamiTarball = pack(join(repository, "packages/origami-ui/dist"));
const foldTarball = pack(join(packageDirectory, "dist"));

run(
  "node",
  [
    join(packageDirectory, "node_modules/@angular/cli/bin/ng.js"),
    "new",
    "consumer",
    "--style=tailwind",
    "--ssr",
    "--skip-git",
    "--skip-install",
    "--defaults",
    "--ai-config=none",
    "--package-manager=npm",
  ],
  scratch,
);

// Pin Angular to the version fold is tested with, and install the packed fold and Origami.
// `ng add` keeps the existing Origami dependency, so the app runs this checkout's Origami.
const manifestPath = join(app, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

for (const dependencies of [manifest.dependencies, manifest.devDependencies]) {
  for (const name of Object.keys(dependencies)) {
    if (name.startsWith("@angular/")) {
      dependencies[name] = angularVersion;
    }
  }
}

manifest.dependencies["@loozo/origami-ui"] = `file:${origamiTarball}`;
manifest.devDependencies["@loozo/fold-ui"] = `file:${foldTarball}`;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

run("npm", ["install", "--no-audit", "--no-fund"], app);
ng(["add", "@loozo/fold-ui", "--skip-confirmation", "--prefix", "zz"]);
ng([
  "generate",
  "@loozo/fold-ui:add",
  "--names",
  "button",
  "alert-dialog",
  "dialog",
  "field",
  "input",
  "sheet",
  "textarea",
]);

const installed = JSON.parse(await readFile(manifestPath, "utf8"));
const folders = await readdir(join(app, "src/ui"));

assert.deepEqual(installed.imports, { "#ui/*": "./src/ui/*/index.ts" });
assert.deepEqual(folders.sort(), [
  "alert-dialog",
  "button",
  "cn",
  "dialog",
  "field",
  "input",
  "sheet",
  "textarea",
  "theme.css",
]);
// The CLI runs the app's Prettier on written files, so quotes follow the app's style.
assert.match(
  await readFile(join(app, "src/styles.css"), "utf8"),
  /@import ["']\.\/ui\/theme\.css["'];/,
);

for (const file of await filesUnder(join(app, "src"))) {
  const content = await readFile(file, "utf8");

  assert.equal(content.includes("fold__"), false, `${file} still contains fold__`);
}

for (const file of ["app.html", "app.css", "app.spec.ts"]) {
  await rm(join(app, "src/app", file));
}

await copyFile(join(packageDirectory, "tests/consumer-app.ts"), join(app, "src/app/app.ts"));

run(
  "sh",
  [
    gateLock,
    "node",
    join(app, "node_modules/@angular/cli/bin/ng.js"),
    "build",
    "--configuration",
    "production",
  ],
  app,
);
run("sh", [gateLock, "node", join(packageDirectory, "tests/consumer-smoke.mjs"), app], app);

console.log("\nfold consumer check passed.");
