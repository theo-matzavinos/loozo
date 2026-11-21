// The build bench's workloads: which entries exist, which companions a workload may import, and
// the import scan that holds every workload to them. See bench/README.md, "Workloads".
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { exists } from "../../../tools/bench/process.mjs";

// A companion is another entry the entry's README makes part of its working anatomy. Each needs a
// reason.
export const companions = {
  // date-picker/README.md: "Inside the popup you author an ordinary ogCalendar"; the picker binds it.
  "date-picker": ["calendar"],
};

const origami = "@loozo/origami-ui/";

// The package's code entry points, in exports order: every key but "." (an empty public API) and
// "./package.json".
export function entries(manifest) {
  const names = [];

  for (const key of Object.keys(manifest.exports)) {
    if (key !== "." && key !== "./package.json") {
      names.push(key.slice("./".length));
    }
  }

  return names;
}

// What a workload imports, from TypeScript's preprocessor: static, side-effect and dynamic imports.
function imports(ts, source) {
  const found = [];

  for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
    found.push(fileName);
  }

  return found;
}

// The entries' and all's workloads, read and checked against the companion map. Every message names
// the file to fix. Returns each scenario's workload evidence.
export async function scanWorkloads({ packageDirectory, workloads, entries: names }) {
  const require = createRequire(join(packageDirectory, "package.json"));
  const ts = require("typescript");
  const known = new Set(names);
  const scanned = {};

  for (const [entry, declared] of Object.entries(companions)) {
    if (!known.has(entry)) {
      throw new Error(`companions are declared for ${entry}, which isn't an Origami entry`);
    }

    for (const companion of declared) {
      if (companion === entry) {
        throw new Error(`${entry} declares itself as a companion`);
      }

      if (!known.has(companion)) {
        throw new Error(`companion ${companion} isn't an Origami entry`);
      }
    }
  }

  for (const scenario of ["baseline", ...names, "all"]) {
    const path = join(workloads, `${scenario}.ts`);
    const present = await exists(path);

    if (!present) {
      if (known.has(scenario)) {
        throw new Error(`no workload for exported entry ${scenario}`);
      }

      throw new Error(`no workload for ${scenario} (workloads/${scenario}.ts)`);
    }

    const source = await readFile(path, "utf8");
    const specifiers = imports(ts, source);
    const used = new Set();
    const relative = new Set();
    const local = [];

    for (const specifier of specifiers) {
      if (specifier.startsWith(origami)) {
        used.add(specifier.slice(origami.length));
      } else if (specifier.startsWith(".") || specifier.startsWith("/")) {
        relative.add(specifier.replace(/^\.\//, ""));
        local.push(specifier);
      }
    }

    // baseline and all name no entry: baseline imports none, all imports every entry's workload.
    let expected = new Set();

    if (known.has(scenario)) {
      expected = new Set([scenario, ...(companions[scenario] ?? [])]);
    }

    for (const name of used) {
      if (!expected.has(name)) {
        if (known.has(scenario)) {
          throw new Error(
            `workloads/${scenario}.ts imports ${origami}${name}, which isn't ${scenario} or a declared companion`,
          );
        }

        throw new Error(
          `workloads/${scenario}.ts imports ${origami}${name}; ${scenario} imports no entry directly`,
        );
      }
    }

    for (const name of expected) {
      if (!used.has(name)) {
        if (name === scenario) {
          throw new Error(`workloads/${scenario}.ts doesn't import ${origami}${scenario}`);
        }

        throw new Error(
          `${scenario} declares companion ${name} but its workload doesn't import it`,
        );
      }
    }

    // Only all composes other workloads; an isolated scenario that renders another workload no
    // longer measures its entry alone.
    if (scenario !== "all") {
      for (const specifier of local) {
        throw new Error(
          `workloads/${scenario}.ts imports ${specifier}; only all imports other workloads or local files`,
        );
      }
    }

    if (scenario === "all") {
      for (const name of names) {
        if (!relative.has(name)) {
          throw new Error(`workloads/all.ts doesn't import ./${name}, the ${name} workload`);
        }
      }
    }

    scanned[scenario] = {
      path: `bench/workloads/${scenario}.ts`,
      sha256: createHash("sha256").update(source).digest("hex"),
      companions: companions[scenario] ?? [],
    };
  }

  return scanned;
}
