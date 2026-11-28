// Runs the real bump-version.mjs against throwaway git repositories, one per test, so it
// never writes to this checkout.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("bump-version.mjs", import.meta.url));

// The fixture's commits and the script's git reads ignore the machine's git config.
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.com",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.com",
};

function run(cwd, command, args) {
  return spawnSync(command, args, { cwd, env, encoding: "utf8" });
}

function git(cwd, ...args) {
  const result = run(cwd, "git", args);

  assert.equal(result.status, 0, result.stderr);

  return result.stdout;
}

async function write(root, path, content) {
  const file = join(root, path);

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function read(root, path) {
  return readFile(join(root, path), "utf8");
}

async function manifest(root, packageName) {
  return JSON.parse(await read(root, `packages/${packageName}/package.json`));
}

// A repository with the given packages released at their versions (each tagged
// <package>@<version> unless listed in `untagged`), Launch pinned to `launchPin` with
// `launchTanstack` as its @tanstack/angular-query peer range when given, then one commit
// per subject touching its package.
async function fixture(
  t,
  { versions, launchPin = "0.1.0", launchTanstack, untagged = [], commits = [] },
) {
  const root = await mkdtemp(join(tmpdir(), "bump-version-"));

  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, "init", "--quiet", "--initial-branch=main");

  for (const [packageName, version] of Object.entries(versions)) {
    const packageManifest = { name: `@loozo/${packageName}`, version };

    if (packageName === "angular-launch") {
      packageManifest.peerDependencies = { "@loozo/angular-router": launchPin };

      if (launchTanstack) {
        packageManifest.peerDependencies["@tanstack/angular-query"] = launchTanstack;
      }
    }

    await write(
      root,
      `packages/${packageName}/package.json`,
      `${JSON.stringify(packageManifest, null, 2)}\n`,
    );
  }

  await write(
    root,
    "packages/angular-launch/README.md",
    `Install it with \`npm install @loozo/angular-router@${launchPin} @loozo/angular-launch\`.\n`,
  );
  await write(
    root,
    "packages/fold-ui/schematics/ng-add/index.ts",
    'const dependencies = { "@loozo/origami-ui": "0.0.1" };\n',
  );
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "chore: fixture");

  for (const [packageName, version] of Object.entries(versions)) {
    if (!untagged.includes(packageName)) {
      git(root, "tag", `${packageName}@${version}`);
    }
  }

  for (const [index, [packageName, subject]] of commits.entries()) {
    await write(root, `packages/${packageName}/change-${index}.txt`, subject);
    git(root, "add", ".");
    git(root, "commit", "--quiet", "-m", subject);
  }

  return root;
}

// Commits new peer ranges for Launch after its release.
async function movePeers(root, peers) {
  const launch = await manifest(root, "angular-launch");

  Object.assign(launch.peerDependencies, peers);
  await write(root, "packages/angular-launch/package.json", `${JSON.stringify(launch, null, 2)}\n`);
  git(root, "commit", "--quiet", "-am", "build(angular-launch): move a peer");
}

function moveTanstack(root, range) {
  return movePeers(root, { "@tanstack/angular-query": range });
}

function bump(root, packageName, level) {
  const args = [script, packageName];

  if (level) {
    args.push(level);
  }

  return run(root, process.execPath, args);
}

async function assertBumps(root, packageName, level, version) {
  const result = bump(root, packageName, level);

  assert.equal(result.status, 0, result.stderr);
  assert.equal((await manifest(root, packageName)).version, version);
}

function assertRefuses(root, packageName, level, message) {
  const result = bump(root, packageName, level);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, message);
  assert.equal(git(root, "status", "--porcelain"), "", "a refused bump writes nothing");
}

test("a major takes the router from 0.1.0 to 1.0.0", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "0.1.0" },
    commits: [["angular-router", "feat(angular-router)!: drop the old API"]],
  });

  await assertBumps(root, "angular-router", "major", "1.0.0");
});

test("a major takes 1.2.3 to 2.0.0", async (t) => {
  const root = await fixture(t, { versions: { "angular-router": "1.2.3" } });

  await assertBumps(root, "angular-router", "major", "2.0.0");
});

test("from 1.0.0 on, breaking changes refuse a patch and a minor and accept a major", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "1.2.3" },
    commits: [
      ["angular-router", "feat(angular-router): add outlets"],
      ["angular-router", "refactor(angular-router)!: rename defineRoute"],
    ],
  });
  const refusal =
    /Can't release angular-router 1\.2\.3 as a (patch|minor): these changes since angular-router@1\.2\.3 are breaking, so release a major:\nrename defineRoute$/m;

  assertRefuses(root, "angular-router", "patch", refusal);
  assertRefuses(root, "angular-router", "minor", refusal);
  await assertBumps(root, "angular-router", "major", "2.0.0");
});

test("from 1.0.0 on, features refuse a patch and accept a minor", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "1.2.3" },
    commits: [
      ["angular-router", "fix(angular-router): keep the hash"],
      ["angular-router", "feat(angular-router): add outlets"],
    ],
  });

  assertRefuses(
    root,
    "angular-router",
    undefined,
    /Can't release angular-router 1\.2\.3 as a patch: these changes since angular-router@1\.2\.3 are features, so release a minor:\nadd outlets$/m,
  );
  await assertBumps(root, "angular-router", "minor", "1.3.0");
});

test("from 1.0.0 on, fixes allow a patch", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "1.2.3" },
    commits: [
      ["angular-router", "fix(angular-router): keep the hash"],
      ["angular-router", "docs(angular-router): explain outlets"],
    ],
  });

  await assertBumps(root, "angular-router", "patch", "1.2.4");
});

test("a 0.0.x patch accepts breaking changes and moves fold's Origami version", async (t) => {
  const root = await fixture(t, {
    versions: { "origami-ui": "0.0.1" },
    commits: [["origami-ui", "feat(origami-ui)!: rename ogButton"]],
  });

  await assertBumps(root, "origami-ui", "patch", "0.0.2");
  assert.match(
    await read(root, "packages/fold-ui/schematics/ng-add/index.ts"),
    /"@loozo\/origami-ui": "0\.0\.2"/,
  );
});

test("a 0.x patch refuses breaking changes and a minor accepts them", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "0.1.0" },
    commits: [["angular-router", "feat(angular-router)!: drop the old API"]],
  });

  assertRefuses(
    root,
    "angular-router",
    "patch",
    /Can't release angular-router 0\.1\.0 as a patch: these changes since angular-router@0\.1\.0 are breaking, so release a minor:\ndrop the old API$/m,
  );
  await assertBumps(root, "angular-router", "minor", "0.2.0");
});

test("an unknown bump is refused", async (t) => {
  const root = await fixture(t, { versions: { "angular-router": "0.1.0" } });

  assertRefuses(
    root,
    "angular-router",
    "1.0.0",
    /unknown bump 1\.0\.0, expected patch, minor or major/,
  );
});

test("a Launch patch can move its router pin by a router patch", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "0.1.1", "angular-launch": "0.1.0" },
    launchPin: "0.1.0",
  });

  await assertBumps(root, "angular-launch", "patch", "0.1.1");
  assert.equal(
    (await manifest(root, "angular-launch")).peerDependencies["@loozo/angular-router"],
    "0.1.1",
  );
  assert.match(
    await read(root, "packages/angular-launch/README.md"),
    /@loozo\/angular-router@0\.1\.1 /,
  );
});

test("a Launch patch with an unchanged pin still refuses Launch's own breaking changes", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "0.1.0", "angular-launch": "0.1.0" },
    launchPin: "0.1.0",
    commits: [["angular-launch", "feat(angular-launch)!: rename serve"]],
  });

  assertRefuses(
    root,
    "angular-launch",
    "patch",
    /are breaking, so release a minor:\nrename serve$/m,
  );
  await assertBumps(root, "angular-launch", "minor", "0.2.0");
});

test("a Launch patch refuses moving its router pin across a router minor", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "0.2.0", "angular-launch": "0.1.0" },
    launchPin: "0.1.0",
  });

  assertRefuses(
    root,
    "angular-launch",
    "patch",
    /^Error: Can't release angular-launch 0\.1\.0 as a patch: its @loozo\/angular-router pin moves from 0\.1\.0 to 0\.2\.0, so release a minor$/m,
  );
});

test("a Launch patch refuses moving its router pin to router 1.0.0, and a minor pins it", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "1.0.0", "angular-launch": "0.1.3" },
    launchPin: "0.1.0",
  });

  assertRefuses(
    root,
    "angular-launch",
    "patch",
    /its @loozo\/angular-router pin moves from 0\.1\.0 to 1\.0\.0, so release a minor$/m,
  );
  await assertBumps(root, "angular-launch", "minor", "0.2.0");
  assert.equal(
    (await manifest(root, "angular-launch")).peerDependencies["@loozo/angular-router"],
    "1.0.0",
  );
  assert.match(
    await read(root, "packages/angular-launch/README.md"),
    /@loozo\/angular-router@1\.0\.0 /,
  );
});

test("a Launch patch refuses moving its router pin across a router major", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "2.0.0", "angular-launch": "0.2.0" },
    launchPin: "1.0.0",
  });

  assertRefuses(
    root,
    "angular-launch",
    "patch",
    /its @loozo\/angular-router pin moves from 1\.0\.0 to 2\.0\.0, so release a minor$/m,
  );
  await assertBumps(root, "angular-launch", "minor", "0.3.0");
});

test("from Launch 1.0.0 on, a pin moving across a router major refuses a patch and a minor and accepts a major", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "2.0.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
  });

  assertRefuses(
    root,
    "angular-launch",
    "patch",
    /^Error: Can't release angular-launch 1\.2\.3 as a patch: its @loozo\/angular-router pin moves from 1\.4\.0 to 2\.0\.0, so release a major$/m,
  );
  assertRefuses(
    root,
    "angular-launch",
    "minor",
    /^Error: Can't release angular-launch 1\.2\.3 as a minor: its @loozo\/angular-router pin moves from 1\.4\.0 to 2\.0\.0, so release a major$/m,
  );
  await assertBumps(root, "angular-launch", "major", "2.0.0");
  assert.equal(
    (await manifest(root, "angular-launch")).peerDependencies["@loozo/angular-router"],
    "2.0.0",
  );
});

test("from Launch 1.0.0 on, a pin moving across a router minor refuses a patch and accepts a minor", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "1.5.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
  });

  assertRefuses(
    root,
    "angular-launch",
    "patch",
    /^Error: Can't release angular-launch 1\.2\.3 as a patch: its @loozo\/angular-router pin moves from 1\.4\.0 to 1\.5\.0, so release a minor$/m,
  );
  await assertBumps(root, "angular-launch", "minor", "1.3.0");
});

test("from Launch 1.0.0 on, a pin moving by a router patch allows a patch", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "1.4.1", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
  });

  await assertBumps(root, "angular-launch", "patch", "1.2.4");
  assert.equal(
    (await manifest(root, "angular-launch")).peerDependencies["@loozo/angular-router"],
    "1.4.1",
  );
});

test("the major that takes Launch to 1.0.0 moves its pin across a router major", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "2.0.0", "angular-launch": "0.3.0" },
    launchPin: "1.0.0",
    launchTanstack: "^5.0.0",
  });

  await moveTanstack(root, "^6.0.0");
  await assertBumps(root, "angular-launch", "major", "1.0.0");
  assert.equal(
    (await manifest(root, "angular-launch")).peerDependencies["@loozo/angular-router"],
    "2.0.0",
  );
});

test("from Launch 1.0.0 on, a TanStack peer range naming a new major refuses a patch and a minor and accepts a major", async (t) => {
  const moves = [
    [
      "^6.0.0",
      /as a (patch|minor): its @tanstack\/angular-query peer range moves from \^5\.0\.0 to \^6\.0\.0, so release a major$/m,
    ],
    [
      "^5.0.0 || ^6.0.0",
      /as a (patch|minor): its @tanstack\/angular-query peer range moves from \^5\.0\.0 to \^5\.0\.0 \|\| \^6\.0\.0, so release a major$/m,
    ],
  ];

  for (const [range, refusal] of moves) {
    const root = await fixture(t, {
      versions: { "angular-router": "1.4.0", "angular-launch": "1.2.3" },
      launchPin: "1.4.0",
      launchTanstack: "^5.0.0",
    });

    await moveTanstack(root, range);
    await write(root, "packages/angular-launch/later.txt", "later");
    git(root, "add", ".");
    git(root, "commit", "--quiet", "-m", "docs(angular-launch): a later change");
    assertRefuses(root, "angular-launch", "patch", refusal);
    assertRefuses(root, "angular-launch", "minor", refusal);
    await assertBumps(root, "angular-launch", "major", "2.0.0");
  }
});

test("from Launch 1.0.0 on, a TanStack peer range within its major allows a patch", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "1.4.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
    launchTanstack: "^5.0.0",
  });

  await moveTanstack(root, "~5.20.0 || 5.21.0");
  await assertBumps(root, "angular-launch", "patch", "1.2.4");
});

test("while Launch is 0.x, a TanStack peer range naming a new major leaves the level to its commits", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "0.1.0", "angular-launch": "0.2.0" },
    launchPin: "0.1.0",
    launchTanstack: "^5.0.0",
  });

  await moveTanstack(root, "^6.0.0");
  await assertBumps(root, "angular-launch", "patch", "0.2.1");
});

test("from Launch 1.0.0 on, prerelease identifiers don't hide or invent a TanStack major move", async (t) => {
  const moved = await fixture(t, {
    versions: { "angular-router": "1.4.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
    launchTanstack: "^5.0.0-rc6",
  });

  await moveTanstack(moved, "^6.0.0");
  assertRefuses(
    moved,
    "angular-launch",
    "patch",
    /peer range moves from \^5\.0\.0-rc6 to \^6\.0\.0, so release a major$/m,
  );

  const kept = await fixture(t, {
    versions: { "angular-router": "1.4.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
    launchTanstack: "^5.0.0",
  });

  await moveTanstack(kept, "^5.1.0-rc6+build.6");
  await assertBumps(kept, "angular-launch", "patch", "1.2.4");
});

test("on the 1.x line, a TanStack peer range other than ^, ~ or exact versions is refused", async (t) => {
  const unsupported = (range) =>
    new RegExp(
      `^Error: Can't bump angular-launch: its @tanstack/angular-query peer range ${range.replaceAll(/[.*+?^$|]/g, "\\$&")} isn't a \\|\\| list of \\^, ~ or exact versions$`,
      "m",
    );

  for (const range of [">=5.0.0 <7", "", "5.0.0-rc_", "^5.0.0 || 6.0.0-rc..1"]) {
    const released = await fixture(t, {
      versions: { "angular-router": "1.4.0", "angular-launch": "1.2.3" },
      launchPin: "1.4.0",
      launchTanstack: "^5.0.0",
    });

    await moveTanstack(released, range);
    assertRefuses(released, "angular-launch", "major", unsupported(range));
  }

  const first = await fixture(t, {
    versions: { "angular-router": "1.4.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
    launchTanstack: ">=5.0.0 <7",
    untagged: ["angular-launch"],
  });

  assertRefuses(first, "angular-launch", "patch", unsupported(">=5.0.0 <7"));

  const entering = await fixture(t, {
    versions: { "angular-router": "1.4.0", "angular-launch": "0.3.0" },
    launchPin: "1.4.0",
    launchTanstack: ">=5.0.0 <7",
  });

  assertRefuses(entering, "angular-launch", "major", unsupported(">=5.0.0 <7"));
});

test("while Launch is 0.x, its floors read its current pin and accept any TanStack peer range", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "2.0.0", "angular-launch": "0.2.0" },
    launchPin: "1.4.0",
    launchTanstack: "^5.0.0",
  });

  await movePeers(root, {
    "@loozo/angular-router": "2.0.0",
    "@tanstack/angular-query": ">=5.0.0 <7",
  });
  await assertBumps(root, "angular-launch", "patch", "0.2.1");
});

test("from Launch 1.0.0 on, a TanStack peer its last release didn't have, or a first release, allows a patch", async (t) => {
  const added = await fixture(t, {
    versions: { "angular-router": "1.4.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
  });

  await moveTanstack(added, "^6.0.0");
  await assertBumps(added, "angular-launch", "patch", "1.2.4");

  const first = await fixture(t, {
    versions: { "angular-router": "1.4.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
    launchTanstack: "^6.0.0",
    untagged: ["angular-launch"],
  });

  await assertBumps(first, "angular-launch", "patch", "1.2.4");
});

test("from Launch 1.0.0 on, a router pin edited since Launch's last release still sets the floor", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "2.0.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
  });

  await movePeers(root, { "@loozo/angular-router": "2.0.0" });
  assertRefuses(
    root,
    "angular-launch",
    "minor",
    /its @loozo\/angular-router pin moves from 1\.4\.0 to 2\.0\.0, so release a major$/m,
  );
});

test("a Launch refusal names the highest level its floors need", async (t) => {
  const root = await fixture(t, {
    versions: { "angular-router": "1.5.0", "angular-launch": "1.2.3" },
    launchPin: "1.4.0",
    launchTanstack: "^5.0.0",
    commits: [["angular-launch", "feat(angular-launch): add a recipe"]],
  });

  await moveTanstack(root, "^6.0.0");
  assertRefuses(
    root,
    "angular-launch",
    "patch",
    /^Error: Can't release angular-launch 1\.2\.3 as a patch: its @tanstack\/angular-query peer range moves from \^5\.0\.0 to \^6\.0\.0, so release a major$/m,
  );
  await assertBumps(root, "angular-launch", "major", "2.0.0");
});
