// Installs the test route extension the way a published extension arrives: compiled
// with declaration emit, so generation and the runtime read only its emitted files.
import ts from "typescript";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const router = resolve(import.meta.dirname, "../..");

/** The test extension's source file, for installing it or a variant of it. */
export function extensionSource(file = "index.ts") {
  return readFile(resolve(import.meta.dirname, file), "utf8");
}

async function link(target, path) {
  await mkdir(dirname(path), { recursive: true });

  try {
    await symlink(target, path, "dir");
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

/** Links this router package and its Angular install into `root/node_modules`. */
export async function linkRouter(root) {
  await Promise.all([
    link(router, resolve(root, "node_modules/@loozo/angular-router")),
    link(resolve(router, "node_modules/@angular"), resolve(root, "node_modules/@angular")),
    link(resolve(router, "node_modules/rxjs"), resolve(root, "node_modules/rxjs")),
  ]);
}

/**
 * Compiles `files` (file name to TypeScript source) with declaration emit and installs
 * the output as the package `root/node_modules/<name>`, whose entry is `entry`.
 * `root/node_modules` must already resolve `@loozo/angular-router` and `@angular/core`.
 *
 * @returns The compiler diagnostics; they throw unless `noEmitOnError` is false.
 */
export async function emitPackage(
  root,
  name,
  files,
  { entry = "index", noEmitOnError = true } = {},
) {
  const sources = resolve(root, ".sources", name);
  const output = resolve(root, "node_modules", name);

  await mkdir(sources, { recursive: true });
  await writeFile(resolve(sources, "package.json"), '{ "type": "module" }\n');

  for (const [file, text] of Object.entries(files)) {
    await writeFile(resolve(sources, file), text);
  }

  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    declaration: true,
    rootDir: sources,
    outDir: resolve(output, "dist"),
    types: [],
    noEmitOnError,
  };
  const program = ts.createProgram(
    Object.keys(files).map((file) => resolve(sources, file)),
    options,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (noEmitOnError && diagnostics.length > 0) {
    throw new Error(
      ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  }

  program.emit();
  await writeFile(
    resolve(output, "package.json"),
    JSON.stringify({
      name,
      version: "0.0.0",
      type: "module",
      exports: { ".": { types: `./dist/${entry}.d.ts`, default: `./dist/${entry}.js` } },
    }),
  );

  return diagnostics;
}

/**
 * Installs the test extension as `@fixture/route-extension` (unannotated factory) and
 * `@fixture/route-extension-annotated` (explicit RouteFactory annotation).
 */
export async function installExtension(root) {
  const index = await extensionSource("index.ts");
  const annotated = await extensionSource("annotated.ts");

  await linkRouter(root);
  await emitPackage(root, "@fixture/route-extension", { "index.ts": index });
  await emitPackage(
    root,
    "@fixture/route-extension-annotated",
    { "index.ts": index, "annotated.ts": annotated },
    { entry: "annotated" },
  );
}
