// The Launch workload's scratch consumer: examples/angular-launch (its build target, server entry
// and SSR wiring) without its routes, generated files, proof-only entries or verification
// configurations, with the example's installed dependencies and both built packages linked in.
// No package.json dependency on Launch, so the router has no workspace cycle.
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { packageDirectory, readWorkspace } from "./consumer.mjs";

const repository = resolve(packageDirectory, "../..");
const example = join(repository, "examples/angular-launch");
export const launchDirectory = join(repository, "packages/angular-launch");

// Example files only its proof routes, verification entry or prerender configurations use.
const excluded =
  /(?:^|[\\/])(?:node_modules|dist|\.angular|\.scratch|out-tsc|generated|routes|verify\.mjs|README\.md|main\.verification\.ts|rendering\.prerender\.ts|rendering\.signed-in\.ts|todo-input\.server\.ts)(?:[\\/]|$)/;

// The example's config without the not-found route its navigation error handler names, and with
// TanStack Query's default client.
const config = `import { provideHttpClient } from "@angular/common/http";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import type { ApplicationConfig } from "@angular/core";
import { provideLaunchQueries } from "@loozo/angular-launch/tanstack-query";
import { provideTanStackQuery, QueryClient } from "@tanstack/angular-query";
import { routes } from "../generated/routes.generated";

export const config: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideClientHydration(),
    provideRouter(routes),
    provideTanStackQuery(() => new QueryClient()),
    provideLaunchQueries(),
  ],
};
`;

export async function createLaunchConsumer(consumer) {
  await cp(example, consumer, {
    recursive: true,
    filter: (path) => !excluded.test(path.slice(example.length)),
  });
  await writeFile(join(consumer, "src/config.ts"), config);

  const metadata = JSON.parse(await readFile(join(example, "package.json"), "utf8"));

  for (const name of [
    ...Object.keys(metadata.dependencies),
    ...Object.keys(metadata.devDependencies),
  ]) {
    const link = join(consumer, "node_modules", name);

    await mkdir(dirname(link), { recursive: true });

    let target = join(example, "node_modules", name);

    if (name === "@loozo/angular-router") {
      target = packageDirectory;
    }

    if (name === "@loozo/angular-launch") {
      target = launchDirectory;
    }

    await symlink(target, link, "dir");
  }

  // The example's application target under the name the bench's other steps read, as a
  // production build with hashed file names, like the router workload's.
  const workspace = await readWorkspace(consumer);
  const project = workspace.projects.todos;
  const { build } = project.architect;

  delete workspace.projects.todos;
  workspace.projects.proof = project;
  Object.assign(build.options, {
    outputPath: "dist/proof",
    optimization: { scripts: true, styles: true, fonts: false },
    statsJson: true,
    sourceMap: false,
    outputHashing: "all",
  });
  build.configurations = {};
  project.architect.serve.options.buildTarget = "proof:build";
  await writeFile(join(consumer, "angular.json"), `${JSON.stringify(workspace, null, 2)}\n`);
}
