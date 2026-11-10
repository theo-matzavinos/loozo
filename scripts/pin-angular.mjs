// Pins every Angular package the workspace uses to the version an npm dist-tag (latest, next)
// names, through pnpm overrides, for the Angular canary workflow. Run at the workspace root, then
// `pnpm install --no-frozen-lockfile`. Framework and tooling packages version separately, so each
// package's tag is looked up on its own.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const tag = process.argv[2];

if (!tag) {
  throw new Error("Usage: node scripts/pin-angular.mjs <dist-tag>");
}

const angular = /^(?:@angular\/|@angular-devkit\/|ng-packagr$)/;
const manifests = execFileSync("git", ["ls-files", "package.json", "**/package.json"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
const names = new Set();

for (const manifest of manifests) {
  const metadata = JSON.parse(await readFile(manifest, "utf8"));

  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    for (const name of Object.keys(metadata[field] ?? {})) {
      if (angular.test(name)) {
        names.add(name);
      }
    }
  }
}

const lines = [];

for (const name of names) {
  const version = execFileSync("pnpm", ["view", `${name}@${tag}`, "version"], {
    encoding: "utf8",
  }).trim();

  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
    throw new Error(`${name}@${tag} resolved to ${JSON.stringify(version)}, not one version`);
  }

  console.log(`${name} ${version}`);
  lines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(version)}`);
}

const workspace = await readFile("pnpm-workspace.yaml", "utf8");

if (!/^overrides:\n/m.test(workspace)) {
  throw new Error("pnpm-workspace.yaml has no top-level overrides map to extend");
}

await writeFile(
  "pnpm-workspace.yaml",
  workspace.replace(/^overrides:\n/m, `overrides:\n${lines.join("\n")}\n`),
);
