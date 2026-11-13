// The machine and toolchain a run measured, and its load at a moment.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { packageDirectory } from "./consumer.mjs";

const run = promisify(execFile);
const require = createRequire(join(packageDirectory, "package.json"));

async function version(name) {
  const metadata = JSON.parse(await readFile(require.resolve(`${name}/package.json`), "utf8"));

  return metadata.version;
}

async function output(command, args) {
  const { stdout } = await run(command, args, { cwd: packageDirectory });

  return stdout.trim();
}

export function load() {
  return { loadAverage: os.loadavg(), freeMemoryBytes: os.freemem() };
}

export async function machine() {
  const cpus = os.cpus();
  const router = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
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

  return {
    cpu: {
      model: cpus[0].model,
      logicalCores: cpus.length,
      availableParallelism: os.availableParallelism(),
    },
    memoryBytes: os.totalmem(),
    os: { type: os.type(), release: os.release(), version: os.version(), arch: os.arch() },
    node: process.version,
    pnpm,
    angular: { core, build, cli, compilerCli },
    typescript,
    router: router.version,
    git: { commit, dirty: status.length > 0 },
    // Inherited settings that change Angular's builds (workers, type checking, mangling, …) or Node.
    environment: Object.fromEntries(
      Object.entries(process.env).filter(([name]) => /^NG_|^NODE_OPTIONS$/.test(name)),
    ),
  };
}
