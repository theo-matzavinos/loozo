import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, cp, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const evidence = resolve(process.argv[2]);

await mkdir(evidence, { recursive: true });

async function run(label, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  await Promise.all([
    writeFile(join(evidence, `${label}.stdout`), stdout),
    writeFile(join(evidence, `${label}.stderr`), stderr),
    writeFile(join(evidence, `${label}.exit`), `${result.status}\n`),
  ]);

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.status, 0, `${label}\n${stdout}\n${stderr}`);
}

await run(
  "pack",
  "pnpm",
  ["pack", "--out", join(evidence, "router.tgz")],
  join(packageDirectory, "dist"),
);

const copies = [];

for (const name of ["first", "second"]) {
  const destination = join(evidence, name);

  await mkdir(destination);
  await run(
    `extract-${name}`,
    "tar",
    ["-xzf", join(evidence, "router.tgz"), "-C", destination],
    packageDirectory,
  );

  const extracted = join(destination, "package");

  copies.push(extracted);
  await symlink(join(packageDirectory, "node_modules"), join(extracted, "node_modules"), "dir");
}

const first = copies[0];
const second = copies[1];
const metadata = JSON.parse(await readFile(join(first, "package.json"), "utf8"));
const secondMetadata = JSON.parse(await readFile(join(second, "package.json"), "utf8"));

for (const [directory, declaration] of [
  [first, metadata],
  [second, secondMetadata],
]) {
  assert.equal(declaration.private, undefined);
  assert.equal(declaration.version, "0.0.4");
  assert.equal(declaration.license, "MIT");

  const packedLicense = await readFile(join(directory, "LICENSE"), "utf8");
  const sourceLicense = await readFile(join(packageDirectory, "LICENSE"), "utf8");

  assert.equal(packedLicense, sourceLicense);
  assert.equal(declaration.peerDependencies["@angular/core"], "^22.0.0");
  assert.equal(declaration.peerDependencies["@angular/router"], "^22.0.0");

  const publicEntry = declaration.exports["."];

  assert.equal(typeof publicEntry.types, "string");
  assert.equal(typeof publicEntry.default, "string");

  const metadataEntry = declaration.exports["./package.json"];
  let metadataPath = metadataEntry;

  if (typeof metadataEntry !== "string") {
    metadataPath = metadataEntry.default;
  }

  assert.equal(metadataPath, "./package.json");

  for (const path of [publicEntry.types, publicEntry.default, metadataPath]) {
    assert.equal(path.startsWith("./"), true);
    assert.equal(path.startsWith("./dist/"), false);
    assert.equal((await stat(join(directory, path))).isFile(), true);
  }
}

// The source README embeds snippets by linking to them; the packed one inlines them and ships the files.
const sourceReadme = await readFile(join(packageDirectory, "README.md"), "utf8");
const packedReadme = await readFile(join(first, "README.md"), "utf8");
const embeds = [...sourceReadme.matchAll(/^\[[^\]]*\]\((snippets\/[^)#]+)(?:#[^)]*)?\)$/gm)];

assert.ok(embeds.length > 0, "The source README embeds snippets");
assert.equal(packedReadme.includes("](snippets/"), false, "Packed README still links to snippets");

// Every snippet file ships, including generated files the embedded snippets import.
const snippetEntries = await readdir(join(packageDirectory, "snippets"), {
  recursive: true,
  withFileTypes: true,
});
const snippetFiles = [];

for (const entry of snippetEntries) {
  if (entry.isFile()) {
    snippetFiles.push(join(entry.parentPath, entry.name).slice(packageDirectory.length));
  }
}

assert.ok(
  snippetFiles.some((path) => path.endsWith(".generated.ts")),
  "Snippets include generated files",
);

for (const path of snippetFiles) {
  assert.equal((await stat(join(first, path))).isFile(), true, `Packed snippet missing: ${path}`);
}

for (const [, path] of embeds) {
  assert.ok(snippetFiles.includes(path), `README embeds a file outside snippets/: ${path}`);
}

const productDefinition = "snippets/src/routes/products/$productId/route.ts";
const productSource = await readFile(join(first, productDefinition), "utf8");

assert.ok(
  packedReadme.includes(`\`${productDefinition}\`\n\n\`\`\`ts\n${productSource.trim()}\n\`\`\`\n`),
  "Packed README inlines the product definition snippet under its caption",
);

await cp(join(packageDirectory, "tests/consumer.ts"), join(first, "consumer.ts"));

for (const name of ["nodenext", "bundler"]) {
  const config = JSON.parse(
    await readFile(join(packageDirectory, `tests/tsconfig.${name}.json`), "utf8"),
  );

  if (name === "bundler") {
    config.extends = "./tsconfig.nodenext.json";
  }

  config.files = ["consumer.ts"];
  await writeFile(join(first, `tsconfig.${name}.json`), JSON.stringify(config));
  await run(
    `typecheck-${name}`,
    "pnpm",
    ["exec", "tsc", "-p", join(first, `tsconfig.${name}.json`)],
    packageDirectory,
  );
}

await writeFile(join(evidence, "package.json"), '{"type":"module","private":true}');

// Native TypeScript canonicalizes equal package IDs across physical copies.
// Prove public structural branding in each real self scope, not distinct TS symbols.
for (const directory of copies) {
  await writeFile(
    join(directory, "brands.ts"),
    `
  import { defineRoute, type Route } from '@loozo/angular-router';
  const genuine = defineRoute('plain', {});
  const own: Route<'plain', {}, {}> = genuine;
  // @ts-expect-error A public structural fake lacks the private nominal brand.
  const fake: Route<'plain', {}, {}> = { path: 'plain' };
`,
  );
}

await writeFile(
  join(evidence, "tsconfig.brands.json"),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      types: [],
    },
    files: [join(first, "brands.ts"), join(second, "brands.ts")],
  }),
);
await run(
  "typecheck-brands",
  "pnpm",
  ["exec", "tsc", "-p", join(evidence, "tsconfig.brands.json")],
  packageDirectory,
);

const firstEntry = pathToFileURL(join(first, metadata.exports["."].default)).href;
const secondEntry = pathToFileURL(join(second, secondMetadata.exports["."].default)).href;

await run(
  "plain-node-instances",
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `
  import assert from 'node:assert/strict';
  const a = await import(${JSON.stringify(firstEntry)});
  const b = await import(${JSON.stringify(secondEntry)});
  const publicValues = ['booleanParam','createUrl','defineRoute','enumParam','numberParam','stringParam','withFallback'];
  assert.deepEqual(Object.keys(a).sort(), publicValues);
  assert.deepEqual(Object.keys(b).sort(), publicValues);
  assert.notEqual(a.defineRoute, b.defineRoute);
  const local = a.defineRoute('local/$id', { params: { id: a.numberParam } });
  const foreign = b.defineRoute('foreign/$id', { params: { id: b.numberParam } });
  assert.equal(a.createUrl(a.defineRoute('child', { parent: local }), { params: { id: 7 } }), '/local/7/child');
  assert.equal(b.createUrl(b.defineRoute('child', { parent: foreign }), { params: { id: 8 } }), '/foreign/8/child');
  assert.throws(() => a.defineRoute('child', { parent: foreign }), TypeError);
  assert.throws(() => a.createUrl(foreign, { params: { id: 8 } }), TypeError);
  assert.throws(() => b.defineRoute('child', { parent: local }), TypeError);
  assert.throws(() => b.createUrl(local, { params: { id: 7 } }), TypeError);
  const localAlias = a.defineRoute('alias/$id', { params: { id: a.numberParam }, redirect: { to: local, search: { mode: 'drop' }, fragment: { mode: 'drop' } } });
  const foreignAlias = b.defineRoute('alias/$id', { params: { id: b.numberParam }, redirect: { to: foreign, search: { mode: 'drop' }, fragment: { mode: 'drop' } } });
  assert.equal(a.createUrl(localAlias, { params: { id: 7 } }), '/alias/7');
  assert.equal(b.createUrl(foreignAlias, { params: { id: 8 } }), '/alias/8');
  assert.throws(() => a.defineRoute('alias/$id', { params: { id: a.numberParam }, redirect: { to: foreign, search: { mode: 'drop' }, fragment: { mode: 'drop' } } }), { name: 'TypeError', message: /genuine route from this package instance/ });
  assert.throws(() => b.defineRoute('alias/$id', { params: { id: b.numberParam }, redirect: { to: local, search: { mode: 'drop' }, fragment: { mode: 'drop' } } }), { name: 'TypeError', message: /genuine route from this package instance/ });
  const product = a.defineRoute('products/$productId', { params: { productId: a.numberParam }, search: { tab: a.withFallback(a.enumParam(['details','reviews']), 'details') }, fragments: ['summary','reviews'] });
  assert.equal(a.createUrl(product, { params: { productId: 42 }, search: { tab: 'reviews' }, fragment: 'summary' }), '/products/42?tab=reviews#summary');
  console.log('fresh plain Node: 7 values; product URL; own core membership; distinct physical instances');
`,
  ],
  evidence,
);
console.log(`Packed verification passed: ${evidence}`);
