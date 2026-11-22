// Runs the real release-notes.mjs against throwaway git repositories, one per test, so it
// never reads this checkout's history.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("release-notes.mjs", import.meta.url));

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
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);

  return result.stdout;
}

// A repository with one commit per subject touching packages/demo, tagged
// demo@0.0.1 after the first `tagAfter` subjects when given.
async function fixture(t, subjects, tagAfter) {
  const root = await mkdtemp(join(tmpdir(), "release-notes-"));

  t.after(() => rm(root, { recursive: true, force: true }));
  run(root, "git", ["init", "--quiet", "--initial-branch=main"]);
  await mkdir(join(root, "packages", "demo"), { recursive: true });

  for (const [index, subject] of subjects.entries()) {
    await writeFile(join(root, "packages", "demo", `change-${index}.txt`), subject);
    run(root, "git", ["add", "."]);
    run(root, "git", ["commit", "--quiet", "-m", subject]);

    if (index + 1 === tagAfter) {
      run(root, "git", ["tag", "demo@0.0.1"]);
    }
  }

  return root;
}

const subjects = [
  "feat(demo): add a button",
  "build(demo)!: require core 2",
  "feat(demo)!: rename the button's input",
  "fix(demo): keep focus on press",
  "docs: describe the button",
  "an unconventional subject",
];

test("a first release lists only its features, breaking ones included", async (t) => {
  const root = await fixture(t, subjects);

  assert.equal(
    run(root, process.execPath, [script, "demo"]),
    [
      "## Features",
      "",
      "- rename the button's input",
      "- add a button",
      "",
      "First release.",
      "",
    ].join("\n"),
  );
});

test("a later release groups every change since its last tag", async (t) => {
  const root = await fixture(t, subjects, 1);

  assert.equal(
    run(root, process.execPath, [script, "demo"]),
    [
      "## Breaking changes",
      "",
      "- rename the button's input",
      "- require core 2",
      "",
      "## Fixes",
      "",
      "- keep focus on press",
      "",
      "## Other changes",
      "",
      "- an unconventional subject",
      "- docs: describe the button",
      "",
      "Changes since demo@0.0.1.",
      "",
    ].join("\n"),
  );
});
