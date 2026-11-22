// Bumps packages/<package> to its next patch (default), minor or major version. The
// operator picks the level; the script refuses one below what the changes since the
// last release need, before it writes anything, and never raises it on its own:
// - 0.0.x: any level.
// - 0.x from 0.1.0 on: breaking changes (`!` commit subjects) need a minor.
// - From 1.0.0 on: breaking changes need a major and features (`feat`) a minor.
// Launch also pins the router's current version as its exact peer dependency and in
// its README install command. While Launch is 0.x, moving that pin across a router
// minor or major needs a Launch minor. Origami also moves the version fold's ng-add
// installs to the new release.
//
// Run it from the repository root: its paths and release-notes.mjs's git commands
// resolve against the working directory.
//
// Usage: node scripts/bump-version.mjs <package> [patch|minor|major]
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { changesSinceRelease } from "./release-notes.mjs";

const levels = ["patch", "minor", "major"];
const [name, bump = "patch"] = process.argv.slice(2);

if (!levels.includes(bump)) {
  throw new Error(`Can't bump ${name}: unknown bump ${bump}, expected patch, minor or major`);
}

function manifestPath(packageName) {
  return join("packages", packageName, "package.json");
}

async function readManifest(packageName) {
  return JSON.parse(await readFile(manifestPath(packageName), "utf8"));
}

function parseVersion(label, version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (!match) {
    throw new Error(`Can't bump ${name}: ${label} ${version} isn't plain major.minor.patch`);
  }

  const [, major, minor, patch] = match;

  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

const manifest = await readManifest(name);
const current = parseVersion("version", manifest.version);

function requireAtLeast(level, reason, subjects) {
  if (levels.indexOf(bump) >= levels.indexOf(level)) {
    return;
  }

  let message = `Can't release ${name} ${manifest.version} as a ${bump}: ${reason}, so release a ${level}`;

  if (subjects.length > 0) {
    message += `:\n${subjects.join("\n")}`;
  }

  throw new Error(message);
}

const { since, breaking, features } = changesSinceRelease(name);

if (current.major > 0) {
  if (breaking.length > 0) {
    requireAtLeast("major", `these changes since ${since} are breaking`, breaking);
  }

  if (features.length > 0) {
    requireAtLeast("minor", `these changes since ${since} are features`, features);
  }
} else if (current.minor > 0 && breaking.length > 0) {
  requireAtLeast("minor", `these changes since ${since} are breaking`, breaking);
}

let router;

if (name === "angular-launch") {
  router = await readManifest("angular-router");

  const pin = manifest.peerDependencies["@loozo/angular-router"];
  const pinned = parseVersion("router pin", pin);
  const next = parseVersion("router version", router.version);
  const crossesMinor = next.major !== pinned.major || next.minor !== pinned.minor;

  // How a stable (1.x) Launch moves its pin is undecided (Launch B8), so no rule applies there yet.
  if (current.major === 0 && crossesMinor) {
    requireAtLeast(
      "minor",
      `its @loozo/angular-router pin moves from ${pin} to ${router.version}`,
      [],
    );
  }
}

if (bump === "major") {
  manifest.version = `${current.major + 1}.0.0`;
} else if (bump === "minor") {
  manifest.version = `${current.major}.${current.minor + 1}.0`;
} else {
  manifest.version = `${current.major}.${current.minor}.${current.patch + 1}`;
}

if (name === "angular-launch") {
  const readmePath = join("packages", "angular-launch", "README.md");
  const readme = await readFile(readmePath, "utf8");
  const install = /@loozo\/angular-router@\d+\.\d+\.\d+/g;

  if (!install.test(readme)) {
    throw new Error(
      "Can't find the @loozo/angular-router@<version> install command in Launch's README",
    );
  }

  manifest.peerDependencies["@loozo/angular-router"] = router.version;
  await writeFile(readmePath, readme.replace(install, `@loozo/angular-router@${router.version}`));
}

if (name === "origami-ui") {
  const ngAddPath = join("packages", "fold-ui", "schematics", "ng-add", "index.ts");
  const ngAdd = await readFile(ngAddPath, "utf8");
  const pin = /("@loozo\/origami-ui": )"\d+\.\d+\.\d+"/;

  if (!pin.test(ngAdd)) {
    throw new Error("Can't find the @loozo/origami-ui version in fold's ng-add");
  }

  await writeFile(ngAddPath, ngAdd.replace(pin, `$1"${manifest.version}"`));
}

await writeFile(manifestPath(name), `${JSON.stringify(manifest, null, 2)}\n`);
