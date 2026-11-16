// Ships the docs agents read with the installed version: dist/docs/llms.txt (the index),
// dist/docs/<component>.md (each component's readme) and dist/skills/ (the agent skill).
//
// Usage: node scripts/package-docs.mjs, after ng-packagr wrote dist/.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const components = [
  { name: "toggle", title: "Toggle" },
  { name: "select", title: "Select" },
];

const root = new URL("../", import.meta.url);
const docs = new URL("dist/docs/", root);

await mkdir(docs, { recursive: true });

const pages = [];

for (const { name, title } of components) {
  const readme = await readFile(new URL(`${name}/README.md`, root), "utf8");

  await writeFile(new URL(`${name}.md`, docs), readme);
  pages.push(`- [${title}](./${name}.md): \`@loozo/ui-sdk-angular/${name}\``);
}

const overview = await readFile(new URL("README.md", root), "utf8");
const index = [
  "<!-- @loozo/ui-sdk-angular docs for this installed version. Read this index first, then only the pages your task needs. -->",
  "",
  overview.trim(),
  "",
  "## Pages",
  "",
  ...pages,
  "",
  "Core's own docs, for options, controllers and behavior: `node_modules/@ui-sdk/core/docs/llms.txt`.",
  "",
].join("\n");

await writeFile(new URL("llms.txt", docs), index);
await cp(new URL("skills/", root), new URL("dist/skills/", root), { recursive: true });
