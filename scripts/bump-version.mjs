// Bumps packages/<package> to its next patch (default), minor or major version. The
// operator picks the level; the script refuses one below what the changes since the
// last release need, before it writes anything, and never raises it on its own:
// - 0.0.x: any level.
// - 0.x from 0.1.0 on: breaking changes (`!` commit subjects) need a minor.
// - From 1.0.0 on: breaking changes need a major and features (`feat`) a minor.
// Launch also pins the router's current version as its exact peer dependency and in
// its README install command. While Launch is 0.x, moving that pin across a router
// minor or major needs a Launch minor. From Launch 1.0.0 on, moving it across a router
// major needs a Launch major and across a router minor a Launch minor, and a
// @tanstack/angular-query peer range that names a major its range at Launch's last
// release didn't needs a Launch major; on the 1.x line, the release entering it included,
// that range must be a || list of ^, ~ or exact versions. Origami also moves the version
// fold's ng-add installs to the new release.
//
// Run it from the repository root: its paths and release-notes.mjs's git commands
// resolve against the working directory.
//
// Usage: node scripts/bump-version.mjs <package> [patch|minor|major]
import { execFileSync } from "node:child_process";
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

// The majors a peer range admits: 5 for ^5.0.0-rc.5, and 5 and 6 for ^5.0.0 || ~6.1.0. It
// reads only a || list of ^, ~ or exact versions, where the majors the range names are the
// ones it admits, and refuses anything else.
function rangeMajors(label, range) {
  return range.split("||").map((part) => {
    const match =
      /^\s*[\^~]?(\d+)\.\d+\.\d+(?:-[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?\s*$/.exec(
        part,
      );

    if (!match) {
      throw new Error(
        `Can't bump ${name}: ${label} ${range} isn't a || list of ^, ~ or exact versions`,
      );
    }

    return Number(match[1]);
  });
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
// Every level this release needs, checked highest first so the first refusal names the
// level that clears them all.
const floors = [];

if (current.major > 0) {
  if (breaking.length > 0) {
    floors.push(["major", `these changes since ${since} are breaking`, breaking]);
  }

  if (features.length > 0) {
    floors.push(["minor", `these changes since ${since} are features`, features]);
  }
} else if (current.minor > 0 && breaking.length > 0) {
  floors.push(["minor", `these changes since ${since} are breaking`, breaking]);
}

let router;

if (name === "angular-launch") {
  router = await readManifest("angular-router");

  const stable = current.major > 0;
  // From 1.0.0 on, floors compare against Launch's last release, so a pin or peer edited
  // since then still counts as a move.
  let released;

  if (stable && since) {
    released = JSON.parse(
      execFileSync("git", ["show", `${since}:packages/${name}/package.json`], { encoding: "utf8" }),
    );
  }

  const routerName = "@loozo/angular-router";
  const pin = released?.peerDependencies?.[routerName] ?? manifest.peerDependencies[routerName];
  const pinned = parseVersion("router pin", pin);
  const next = parseVersion("router version", router.version);
  const pinMove = `its ${routerName} pin moves from ${pin} to ${router.version}`;

  if (next.major !== pinned.major) {
    floors.push([stable ? "major" : "minor", pinMove, []]);
  } else if (next.minor !== pinned.minor) {
    floors.push(["minor", pinMove, []]);
  }

  const tanstack = "@tanstack/angular-query";
  const peers = manifest.peerDependencies;
  const releasedPeers = released?.peerDependencies ?? {};

  // Every release on the 1.x line, the one entering it included, has a range the next one
  // can read.
  if ((stable || bump === "major") && Object.hasOwn(peers, tanstack)) {
    const majors = rangeMajors(`its ${tanstack} peer range`, peers[tanstack]);

    if (Object.hasOwn(releasedPeers, tanstack)) {
      const releasedRange = releasedPeers[tanstack];
      const releasedMajors = rangeMajors(`its ${tanstack} peer range at ${since}`, releasedRange);

      if (majors.some((major) => !releasedMajors.includes(major))) {
        floors.push([
          "major",
          `its ${tanstack} peer range moves from ${releasedRange} to ${peers[tanstack]}`,
          [],
        ]);
      }
    }
  }
}

floors.sort(([a], [b]) => levels.indexOf(b) - levels.indexOf(a));

for (const [level, reason, subjects] of floors) {
  requireAtLeast(level, reason, subjects);
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
