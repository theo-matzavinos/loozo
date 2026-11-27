import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { auditBundleContexts } from "./bundle-context-audit.mjs";

/**
 * P1 application/APF identity over the four AOT outputs `acceptance:aot` builds. `--audit` adds the
 * reviewed SDK byte pins, the exact engine-manifest shape and exhaustive output classification.
 * `--output <name>` checks one of them: a Release gate production shard audits the build it serves.
 */
const outputs = [
  "consumer-eager-development",
  "consumer-incremental-development",
  "consumer-eager",
  "consumer-incremental",
];
const options = process.argv.slice(2);
let audit = false;
let selected = outputs;

for (let index = 0; index < options.length; index++) {
  const option = options[index];

  if (option === "--audit") {
    audit = true;

    continue;
  }

  assert.equal(option, "--output", `Unknown option: ${option}`);

  const output = options[++index];

  assert.ok(outputs.includes(output), `--output must name one of ${outputs.join(", ")}`);
  selected = [output];
}

const results = [];

// Angular 22.2 writes the browser and server esbuild metafiles separately; both are required.
for (const output of selected) {
  const directory = path.join(".scratch/consumer/dist", output);
  const metafiles = {
    browser: path.join(directory, "browser-stats.json"),
    server: path.join(directory, "server-stats.json"),
  };

  results.push(await auditBundleContexts(metafiles, path.resolve(".scratch/consumer"), { audit }));
}

await mkdir(".acceptance-evidence", { recursive: true });
await writeFile(".acceptance-evidence/runtime-core-bundles.json", JSON.stringify(results, null, 2));
console.log(
  "P1: complete browser/application/host graphs share the consumer's actual Core/APF origins with no duplicated application tokens.",
);
