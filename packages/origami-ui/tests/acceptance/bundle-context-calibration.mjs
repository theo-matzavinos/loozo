import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  consumerOrigins,
  loadRuntimeGraph,
  reachableModules,
  inspectContext,
} from "./bundle-context-audit.mjs";

// Genuine installed esbuild, real pinned Core/APF package code. Never used as product evidence.
const tool = createRequire(import.meta.resolve("@angular/build/package.json"));
const { build } = tool("esbuild");
const origins = await consumerOrigins();

await mkdir(".scratch/consumer/.runtime", { recursive: true });

const attempt = await mkdtemp(
  path.resolve(".scratch/consumer/.runtime/bundle-context-calibration-"),
);
const results = [];

async function fixture(name, sources, entries, options = {}) {
  const base = path.join(attempt, name);
  const server = path.join(base, "server");

  await mkdir(server, { recursive: true });

  for (const [file, text] of Object.entries(sources)) {
    await writeFile(path.join(server, file), text);
  }

  const built = await build({
    absWorkingDir: server,
    entryPoints: entries,
    outdir: ".",
    outExtension: { ".js": ".mjs" },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    metafile: true,
    write: true,
    splitting: false,
    ...options,
  });
  const stats = path.join(base, "server-stats.json");

  await writeFile(stats, JSON.stringify(built.metafile, null, 2));

  return { base, server, stats, built, graph: await loadRuntimeGraph({ server: stats }, server) };
}

const one = await fixture(
  "one-core",
  {
    "entry.js": 'import { signal } from "@angular/core"; export const value = signal(1);',
  },
  ["entry.js"],
);

await one.graph.load(path.join(one.server, "entry.mjs"));

const single = inspectContext(
  one.graph,
  reachableModules(one.graph, path.join(one.server, "entry.mjs")),
  origins,
);

assert.ok(Object.keys(single.core).length > 0);
results.push({ case: "genuine-single-consumer-core", status: "passed", context: single });

const lazy = await fixture(
  "host-lazy-apf",
  {
    "host.js": 'export const loadPublic = () => import("@loozo/origami-ui/popover");',
  },
  ["host.js"],
  { splitting: true },
);

await lazy.graph.load(path.join(lazy.server, "host.mjs"));

const hostFiles = reachableModules(lazy.graph, path.join(lazy.server, "host.mjs"));

assert.ok(hostFiles.size > 1, "No genuine lazy edge was emitted");
assert.throws(
  () => inspectContext(lazy.graph, hostFiles, origins, { host: true }),
  /Host APF outside verified boundary/,
);
results.push({
  case: "genuine-host-lazy-public-apf-rejected",
  status: "passed",
  modules: [...hostFiles],
});

async function duplicate(name, source, expected, publicClasses = []) {
  const pair = await fixture(name, { "a.js": source, "b.js": source }, ["a.js", "b.js"]);

  // A real third build supplies the actual program importing both independently bundled modules.
  await writeFile(
    path.join(pair.server, "parent.js"),
    'export const first = () => import("./a.mjs"); export const second = () => import("./b.mjs");',
  );

  const parent = await build({
    absWorkingDir: pair.server,
    entryPoints: ["parent.js"],
    outdir: ".",
    outExtension: { ".js": ".mjs" },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    external: ["./a.mjs", "./b.mjs"],
    metafile: true,
    write: true,
  });
  const actual = {
    inputs: { ...pair.built.metafile.inputs, ...parent.metafile.inputs },
    outputs: { ...pair.built.metafile.outputs, ...parent.metafile.outputs },
  };

  await writeFile(pair.stats, JSON.stringify(actual, null, 2));

  const graph = await loadRuntimeGraph({ server: pair.stats }, pair.server);

  await graph.load(path.join(pair.server, "parent.mjs"));
  assert.throws(
    () =>
      inspectContext(
        graph,
        reachableModules(graph, path.join(pair.server, "parent.mjs")),
        origins,
        { publicClasses },
      ),
    expected,
  );
  results.push({ case: name, status: "passed", actualMetafile: pair.stats, nativeBuilds: 2 });
}

await duplicate(
  "genuine-duplicate-core-in-app-rejected",
  'import { signal } from "@angular/core"; export const value = signal(1);',
  /Repeated core input\/bytes within context/,
);
await duplicate(
  "genuine-duplicate-public-state-token-rejected",
  'export { OrigamiPopoverState } from "@loozo/origami-ui/popover";',
  /Duplicated application token: OrigamiPopoverState/,
  ["OrigamiPopoverState"],
);

// Native nonliteral import expressions must fail even without metadata supplying an edge.
const unknown = await fixture(
  "unknown-import",
  {
    "entry.js": "export const load = (name) => import(name);",
  },
  ["entry.js"],
);

await assert.rejects(
  unknown.graph.load(path.join(unknown.server, "entry.mjs")),
  /Unhandled import expression/,
);
results.push({ case: "native-unhandled-import-expression-rejected", status: "passed" });

// Angular 22.2 split metafiles: one genuine browser and one genuine server build from the same
// working directory load as one distribution graph with both platforms' Core evidence. A platform's
// metafile that lists another platform's outputs is rejected instead of being silently re-homed.
const split = path.join(attempt, "split-platforms");
const coreEntry = 'import { signal } from "@angular/core"; export const value = signal(1);';

await mkdir(split, { recursive: true });
await writeFile(path.join(split, "browser-entry.ts"), coreEntry);
await writeFile(path.join(split, "server-entry.js"), coreEntry);

const platformBuilds = {
  browser: await build({
    absWorkingDir: split,
    entryPoints: ["browser-entry.ts"],
    outdir: ".",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    metafile: true,
    write: false,
  }),
  server: await build({
    absWorkingDir: split,
    entryPoints: ["server-entry.js"],
    outdir: ".",
    outExtension: { ".js": ".mjs" },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    metafile: true,
    write: false,
  }),
};
const splitMetafiles = {};

// Like the Angular builder: one working directory, each platform written to its own directory.
for (const [platform, built] of Object.entries(platformBuilds)) {
  await mkdir(path.join(split, platform), { recursive: true });

  for (const file of built.outputFiles) {
    await writeFile(path.join(split, platform, path.basename(file.path)), file.contents);
  }

  splitMetafiles[platform] = path.join(split, `${platform}-stats.json`);
  await writeFile(splitMetafiles[platform], JSON.stringify(built.metafile, null, 2));
}

const splitGraph = await loadRuntimeGraph(splitMetafiles, split);
const splitContexts = {};

for (const [platform, entry] of [
  ["browser", path.join(split, "browser", "browser-entry.js")],
  ["server", path.join(split, "server", "server-entry.mjs")],
]) {
  await splitGraph.load(entry);
  splitContexts[platform] = inspectContext(
    splitGraph,
    reachableModules(splitGraph, entry),
    origins,
  );
  assert.ok(Object.keys(splitContexts[platform].core).length > 0);
}

results.push({ case: "genuine-split-platform-metafiles", status: "passed", splitContexts });

const misfiled = path.join(split, "misfiled-browser-stats.json");

await writeFile(misfiled, JSON.stringify(platformBuilds.server.metafile, null, 2));
await assert.rejects(
  loadRuntimeGraph({ browser: misfiled, server: splitMetafiles.server }, split),
  /Runtime output in the browser metafile/,
);
results.push({ case: "genuine-server-outputs-in-browser-metafile-rejected", status: "passed" });

await mkdir(".acceptance-evidence", { recursive: true });
await writeFile(
  ".acceptance-evidence/bundle-context-calibration.json",
  JSON.stringify({ attempt, qualification: false, results }, null, 2),
);
console.log(
  `Context graph calibration: ${results.length} genuine native pass/rejection controls, no product qualification.`,
);
