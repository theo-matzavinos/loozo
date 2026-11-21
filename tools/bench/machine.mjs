// The machine and toolchain a run measured, and its load at a moment.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import os from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);

export function load() {
  return { loadAverage: os.loadavg(), freeMemoryBytes: os.freemem() };
}

// `packages` are the measured packages' directories. Angular and TypeScript resolve from the
// first, and git and pnpm run there.
export async function machine({ packages }) {
  const [home] = packages;
  const require = createRequire(join(home, "package.json"));

  async function version(name) {
    const metadata = JSON.parse(await readFile(require.resolve(`${name}/package.json`), "utf8"));

    return metadata.version;
  }

  async function output(command, args) {
    const { stdout } = await run(command, args, { cwd: home });

    return stdout.trim();
  }

  const cpus = os.cpus();
  const manifests = await Promise.all(
    packages.map(async (directory) => {
      const text = await readFile(join(directory, "package.json"), "utf8");

      return JSON.parse(text);
    }),
  );
  const [pnpm, commit, status, core, build, cli, compilerCli, typescript] = await Promise.all([
    output("pnpm", ["--version"]),
    output("git", ["rev-parse", "HEAD"]),
    output("git", ["status", "--porcelain"]),
    version("@angular/core"),
    version("@angular/build"),
    version("@angular/cli"),
    version("@angular/compiler-cli"),
    version("typescript"),
  ]);
  const versions = {};

  for (const manifest of manifests) {
    versions[manifest.name] = manifest.version;
  }

  return {
    cpu: {
      model: cpus[0].model,
      logicalCores: cpus.length,
      availableParallelism: os.availableParallelism(),
    },
    memoryBytes: os.totalmem(),
    os: { type: os.type(), release: os.release(), version: os.version(), arch: os.arch() },
    node: process.version,
    zlib: process.versions.zlib,
    brotli: process.versions.brotli,
    pnpm,
    angular: { core, build, cli, compilerCli },
    typescript,
    packages: versions,
    git: { commit, dirty: status.length > 0 },
    ci: process.env.CI === "true",
    // Inherited settings that change Angular's builds (workers, type checking, mangling, …) or Node.
    environment: Object.fromEntries(
      Object.entries(process.env).filter(([name]) => /^NG_|^NODE_OPTIONS$/.test(name)),
    ),
  };
}
