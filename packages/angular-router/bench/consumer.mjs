// A scratch consumer: examples/angular-router without its routes, generated files or SSR proof,
// with this package's dependencies and the built package linked in, as tests/filesystem.mjs does.
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(packageDirectory, "../..");

// The build phase disables Angular's disk cache, so every build starts cold. The serve phase
// enables it explicitly for every environment (the default only covers non-CI ones), in a fresh
// .angular/cache: a developer's first `ng serve`, with dependency prebundling on.
export const cachePolicy = {
  serve: { enabled: true, environment: "all" },
  build: { enabled: false },
};

export async function createConsumer(consumer) {
  await cp(join(repository, "examples/angular-router"), consumer, {
    recursive: true,
    filter: (path) =>
      !/(?:^|[\\/])(?:node_modules|dist|\.angular|generated|routes|ssr-proof)(?:[\\/]|$)/.test(
        path,
      ),
  });

  const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));

  for (const name of new Set([
    ...Object.keys(metadata.dependencies),
    ...Object.keys(metadata.devDependencies),
    "@loozo/angular-router",
  ])) {
    const link = join(consumer, "node_modules", name);

    await mkdir(dirname(link), { recursive: true });

    let target = join(packageDirectory, "node_modules", name);

    if (name === "@loozo/angular-router") {
      target = packageDirectory;
    }

    await symlink(target, link, "dir");
  }

  const workspace = await readWorkspace(consumer);
  const { architect } = workspace.projects.proof;

  // A production browser build: optimized, stats for the bundle phase, no source maps.
  Object.assign(architect.build.options, {
    optimization: { scripts: true, styles: true, fonts: false },
    statsJson: true,
    sourceMap: false,
    outputHashing: "all",
  });
  // Serve uses an unoptimized development build.
  architect.build.configurations.development = {
    optimization: false,
    statsJson: false,
    outputHashing: "none",
  };
  architect.serve.options.buildTarget = "proof:build:development";
  await writeWorkspace(consumer, workspace);
}

export async function setCache(consumer, cache) {
  const workspace = await readWorkspace(consumer);

  workspace.cli.cache = cache;
  await writeWorkspace(consumer, workspace);
}

export async function readWorkspace(consumer) {
  return JSON.parse(await readFile(join(consumer, "angular.json"), "utf8"));
}

async function writeWorkspace(consumer, workspace) {
  await writeFile(join(consumer, "angular.json"), `${JSON.stringify(workspace, null, 2)}\n`);
}
