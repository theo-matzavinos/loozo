// Initial and lazy bundle sizes from the production build's browser-stats.json.
//
// Initial files are the configured browser entry's output plus everything it reaches through
// static imports (import-statement, import-rule) and CSS bundles; dynamic imports are lazy. Every
// emitted JS/CSS file is compressed on its own (gzip level 9, Brotli quality 11) and the totals
// sum those per-file sizes. HTML, licenses and maps aren't counted.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { readWorkspace } from "./consumer.mjs";

const routeTables = /(?:^|\/)generated\/(?:routes|destinations)\.generated\.ts$/;

function total(files) {
  const sum = { files: 0, raw: 0, gzip: 0, brotli: 0 };

  for (const file of files) {
    sum.files += 1;
    sum.raw += file.raw;
    sum.gzip += file.gzip;
    sum.brotli += file.brotli;
  }

  return sum;
}

export async function measureBundle(consumer) {
  const workspace = await readWorkspace(consumer);
  const { outputPath, browser } = workspace.projects.proof.architect.build.options;
  const output = join(consumer, outputPath);
  const stats = JSON.parse(await readFile(join(output, "browser-stats.json"), "utf8"));
  const queue = [];

  for (const [path, value] of Object.entries(stats.outputs)) {
    if (value.entryPoint === browser) {
      queue.push(path);
    }
  }

  if (queue.length !== 1) {
    throw new Error(`Expected one output for the browser entry ${browser}, found ${queue.length}`);
  }

  const [entry] = queue;
  const initial = new Set();

  while (queue.length > 0) {
    const path = queue.pop();

    if (initial.has(path)) {
      continue;
    }

    const value = stats.outputs[path];

    if (!value) {
      throw new Error(`browser-stats.json imports a missing output: ${path}`);
    }

    initial.add(path);

    for (const edge of value.imports) {
      const isStatic = edge.kind === "import-statement" || edge.kind === "import-rule";

      if (isStatic && !edge.external) {
        queue.push(edge.path);
      }
    }

    if (value.cssBundle) {
      queue.push(value.cssBundle);
    }
  }

  // Cross-check the traversal's root against the built HTML's module script.
  const html = await readFile(join(output, "browser/index.html"), "utf8");

  if (!html.includes(`src="${entry}"`)) {
    throw new Error(`index.html doesn't load the browser entry's output ${entry}`);
  }

  const files = [];

  for (const [path, value] of Object.entries(stats.outputs)) {
    if (!/\.(?:js|css)$/.test(path)) {
      continue;
    }

    const bytes = await readFile(join(output, "browser", path));
    const gzip = gzipSync(bytes, { level: 9 });
    const brotli = brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    });

    files.push({
      path,
      initial: initial.has(path),
      routeTables: Object.keys(value.inputs).some((input) => routeTables.test(input)),
      raw: bytes.length,
      gzip: gzip.length,
      brotli: brotli.length,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  const initialFiles = [];
  const lazyFiles = [];

  for (const file of files) {
    if (file.initial) {
      initialFiles.push(file);
    } else {
      lazyFiles.push(file);
    }
  }

  return {
    entry,
    initial: total(initialFiles),
    lazy: total(lazyFiles),
    files,
  };
}
