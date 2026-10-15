import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import {
  copyFile,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inventory } from "./inventory.mjs";

// The authored consumer is the workspace example; acceptance installs a staged copy in scratch.
const example = path.resolve("../../examples/origami-ui");
const directory = path.resolve(".scratch/consumer");
const manifestPath = path.join(directory, "package.json");
// Installed, generated and cache trees: never authored, never staged over or removed by staging.
const generated = ["node_modules", "dist", ".angular", ".runtime"];
const environment = {
  ...process.env,
  npm_config_cache: path.join(directory, ".runtime/npm-cache"),
};
const strict = ["--strict-peer-deps", "--legacy-peer-deps=false", "--force=false"];
const installed = path.join(directory, "node_modules/@loozo/origami-ui");
const hiddenLockfile = path.join(directory, "node_modules/.package-lock.json");
// The manifest a verified clean install was for, written only once the whole clean prepare
// has succeeded. Kept outside node_modules: a new file there would make npm distrust its
// hidden lockfile.
const stamp = path.join(directory, ".runtime/consumer-install.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function authoredFiles(root) {
  const files = [];

  async function walk(relative) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (generated.includes(entry.name)) {
        continue;
      }

      const filename = path.join(relative, entry.name);

      if (entry.isDirectory()) {
        await walk(filename);
      }

      if (entry.isFile()) {
        files.push(filename);
      }
    }
  }

  await walk("");

  return files;
}

/**
 * Stage the authored example into the scratch consumer: refresh changed files, remove deleted
 * ones and write the effective manifest. Only the library reference changes (to the real tarball);
 * the workspace-only tool `devDependencies` and `scripts` are dropped. Installed trees are kept.
 */
export async function stageConsumer(tarball) {
  const template = await readFile(path.join(example, "package.json"));
  const manifest = JSON.parse(template);

  assert.equal(manifest.dependencies["@loozo/origami-ui"], "workspace:*");
  manifest.dependencies["@loozo/origami-ui"] = `file:${path.relative(directory, tarball)}`;
  delete manifest.devDependencies;
  delete manifest.scripts;

  const effective = `${JSON.stringify(manifest, null, 2)}\n`;
  const sources = await authoredFiles(example);

  await mkdir(directory, { recursive: true });

  const staged = await authoredFiles(directory);

  for (const file of staged) {
    if (!sources.includes(file)) {
      await rm(path.join(directory, file));
    }
  }

  for (const file of sources) {
    const target = path.join(directory, file);

    if (file === "package.json") {
      continue;
    }

    if (existsSync(target)) {
      const [source, current] = await Promise.all([
        readFile(path.join(example, file)),
        readFile(target),
      ]);

      if (source.equals(current)) {
        continue;
      }
    }

    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(example, file), target);
  }

  let stagedManifest = null;

  if (existsSync(manifestPath)) {
    stagedManifest = await readFile(manifestPath, "utf8");
  }

  if (stagedManifest !== effective) {
    await writeFile(manifestPath, effective);
  }

  return {
    example,
    exampleManifestSha256: sha256(template),
    manifestSha256: sha256(effective),
  };
}

/** Ordinary strict npm installation into the dedicated consumer, never a source alias. */
export async function installConsumer(tarball) {
  const source = await readFile(manifestPath);
  const manifest = JSON.parse(source);
  const reference = manifest.dependencies["@loozo/origami-ui"];

  assert.ok(reference.startsWith("file:"));
  assert.equal(path.resolve(directory, reference.slice(5)), path.resolve(tarball));
  // The old stamp certifies the tree about to be replaced; a failed attempt must leave none.
  await rm(stamp, { force: true });
  // Consumer-local runtime bytes only; a clean install cannot reuse a stale same-version APF.
  await rm(path.join(directory, "node_modules"), { recursive: true, force: true });

  const command = [
    "install",
    "--prefix",
    directory,
    "--no-save",
    "--package-lock=false",
    "--ignore-scripts",
    "--install-strategy=hoisted",
    "--registry=https://registry.npmjs.org",
    ...strict,
  ];
  const exampleManifest = await readFile(path.join(example, "package.json"));
  const result = spawnSync("npm", command, { encoding: "utf8", env: environment });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(
    (await readFile(manifestPath)).equals(source),
    "npm changed the effective consumer manifest",
  );
  assert.ok(
    (await readFile(path.join(example, "package.json"))).equals(exampleManifest),
    "npm changed the authored example manifest",
  );

  const identity = await verifyConsumerDependencies();

  await mkdir(".acceptance-evidence", { recursive: true });
  await writeFile(
    ".acceptance-evidence/consumer-installation.json",
    JSON.stringify(
      {
        command: ["npm", ...command],
        stdout: result.stdout,
        stderr: result.stderr,
        registry: "https://registry.npmjs.org",
        cache: environment.npm_config_cache,
        tarball: path.resolve(tarball),
        example,
        exampleManifestSha256: sha256(exampleManifest),
        manifestSha256: sha256(source),
        ...identity,
      },
      null,
      2,
    ),
  );

  return identity;
}

/** Commit a clean installation: call last, once every check of the installed bytes passed. */
export async function stampInstallation() {
  await mkdir(path.dirname(stamp), { recursive: true });
  await writeFile(
    stamp,
    JSON.stringify({ manifestSha256: sha256(await readFile(manifestPath)) }, null, 2),
  );
}

/** Whether a clean strict installation completed and recorded the manifest it installed for. */
export function hasInstallationStamp() {
  return existsSync(stamp);
}

/**
 * Warm refresh: replace only the installed APF with the new tarball's bytes, keeping every
 * unchanged dependency. Same-version `file:` tarballs are not trusted to refresh through npm.
 */
export async function syncConsumerPackage(tarball) {
  const prepare = "run `pnpm run acceptance:prepare` for a clean strict installation";

  assert.ok(
    existsSync(stamp) && existsSync(installed),
    `The consumer has no verified dependency installation; ${prepare}`,
  );

  const installation = JSON.parse(await readFile(stamp, "utf8"));

  assert.equal(
    installation.manifestSha256,
    sha256(await readFile(manifestPath)),
    `The consumer manifest changed since its dependencies were installed; ${prepare}`,
  );

  await mkdir(path.join(directory, ".runtime"), { recursive: true });

  const extraction = await mkdtemp(path.join(directory, ".runtime/package-sync-"));
  const extracted = spawnSync("tar", ["-xzf", tarball, "-C", extraction], { encoding: "utf8" });

  assert.equal(extracted.status, 0, extracted.stderr);

  const next = JSON.parse(await readFile(path.join(extraction, "package/package.json"), "utf8"));
  const current = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"));

  for (const field of ["version", "dependencies", "peerDependencies", "optionalDependencies"]) {
    assert.deepEqual(
      next[field],
      current[field],
      `The library's ${field} changed; its dependency closure needs a new installation: ${prepare}`,
    );
  }

  await rm(installed, { recursive: true, force: true });
  await rename(path.join(extraction, "package"), installed);
  await rm(extraction, { recursive: true, force: true });

  // npm's hidden lockfile records the tarball integrity. Keep it truthful: tools that key their
  // dependency caches on it (the Angular dev server's Vite pre-bundling) must see the new bytes.
  const lockfile = JSON.parse(await readFile(hiddenLockfile, "utf8"));
  const entry = lockfile.packages["node_modules/@loozo/origami-ui"];

  assert.ok(entry, "The hidden npm lockfile has no installed APF entry");
  entry.integrity = `sha512-${createHash("sha512")
    .update(await readFile(tarball))
    .digest("base64")}`;
  await writeFile(hiddenLockfile, `${JSON.stringify(lockfile, null, 2)}\n`);

  return verifyCoreIdentity();
}

/** Validate the actual consumer closure and public-package resolution; tool-only copies are unrelated. */
export async function verifyConsumerDependencies() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const allowed = new Map();

  for (const [name, version] of Object.entries(manifest.dependencies)) {
    if (!version.startsWith("file:")) {
      allowed.set(name, new Set([version]));
    }
  }

  for (const [selector, version] of Object.entries(manifest.overrides)) {
    const match = selector.match(/^(@[^/]+\/[^@]+|[^@]+)(?:@.*)?$/);

    assert.ok(match);

    const name = match[1];
    const versions = allowed.get(name) ?? new Set();

    versions.add(version);
    allowed.set(name, versions);
  }

  const listed = spawnSync(
    "npm",
    ["ls", "--prefix", directory, "--all", "--json", "--long", ...strict],
    { encoding: "utf8", env: environment },
  );

  assert.equal(listed.status, 0, `${listed.stdout}\n${listed.stderr}`);

  const tree = JSON.parse(listed.stdout);
  const packages = new Map();
  const absentOptionalPeers = [];

  async function inspect(node) {
    assert.ok(!node.problems?.length, JSON.stringify(node.problems));

    for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
      assert.ok(!dependency.invalid && !dependency.missing && !dependency.extraneous, name);

      if (dependency.version === undefined) {
        const owner = JSON.parse(await readFile(path.join(node.path, "package.json"), "utf8"));

        assert.deepEqual(dependency, {});
        assert.equal(
          owner.peerDependenciesMeta?.[name]?.optional,
          true,
          `Absent nonoptional peer: ${name}`,
        );
        absentOptionalPeers.push({ owner: owner.name, peer: name });

        continue;
      }

      if (name === "@loozo/origami-ui") {
        assert.equal(dependency.version, "0.0.1");
      } else {
        assert.ok(
          allowed.get(name)?.has(dependency.version),
          `Unplanned runtime dependency: ${name}@${dependency.version}`,
        );
      }

      const versions = packages.get(name) ?? new Set();

      versions.add(dependency.version);
      packages.set(name, versions);
      await inspect(dependency);
    }
  }

  await inspect(tree);
  assert.equal(
    packages.size,
    allowed.size + 1,
    "The complete pinned application closure was not installed",
  );

  return {
    ...(await verifyCoreIdentity()),
    absentOptionalPeers,
    packages: Object.fromEntries(
      [...packages].map(([name, versions]) => [name, [...versions].sort()]),
    ),
  };
}

/** Every application Angular package and APF entrypoint loads the consumer's one Core namespace. */
export async function verifyCoreIdentity() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const consumer = createRequire(manifestPath);
  const corePath = await realpath(consumer.resolve("@angular/core"));
  const core = await import(pathToFileURL(corePath).href);
  const origins = {};
  const names = Object.keys(manifest.dependencies).filter((name) => name.startsWith("@angular/"));

  for (const entrypoint of Object.keys(inventory)) {
    let name = "@loozo/origami-ui";

    if (entrypoint) {
      name += `/${entrypoint}`;
    }

    names.push(name);
  }

  for (const name of names) {
    const origin = consumer.resolve(name);
    const resolver = createRequire(origin);
    const resolved = await realpath(resolver.resolve("@angular/core"));

    assert.equal(resolved, corePath, `${name} resolves a distinct runtime Angular core`);
    assert.equal(
      await import(pathToFileURL(resolved).href),
      core,
      `${name} loads a distinct core namespace`,
    );
    origins[name] = { origin, core: resolved };
  }

  return {
    corePath,
    origins,
    tools:
      "Parent compiler/build copies may have separate same-version physical cores; they are not application runtime owners.",
  };
}
