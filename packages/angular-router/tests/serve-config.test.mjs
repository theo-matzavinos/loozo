// Drives serve's config-input check on real files, with the poll interval mocked, so each test
// controls when a check runs. The serve suites prove the builders run a pass when it reports.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs, {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, resolve } from "node:path";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const packageDirectory = resolve(import.meta.dirname, "..");
const moduleUrl = pathToFileURL(
  resolve(packageDirectory, "node/src/builders/serve-events.js"),
).href;
const { watchConfigInputs } = await import(moduleUrl);
const pollInterval = 500;
const scratch = resolve(
  packageDirectory,
  "../../.scratch/router-serve-config",
  String(process.pid),
);
const posix = process.platform !== "win32";

mock.timers.enable({ apis: ["setInterval"] });

// A fresh fixture directory holding `files`, a map of relative paths to JSON values or strings.
function fixture(name, files) {
  const directory = resolve(scratch, name);

  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });

  for (const [path, contents] of Object.entries(files)) {
    write(resolve(directory, path), contents);
  }

  return directory;
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });

  let text = contents;

  if (typeof contents !== "string") {
    text = `${JSON.stringify(contents, undefined, 2)}\n`;
  }

  writeFileSync(path, text);
}

// Starts the check on a fixture's tsconfig.json and package.json, counting its reports.
function watch(directory, { catalogs = [], roots = [resolve(directory, "src/routes")] } = {}) {
  const watching = { reports: 0 };

  watching.handle = watchConfigInputs({
    configFile: resolve(directory, "tsconfig.json"),
    manifest: resolve(directory, "package.json"),
    catalogs,
    roots,
    changed: () => watching.reports++,
  });

  return watching;
}

// Runs one check.
function poll() {
  mock.timers.tick(pollInterval);
}

const app = {
  "package.json": { name: "app" },
  "tsconfig.json": { extends: "./tsconfig.base.json", include: ["src"] },
  "tsconfig.base.json": { extends: "./tsconfig.root.json", compilerOptions: { strict: true } },
  "tsconfig.root.json": { compilerOptions: { target: "ES2022" } },
};

test("an edit of the tsconfig, a base, a nested base or the manifest is reported once at the next check", () => {
  const directory = fixture("kinds", app);
  const watching = watch(directory);

  poll();
  assert.equal(watching.reports, 0, "Nothing changed");

  for (const name of [
    "tsconfig.json",
    "tsconfig.base.json",
    "tsconfig.root.json",
    "package.json",
  ]) {
    const path = resolve(directory, name);
    const before = watching.reports;

    write(path, `${readFileSync(path, "utf8")}\n`);
    poll();
    assert.equal(watching.reports, before + 1, `An edit of ${name} is reported`);
    poll();
    assert.equal(watching.reports, before + 1, `An unchanged check after ${name} reports nothing`);
  }

  watching.handle.close();
});

test("reading the inputs reports nothing", () => {
  const directory = fixture("reads", app);
  const watching = watch(directory);

  for (let round = 0; round < 3; round++) {
    for (const name of Object.keys(app)) {
      readFileSync(resolve(directory, name));
    }

    poll();
  }

  assert.equal(watching.reports, 0);
  watching.handle.close();
});

test("a deleted and recreated input is reported each time, and edits after it still are", () => {
  const directory = fixture("recreate", app);
  const base = resolve(directory, "tsconfig.base.json");
  const watching = watch(directory);

  rmSync(base);
  poll();
  assert.equal(watching.reports, 1, "The deletion is reported");

  write(base, app["tsconfig.base.json"]);
  poll();
  assert.equal(watching.reports, 2, "The recreation is reported");

  write(base, { ...app["tsconfig.base.json"], compilerOptions: { strict: false } });
  poll();
  assert.equal(watching.reports, 3, "A later edit is reported");

  watching.handle.close();
});

// TypeScript probes `./base` before `./base.json`, so creating it changes the chain; a base named
// before it exists is created later, possibly with its directory.
test("a candidate TypeScript probed is reported when it's created, with or without its directory", () => {
  const directory = fixture("candidates", {
    "package.json": { name: "app" },
    "tsconfig.json": { extends: ["./base", "./missing/shared/base.json"] },
    "base.json": { compilerOptions: { strict: true } },
  });
  const watching = watch(directory);

  write(resolve(directory, "base"), { compilerOptions: { strict: false } });
  poll();
  assert.equal(watching.reports, 1, "The extensionless candidate is reported");

  write(resolve(directory, "missing/shared/base.json"), { compilerOptions: {} });
  poll();
  assert.equal(watching.reports, 2, "The base in a new directory is reported");

  watching.handle.close();
});

// pnpm's layout: the app sees `@configs/strict` through a link into the store, and `strict` sees its
// own dependency `@configs/shared` only beside it in the store, through another link.
test("bases resolved from packages, a package's own dependency included, are watched at the files TypeScript resolved", () => {
  const store = "node_modules/.pnpm";
  const directory = fixture("package-bases", {
    "package.json": { name: "app" },
    "tsconfig.json": { extends: "@configs/strict/tsconfig.json" },
    [`${store}/strict/node_modules/@configs/strict/package.json`]: { name: "@configs/strict" },
    [`${store}/strict/node_modules/@configs/strict/tsconfig.json`]: {
      extends: "@configs/shared/tsconfig.json",
    },
    [`${store}/shared/node_modules/@configs/shared/package.json`]: { name: "@configs/shared" },
    [`${store}/shared/node_modules/@configs/shared/tsconfig.json`]: {
      compilerOptions: { strict: true },
    },
  });

  mkdirSync(resolve(directory, "node_modules/@configs"), { recursive: true });
  symlinkSync(
    resolve(directory, `${store}/strict/node_modules/@configs/strict`),
    resolve(directory, "node_modules/@configs/strict"),
    "junction",
  );
  symlinkSync(
    resolve(directory, `${store}/shared/node_modules/@configs/shared`),
    resolve(directory, `${store}/strict/node_modules/@configs/shared`),
    "junction",
  );

  const watching = watch(directory);

  write(resolve(directory, `${store}/strict/node_modules/@configs/strict/tsconfig.json`), {
    extends: "@configs/shared/tsconfig.json",
    compilerOptions: { noUnusedLocals: true },
  });
  poll();
  assert.equal(watching.reports, 1, "The direct package base");

  write(resolve(directory, `${store}/shared/node_modules/@configs/shared/tsconfig.json`), {
    compilerOptions: { strict: false },
  });
  poll();
  assert.equal(watching.reports, 2, "The package base's own base");

  watching.handle.close();
});

test("refresh takes the current inputs: a base added to the chain is watched, a removed one isn't", () => {
  const directory = fixture("refresh", {
    ...app,
    "extra.json": { compilerOptions: { noUnusedLocals: true } },
  });
  const extra = resolve(directory, "extra.json");
  const watching = watch(directory);

  write(extra, { compilerOptions: { noUnusedLocals: false } });
  poll();
  assert.equal(watching.reports, 0, "Not an input yet");

  write(resolve(directory, "tsconfig.json"), { extends: ["./tsconfig.base.json", "./extra.json"] });
  poll();
  assert.equal(watching.reports, 1, "The tsconfig edit");
  watching.handle.refresh();

  write(extra, { compilerOptions: { noUnusedLocals: true, noUnusedParameters: true } });
  poll();
  assert.equal(watching.reports, 2, "The added base's edit");

  write(resolve(directory, "tsconfig.json"), app["tsconfig.json"]);
  poll();
  assert.equal(watching.reports, 3, "The tsconfig edit");
  watching.handle.refresh();

  write(extra, { compilerOptions: {} });
  poll();
  assert.equal(watching.reports, 3, "The removed base's edit");

  watching.handle.close();
});

// A pass refreshes before it reads, so a change it read isn't reported again after it.
test("refresh takes the current state as the baseline, so a change a pass read isn't reported again", () => {
  const directory = fixture("baseline", app);
  const watching = watch(directory);

  write(resolve(directory, "tsconfig.json"), { ...app["tsconfig.json"], include: ["src", "app"] });
  watching.handle.refresh();
  poll();
  assert.equal(watching.reports, 0);

  watching.handle.close();
});

// Refresh reads a new base, and its state is what it was before that read: a replacement right
// after it is a change.
test("an input replaced right after refresh read it is reported", () => {
  const directory = fixture("read-race", app);
  const base = resolve(directory, "tsconfig.base.json");
  const watching = watch(directory);
  const reads = mock.method(ts.sys, "readFile", (path) => {
    const bytes = readFileSync(path, "utf8");

    if (resolve(path) === base) {
      write(base, { compilerOptions: { strict: false, noImplicitAny: false } });
    }

    return bytes;
  });

  try {
    watching.handle.refresh();
  } finally {
    reads.mock.restore();
  }

  poll();
  assert.equal(watching.reports, 1);

  watching.handle.close();
});

// TypeScript probes a base, then reads it; a replacement in between is what it reads, so the
// baseline is the state just before the read and nothing is reported afterwards.
test("a base replaced between TypeScript's probe and its read is read and not reported again", () => {
  const directory = fixture("probe-to-read", {
    "package.json": { name: "app" },
    "tsconfig.json": { extends: "./base.json" },
    "base.json": { compilerOptions: { strict: true } },
  });
  const base = resolve(directory, "base.json");
  const watching = watch(directory);
  const stat = fs.statSync;
  let looks = 0;
  const stats = mock.method(fs, "statSync", (path, options) => {
    const entry = stat(path, options);

    if (resolve(String(path)) === base && looks++ === 0) {
      write(base, { compilerOptions: { strict: false, noImplicitAny: false } });
    }

    return entry;
  });

  syncBuiltinESMExports();

  try {
    watching.handle.refresh();
  } finally {
    stats.mock.restore();
    syncBuiltinESMExports();
  }

  assert.ok(looks >= 2, "Probed, then looked at again before the read");
  poll();
  assert.equal(watching.reports, 0, "The replacement the refresh read isn't reported");

  watching.handle.close();
});

test(
  "a rewrite that keeps the modification time, or a permission repair, is reported",
  { skip: !posix },
  () => {
    const directory = fixture("metadata", app);
    const manifest = resolve(directory, "package.json");
    const base = resolve(directory, "tsconfig.base.json");
    // Whole seconds, which utimes restores exactly.
    const seconds = Math.floor(Date.now() / 1000) - 60;

    utimesSync(manifest, seconds, seconds);

    const before = statSync(manifest);
    const watching = watch(directory);

    write(manifest, { name: "ppa" });
    utimesSync(manifest, seconds, seconds);

    const after = statSync(manifest);

    assert.deepEqual(
      [after.ino, after.size, after.mtimeMs],
      [before.ino, before.size, before.mtimeMs],
      "Only the change time differs",
    );
    poll();
    assert.equal(watching.reports, 1, "The same-size rewrite with its old times");

    chmodSync(base, 0o000);
    poll();
    assert.equal(watching.reports, 2, "The base made unreadable");

    chmodSync(base, 0o644);
    poll();
    assert.equal(watching.reports, 3, "The base readable again");

    watching.handle.close();
  },
);

test("retargeting a directory link on the way to a base is reported, and so are edits of the new target", () => {
  const directory = fixture("linked-directory", {
    "package.json": { name: "app" },
    "tsconfig.json": { extends: "./shared/base.json" },
    "configs/one/base.json": { compilerOptions: { strict: true } },
    "configs/two/base.json": { compilerOptions: { strict: false } },
  });
  const link = resolve(directory, "shared");

  symlinkSync(resolve(directory, "configs/one"), link, "junction");

  const watching = watch(directory);

  rmSync(link);
  symlinkSync(resolve(directory, "configs/two"), link, "junction");
  poll();
  assert.equal(watching.reports, 1, "The retarget");

  write(resolve(directory, "configs/two/base.json"), { compilerOptions: { strict: true } });
  poll();
  assert.equal(watching.reports, 2, "The new target's edit");

  watching.handle.close();
});

// `./config` isn't a file, so TypeScript takes `./config.json`; the directory at the name is one
// entry, never watched inside.
test("a directory at a candidate's name is one entry: edits inside it report nothing", () => {
  const directory = fixture("directory-candidate", {
    "package.json": { name: "app" },
    "tsconfig.json": { extends: "./config" },
    "config.json": { compilerOptions: { strict: true } },
    "config/unrelated.json": { value: 1 },
  });
  const watching = watch(directory);

  write(resolve(directory, "config/unrelated.json"), { value: 2 });
  write(resolve(directory, "config/added.json"), { value: 3 });
  poll();
  assert.equal(watching.reports, 0);

  watching.handle.close();
});

test("a link loop or an unreadable chain doesn't throw, and the tsconfig is still watched", () => {
  const directory = fixture("loop", {
    "package.json": { name: "app" },
    "tsconfig.json": { extends: "./shared/base.json" },
  });

  symlinkSync(resolve(directory, "shared"), resolve(directory, "shared"), "junction");

  const watching = watch(directory);

  write(resolve(directory, "tsconfig.json"), { compilerOptions: { strict: true } });
  poll();
  assert.equal(watching.reports, 1);

  watching.handle.close();
});

// A FIFO with no writer would block a read; generation's audit reports it instead.
test("a tsconfig that isn't a regular file is never opened", { skip: !posix }, () => {
  const directory = fixture("fifo", { "package.json": { name: "app" } });
  const configFile = resolve(directory, "tsconfig.json");

  execFileSync("mkfifo", [configFile]);

  const script = [
    `const { watchConfigInputs } = await import(${JSON.stringify(moduleUrl)});`,
    "const watching = watchConfigInputs({",
    `  configFile: ${JSON.stringify(configFile)},`,
    `  manifest: ${JSON.stringify(resolve(directory, "package.json"))},`,
    "  catalogs: [],",
    "  roots: [],",
    "  changed: () => {},",
    "});",
    "watching.close();",
  ].join("\n");

  // A blocked read would hold the child until the deadline.
  execFileSync(process.execPath, ["--input-type=module", "--eval", script], { timeout: 10_000 });
});

// TypeScript probes a base, then reads it; a FIFO swapped in between would block that read.
test(
  "a base replaced by a FIFO between TypeScript's probe and its read is never opened",
  { skip: !posix },
  () => {
    const directory = fixture("fifo-race", {
      "package.json": { name: "app" },
      "tsconfig.json": { extends: "./base.json" },
      "base.json": { compilerOptions: { strict: true } },
    });
    const base = resolve(directory, "base.json");
    const script = [
      'import fs from "node:fs";',
      'import { execFileSync } from "node:child_process";',
      'import { syncBuiltinESMExports } from "node:module";',
      "const stat = fs.statSync;",
      "let swapped = false;",
      "fs.statSync = (path, options) => {",
      "  const entry = stat(path, options);",
      `  if (!swapped && path === ${JSON.stringify(base)}) {`,
      "    swapped = true;",
      `    fs.rmSync(${JSON.stringify(base)});`,
      `    execFileSync("mkfifo", [${JSON.stringify(base)}]);`,
      "  }",
      "  return entry;",
      "};",
      "syncBuiltinESMExports();",
      `const { watchConfigInputs } = await import(${JSON.stringify(moduleUrl)});`,
      "watchConfigInputs({",
      `  configFile: ${JSON.stringify(resolve(directory, "tsconfig.json"))},`,
      `  manifest: ${JSON.stringify(resolve(directory, "package.json"))},`,
      "  catalogs: [],",
      "  roots: [],",
      "  changed: () => {},",
      "}).close();",
      "if (!swapped) throw new Error('The base was never probed');",
    ].join("\n");

    // A blocked read would hold the child until the deadline.
    execFileSync(process.execPath, ["--input-type=module", "--eval", script], { timeout: 10_000 });
  },
);

test("catalogs outside the scan roots are watched; inputs inside one are left to serve's watcher", () => {
  const directory = fixture("catalogs", {
    ...app,
    "locale/messages.de.xlf": "<xliff/>\n",
    "src/routes/messages.fr.xlf": "<xliff/>\n",
    "src/routes/tsconfig.json": { extends: "../../tsconfig.json" },
  });
  const outside = resolve(directory, "locale/messages.de.xlf");
  const inside = resolve(directory, "src/routes/messages.fr.xlf");
  const watching = watch(directory, { catalogs: [outside, inside] });

  write(inside, "<xliff version='2.0'/>\n");
  poll();
  assert.equal(watching.reports, 0, "The catalog inside the scan root");

  rmSync(outside);
  poll();
  write(outside, "<xliff version='2.0'/>\n");
  poll();
  assert.equal(watching.reports, 2, "The deleted and recreated catalog");

  watching.handle.close();

  const config = watch(resolve(directory, "src/routes"), {
    roots: [resolve(directory, "src/routes")],
  });

  write(resolve(directory, "src/routes/tsconfig.json"), { extends: "../../tsconfig.base.json" });
  poll();
  assert.equal(config.reports, 0, "A tsconfig inside the scan root");

  config.handle.close();
});

// Serve's watcher doesn't follow links, so it never sees an edit behind one inside the scan root.
test("an input inside a scan root but behind a link is watched here", () => {
  const directory = fixture("linked-in-root", {
    ...app,
    "locale/messages.de.xlf": "<xliff/>\n",
    "src/routes/page.ts": "export {};\n",
  });

  symlinkSync(resolve(directory, "locale"), resolve(directory, "src/routes/i18n"), "junction");

  const watching = watch(directory, {
    catalogs: [resolve(directory, "src/routes/i18n/messages.de.xlf")],
  });

  write(resolve(directory, "locale/messages.de.xlf"), "<xliff version='2.0'/>\n");
  poll();
  assert.equal(watching.reports, 1);

  watching.handle.close();
});

test("close stops the check and releases its timer", () => {
  const directory = fixture("close", app);
  const watching = watch(directory);

  watching.handle.close();
  write(resolve(directory, "tsconfig.json"), { compilerOptions: { strict: true } });
  poll();
  assert.equal(watching.reports, 0);

  // A timer still running would keep this process alive until the deadline.
  const script = [
    `const { watchConfigInputs } = await import(${JSON.stringify(moduleUrl)});`,
    "watchConfigInputs({",
    `  configFile: ${JSON.stringify(resolve(directory, "tsconfig.json"))},`,
    `  manifest: ${JSON.stringify(resolve(directory, "package.json"))},`,
    "  catalogs: [],",
    "  roots: [],",
    "  changed: () => {},",
    "}).close();",
  ].join("\n");

  execFileSync(process.execPath, ["--input-type=module", "--eval", script], { timeout: 10_000 });
});
