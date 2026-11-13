// One timed first generation, in a fresh process: node bench/generate.mjs <consumer>
// Times only the awaited internal generate() call, without persistent compiler state, with the
// build target's router options. Prints {"generateMs": n} as its last line.
import { generate } from "../node/src/generation/generate.js";
import { readWorkspace } from "./consumer.mjs";

const consumer = process.argv[2];
const workspace = await readWorkspace(consumer);
const { tsconfig, scanDirectories, outDirectory } =
  workspace.projects.proof.architect.build.options;
const started = performance.now();

await generate(consumer, { tsconfig, scanDirectories, outDirectory }, () => false);

console.log(JSON.stringify({ generateMs: performance.now() - started }));
