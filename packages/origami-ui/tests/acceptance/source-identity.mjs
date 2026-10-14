import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

export async function sourceIdentity() {
  const files = {};

  // Generated, installed and evidence trees are not sources.
  const skipped = [
    "node_modules",
    "dist",
    ".angular",
    ".runtime",
    ".scratch",
    ".acceptance-evidence",
  ];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (skipped.includes(entry.name)) {
        continue;
      }

      const filename = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(filename);
      }

      if (entry.isFile()) {
        files[filename] = createHash("sha256")
          .update(await readFile(filename))
          .digest("hex");
      }
    }
  }

  // The package (library, contracts, harness), the authored example and its staged scratch copy.
  for (const directory of [".", "../../examples/origami-ui", ".scratch/consumer"]) {
    await walk(directory);
  }

  for (const filename of [
    "../../package.json",
    "../../pnpm-lock.yaml",
    "../../pnpm-workspace.yaml",
    "../../vite.config.ts",
    "../../scripts/finish-package.mjs",
  ]) {
    files[filename] = createHash("sha256")
      .update(await readFile(filename))
      .digest("hex");
  }

  const require = createRequire(import.meta.url);
  const versions = {};

  for (const name of [
    "@angular/core",
    "@angular/common",
    "@angular/compiler",
    "@angular/platform-browser",
    "@angular/platform-server",
    "@angular/router",
    "@angular/ssr",
    "@angular/build",
    "@angular/cli",
    "@angular/compiler-cli",
    "typescript",
    "ng-packagr",
    "playwright",
    "@floating-ui/dom",
    "rxjs",
    "tslib",
  ]) {
    const manifest = JSON.parse(await readFile(require.resolve(`${name}/package.json`), "utf8"));

    assert.equal(typeof manifest.version, "string");
    versions[name] = manifest.version;
  }

  const floatingRequire = createRequire(require.resolve("@floating-ui/dom"));

  for (const name of ["@floating-ui/core", "@floating-ui/utils"]) {
    const manifest = JSON.parse(
      await readFile(floatingRequire.resolve(`${name}/package.json`), "utf8"),
    );

    versions[name] = manifest.version;
  }

  let webkitDependencies = null;
  const runtime = process.env.ORIGAMI_WEBKIT_DEPS_ROOT;

  if (runtime) {
    const metadata = path.join(path.resolve(runtime), "metadata");
    const receipt = await readFile(path.join(metadata, "setup-receipt.json"), "utf8");
    const inventory = await readFile(path.join(metadata, "extracted-files.sha256"), "utf8");
    const symlinks = await readFile(path.join(metadata, "extracted-symlinks.txt"), "utf8");

    webkitDependencies = {
      runtime: path.resolve(runtime),
      receipt: JSON.parse(receipt),
      inventorySha256: createHash("sha256").update(inventory).digest("hex"),
      symlinksSha256: createHash("sha256").update(symlinks).digest("hex"),
    };
  }

  return {
    matrixTarget: process.env.ORIGAMI_MATRIX_TARGET ?? null,
    buildMaxWorkers: process.env.NG_BUILD_MAX_WORKERS ?? null,
    webkitDependencies,
    base: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    files,
    versions,
    node: process.version,
    nodeExecutable: process.execPath,
    pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
    browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
  };
}

/** Optional forensic hook (`ORIGAMI_FORENSIC=1`): whole-source/dependency fingerprint of a dirty run. */
export default async function setup() {
  const directory = process.env.ORIGAMI_EVIDENCE_DIR;

  assert.ok(directory, "The Playwright configuration selects the evidence directory");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "source-identity.json"),
    JSON.stringify(await sourceIdentity(), null, 2),
  );
}
