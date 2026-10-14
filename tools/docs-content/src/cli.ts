#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildContent } from "./content.ts";
import { writeContent } from "./emit.ts";

const { values } = parseArgs({ options: { out: { type: "string" } } });

if (values.out === undefined) {
  console.error("usage: node tools/docs-content/src/cli.ts --out <dir>");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "../../..");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const started = performance.now();
const contents = await buildContent({ root, commit });

await writeContent(resolve(values.out), contents);

console.log(
  `docs-content: wrote ${contents.length} packages to ${values.out} ` +
    `in ${Math.round(performance.now() - started)}ms`,
);
