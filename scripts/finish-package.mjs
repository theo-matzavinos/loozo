// Last step of every package build: make <package>/dist a complete,
// self-contained npm package. Packing and publishing always happen from dist/.
//
// Usage: node scripts/finish-package.mjs <package directory>

import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderPublishedReadme } from "../tools/docs-content/src/readme.ts";

const packageArgument = process.argv[2];

if (!packageArgument) {
  throw new Error("Usage: node scripts/finish-package.mjs <package directory>");
}

const packageDirectory = resolve(packageArgument);
const distDirectory = join(packageDirectory, "dist");

function stripDistPrefix(exportsValue) {
  if (typeof exportsValue === "string") {
    if (exportsValue.startsWith("./dist/")) {
      return `./${exportsValue.slice("./dist/".length)}`;
    }

    return exportsValue;
  }

  const stripped = {};

  for (const [key, value] of Object.entries(exportsValue)) {
    stripped[key] = stripDistPrefix(value);
  }

  return stripped;
}

// ng-packagr writes its own dist/package.json; plain tsc builds don't.
async function writeManifest() {
  const distManifestPath = join(distDirectory, "package.json");

  if (existsSync(distManifestPath)) {
    return;
  }

  const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));

  delete manifest.scripts;
  delete manifest.devDependencies;
  delete manifest.files;
  manifest.exports = stripDistPrefix(manifest.exports);
  await writeFile(distManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function copyLicense() {
  await copyFile(join(packageDirectory, "LICENSE"), join(distDirectory, "LICENSE"));
}

// Snippet embeds become captioned code blocks; a README without embeds is copied unchanged.
async function writePublishedReadme() {
  await writeFile(join(distDirectory, "README.md"), renderPublishedReadme(packageDirectory));
}

await writeManifest();
await copyLicense();
await writePublishedReadme();
