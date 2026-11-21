// A scratch consumer for Origami's benches: one browser application project, `bench`, that
// bootstraps a workload, with one build configuration per workload. Angular comes from this
// package's dependencies and `@loozo/origami-ui` is the built dist/, linked as the router bench
// links its package.
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
export const workloadsDirectory = fileURLToPath(new URL("./workloads/", import.meta.url));

// Every workload's root selector lists `bench-root`, the element index.html hosts, so each
// configuration bootstraps its workload; all renders the others by their own selectors.
const index = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Origami bench</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <bench-root></bench-root>
  </body>
</html>
`;

const main = `import { bootstrapApplication } from "@angular/platform-browser";
import { Workload } from "./workload";

bootstrapApplication(Workload).catch((error: unknown) => console.error(error));
`;

// A strict consumer's compiler options.
const tsconfig = {
  compilerOptions: {
    target: "ES2022",
    module: "preserve",
    moduleResolution: "bundler",
    lib: ["ES2022", "DOM"],
    strict: true,
    isolatedModules: true,
    experimentalDecorators: true,
    skipLibCheck: true,
    noImplicitOverride: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
  },
  angularCompilerOptions: {
    strictInjectionParameters: true,
    strictInputAccessModifiers: true,
    strictTemplates: true,
  },
};

// The app's program is every file under src/, so the type-check covers every workload.
const tsconfigApp = {
  extends: "./tsconfig.json",
  compilerOptions: { types: [], incremental: false },
  files: ["src/main.ts"],
  include: ["src/**/*.ts"],
};

// Production build options: optimized scripts and styles, fonts off, stats for the bundle
// measurement, no source maps, hashed names. Browser only, with the disk cache off.
export const buildOptions = {
  browser: "src/main.ts",
  index: "src/index.html",
  tsConfig: "tsconfig.app.json",
  optimization: { scripts: true, styles: true, fonts: false },
  statsJson: true,
  sourceMap: false,
  outputHashing: "all",
};

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

// Creates the consumer with a configuration per workload name, each replacing src/workload.ts
// with src/workloads/<name>.ts and writing to dist/<name>. The default configuration builds the
// first workload.
export async function createConsumer(consumer, workloads) {
  const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));

  for (const name of new Set([
    ...Object.keys(metadata.dependencies),
    ...Object.keys(metadata.devDependencies),
    "@loozo/origami-ui",
  ])) {
    const link = join(consumer, "node_modules", name);
    let target = join(packageDirectory, "node_modules", name);

    if (name === "@loozo/origami-ui") {
      target = join(packageDirectory, "dist");
    }

    await mkdir(dirname(link), { recursive: true });
    await symlink(target, link, "dir");
  }

  const source = join(consumer, "src");

  await cp(workloadsDirectory, join(source, "workloads"), { recursive: true });
  await cp(join(workloadsDirectory, `${workloads[0]}.ts`), join(source, "workload.ts"));
  await writeFile(join(source, "main.ts"), main);
  await writeFile(join(source, "index.html"), index);

  const configurations = {};

  for (const name of workloads) {
    configurations[name] = {
      outputPath: `dist/${name}`,
      fileReplacements: [{ replace: "src/workload.ts", with: `src/workloads/${name}.ts` }],
    };
  }

  await writeJson(join(consumer, "angular.json"), {
    version: 1,
    cli: { cache: { enabled: false }, analytics: false },
    projects: {
      bench: {
        projectType: "application",
        root: "",
        sourceRoot: "src",
        architect: {
          build: {
            builder: "@angular/build:application",
            options: { ...buildOptions, outputPath: `dist/${workloads[0]}` },
            configurations,
          },
        },
      },
    },
  });
  await writeJson(join(consumer, "package.json"), {
    name: "origami-bench-consumer",
    private: true,
    type: "module",
  });
  await writeJson(join(consumer, "tsconfig.json"), tsconfig);
  await writeJson(join(consumer, "tsconfig.app.json"), tsconfigApp);
}
