// generate.mjs for the Launch workload: node bench/launch-generate.mjs <consumer>
// Times only the awaited call to Launch's internal runGeneration, the cold run its application
// builder makes, which writes the router's files with Launch's additions and server.generated.ts,
// without persistent compiler state, with the build target's generation options. Prints
// {"generateMs": n} as its last line.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readWorkspace } from "./consumer.mjs";
import { launchDirectory } from "./launch-consumer.mjs";

const consumer = process.argv[2];
const workspace = await readWorkspace(consumer);
const { tsconfig, scanDirectories, outDirectory, tanstackQuery } =
  workspace.projects.proof.architect.build.options;
const { runGeneration } = await import(
  pathToFileURL(join(launchDirectory, "dist/generation/run.js")).href
);
const started = performance.now();

await runGeneration(
  consumer,
  { tsconfig, scanDirectories, outDirectory, tanstackQuery },
  () => false,
  "Launch bench",
);

console.log(JSON.stringify({ generateMs: performance.now() - started }));
