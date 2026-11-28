// A generation run that holds its output's lock for a test: once it has validated, it writes the
// ready file and blocks until the release file exists (or it's killed), then skips publication.
// Usage: node generation-lock-holder.mjs <workspace> <ready file> <release file>
import { existsSync, writeFileSync } from "node:fs";
import { runGeneration } from "../../dist/generation/run.js";

const [workspace, ready, release] = process.argv.slice(2);
const options = {
  tsconfig: "tsconfig.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
};
const word = new Int32Array(new SharedArrayBuffer(4));

await runGeneration(
  workspace,
  options,
  () => {
    writeFileSync(ready, String(process.pid));

    const deadline = Date.now() + 60_000;

    while (!existsSync(release)) {
      if (Date.now() > deadline) {
        throw new Error("The test never released the holder");
      }

      Atomics.wait(word, 0, 0, 10);
    }

    return true;
  },
  "lock test holder",
);
