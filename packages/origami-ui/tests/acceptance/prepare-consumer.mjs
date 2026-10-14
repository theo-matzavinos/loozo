import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { installConsumer, stageConsumer, syncConsumerPackage } from "./consumer-install.mjs";

// Default: warm refresh of the installed APF only. `--clean`: strict clean installation.
const options = process.argv.slice(2);

for (const option of options) {
  assert.equal(option, "--clean", `Unknown option: ${option}`);
}

const clean = options.includes("--clean");

await mkdir(".acceptance-evidence/packages", { recursive: true });

const npmEnvironment = {
  ...process.env,
  npm_config_cache: path.resolve(".scratch/consumer/.runtime/npm-cache"),
};

const packed = spawnSync(
  "npm",
  [
    "pack",
    "./dist",
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    ".acceptance-evidence/packages",
  ],
  { encoding: "utf8", env: npmEnvironment },
);

assert.equal(packed.status, 0, packed.stderr);

const receipt = JSON.parse(packed.stdout);

assert.equal(receipt.length, 1);

const tarball = path.resolve(".acceptance-evidence/packages", receipt[0].filename);

await stageConsumer(tarball);

if (clean) {
  await installConsumer(tarball);
} else {
  await syncConsumerPackage(tarball);
}

// The consumer resolves exactly the bytes just built: every installed file, every export target.
const require = createRequire(path.resolve(".scratch/consumer/package.json"));
const installedDirectory = path.dirname(require.resolve("@loozo/origami-ui/package.json"));
const built = path.resolve("dist");
const installedFiles = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await collect(filename);
    }

    if (entry.isFile()) {
      installedFiles.push(path.relative(installedDirectory, filename));
    }
  }
}

await collect(installedDirectory);

for (const file of installedFiles) {
  const installed = await readFile(path.join(installedDirectory, file));
  const current = await readFile(path.join(built, file));

  assert.ok(
    installed.equals(current),
    `Installed APF file differs from the current build: ${file}`,
  );
}

const manifest = JSON.parse(await readFile(path.join(built, "package.json"), "utf8"));

for (const conditions of Object.values(manifest.exports)) {
  for (const target of Object.values(conditions)) {
    assert.ok(
      installedFiles.includes(path.normalize(target)),
      `Installed APF lacks export target ${target}`,
    );
  }
}

let mode = "Refreshed the installed APF from";

if (clean) {
  mode = "Clean strict installation from";
}

console.log(`${mode} real tarball ${tarball} in the consumer; no library source aliases.`);
