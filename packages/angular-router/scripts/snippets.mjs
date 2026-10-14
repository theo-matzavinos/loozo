// Runs route generation over snippets/ with the router options from snippets/angular.json.
// Checks by default and fails on drift; pass --write to regenerate the committed files.
//
// Usage: node scripts/snippets.mjs [--write]

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "../node/src/generation/generate.js";

const write = process.argv.includes("--write");
const snippets = fileURLToPath(new URL("../snippets/", import.meta.url));
const workspace = JSON.parse(await readFile(join(snippets, "angular.json"), "utf8"));
const { tsconfig, scanDirectories, outDirectory } = workspace.projects.app.architect.build.options;

await generate(snippets, { tsconfig, scanDirectories, outDirectory, check: !write }, () => false);
