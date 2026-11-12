// Bumps packages/<package> to its next patch (default) or minor version. From 0.1.0
// on, a patch refuses breaking changes (`!` commit subjects): they go in a minor.
// Launch also pins the router's current version as its exact peer dependency and
// in its README install command. Origami also moves the version fold's ng-add
// installs to the new release.
//
// Usage: node scripts/bump-version.mjs <package> [patch|minor]
import { readFile, writeFile } from "node:fs/promises";
import { changesSinceRelease } from "./release-notes.mjs";

const [name, bump = "patch"] = process.argv.slice(2);

if (bump !== "patch" && bump !== "minor") {
  throw new Error(`Can't bump ${name}: unknown bump ${bump}, expected patch or minor`);
}

function manifestUrl(packageName) {
  return new URL(`../packages/${packageName}/package.json`, import.meta.url);
}

async function readManifest(packageName) {
  return JSON.parse(await readFile(manifestUrl(packageName), "utf8"));
}

const manifest = await readManifest(name);
const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version);

if (!version) {
  throw new Error(`Can't bump ${name}: version ${manifest.version} isn't plain major.minor.patch`);
}

const [, major, minor, patch] = version;
const pastZeroZero = major !== "0" || minor !== "0";

if (bump === "minor") {
  manifest.version = `${major}.${Number(minor) + 1}.0`;
} else {
  const { since, breaking } = changesSinceRelease(name);

  if (pastZeroZero && breaking.length > 0) {
    throw new Error(
      `Can't release ${name} ${manifest.version} as a patch: these changes since ${since} are breaking, so release a minor:\n${breaking.join("\n")}`,
    );
  }

  manifest.version = `${major}.${minor}.${Number(patch) + 1}`;
}

if (name === "angular-launch") {
  const router = await readManifest("angular-router");
  const readmeUrl = new URL("../packages/angular-launch/README.md", import.meta.url);
  const readme = await readFile(readmeUrl, "utf8");
  const install = /@loozo\/angular-router@\d+\.\d+\.\d+/g;

  if (!install.test(readme)) {
    throw new Error(
      "Can't find the @loozo/angular-router@<version> install command in Launch's README",
    );
  }

  manifest.peerDependencies["@loozo/angular-router"] = router.version;
  await writeFile(readmeUrl, readme.replace(install, `@loozo/angular-router@${router.version}`));
}

if (name === "origami-ui") {
  const ngAddUrl = new URL("../packages/fold-ui/schematics/ng-add/index.ts", import.meta.url);
  const ngAdd = await readFile(ngAddUrl, "utf8");
  const pin = /("@loozo\/origami-ui": )"\d+\.\d+\.\d+"/;

  if (!pin.test(ngAdd)) {
    throw new Error("Can't find the @loozo/origami-ui version in fold's ng-add");
  }

  await writeFile(ngAddUrl, ngAdd.replace(pin, `$1"${manifest.version}"`));
}

await writeFile(manifestUrl(name), `${JSON.stringify(manifest, null, 2)}\n`);
