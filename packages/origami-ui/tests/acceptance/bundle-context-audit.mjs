import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire, isBuiltin } from "node:module";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const identitySpecifier = (name) =>
  name.startsWith("@angular/") || /^@loozo\/origami-ui(?:\/|$)/.test(name);

// Reviewed Angular 22.2.2 boundary, not a permission for two arbitrary framework copies.
// SDK/provider/host-source changes require a new concrete boundary review.
const boundaryPins = {
  ".scratch/consumer/node_modules/@angular/ssr/fesm2022/ssr.mjs":
    "69c47a8dee89e5a11f2252220d1e76bbbecee14bf599ecc047498c04a7763386",
  ".scratch/consumer/node_modules/@angular/ssr/fesm2022/node.mjs":
    "d3047f595cdf87fa173a736946c468875abb75b6c5c6fa6fa26cd59a5bce5d66",
  ".scratch/consumer/node_modules/@angular/ssr/fesm2022/_validation-chunk.mjs":
    "6e9d833805bdfc47434df243744e9c48af0d8a4dda9dab86f45396fcf82a3bbe",
  ".scratch/consumer/node_modules/@angular/core/fesm2022/core.mjs":
    "be80a677d167899173078632f3e76f27856e6245a9b6b93f6aa4f9b94350e62b",
  "node_modules/@angular/build/src/tools/esbuild/application-code-bundle.js":
    "5c8506c8f093768a0f1827ae6b7d855f672432c043f7a919a0c3f8d0dbed1807",
  ".scratch/consumer/node_modules/xhr2/lib/xhr2.js":
    "8d996d56ba2cba15e31f298e4691cdb1b695d3927077235bdbd69ed5e4ee5d38",
  ".scratch/consumer/src/server.ts":
    "5cf405d6ae7b186c7fe9a17c8a42100583705ef67ad7af22484185f97a871ad9",
};

// The library's authored entrypoint trees and its unpacked build. The scratch consumer lives inside
// the package directory, so the package directory itself is not the boundary.
const librarySources = [];

for (const directory of [
  "src",
  "utils",
  "collection",
  "presence",
  "collapsible",
  "accordion",
  "popover",
  "toggle",
  "tabs",
  "toggle-group",
  "toolbar",
  "radio-group",
  "dist",
]) {
  librarySources.push(path.resolve(directory));
}

export async function consumerOrigins() {
  const consumer = createRequire(path.resolve(".scratch/consumer/package.json"));

  return {
    core: await realpath(path.dirname(consumer.resolve("@angular/core/package.json"))),
    apf: await realpath(path.dirname(consumer.resolve("@loozo/origami-ui/package.json"))),
  };
}

/**
 * Actual emitted AST + native metafile provenance. All literal dynamic edges are retained.
 * `metafiles` names each platform's own native metafile (`browser`, `server`) of one distribution.
 */
export async function loadRuntimeGraph(
  metafiles,
  workspaceDirectory = path.resolve(".scratch/consumer"),
) {
  const platforms = Object.keys(metafiles);

  assert.ok(platforms.length > 0, "No native metafile");

  const base = path.resolve(path.dirname(Object.values(metafiles)[0]));
  const statsSha256 = {};
  const modules = new Map();
  const outputs = new Map();

  for (const platform of platforms) {
    assert.ok(["browser", "server"].includes(platform), `Unknown metafile platform: ${platform}`);

    const filename = metafiles[platform];

    assert.equal(
      path.resolve(path.dirname(filename)),
      base,
      `Metafile from another distribution: ${filename}`,
    );

    const bytes = await readFile(filename);
    const stats = JSON.parse(bytes);

    statsSha256[platform] = hash(bytes);

    for (const [output, details] of Object.entries(stats.outputs)) {
      if (!/\.(m?js)$/.test(output)) {
        continue;
      }

      // The combined format's extension classification, kept as a cross-check of the platform.
      let directory = "browser";

      if (output.endsWith(".mjs")) {
        directory = "server";
      }

      assert.equal(directory, platform, `Runtime output in the ${platform} metafile: ${output}`);

      const file = path.resolve(base, directory, output);

      assert.ok(file.startsWith(base + path.sep), `Runtime output escapes distribution: ${output}`);
      assert.ok(!outputs.has(file), `Duplicate runtime output identity: ${output}`);
      outputs.set(file, details);
    }
  }

  async function load(file) {
    file = path.resolve(file);

    if (modules.has(file)) {
      return;
    }

    assert.ok(file.startsWith(base + path.sep), `Runtime import escapes distribution: ${file}`);

    const text = await readFile(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

    assert.equal(source.parseDiagnostics.length, 0, `Unparsed emitted JS: ${file}`);

    const details = outputs.get(file);
    const edges = [];
    const definitions = [];
    const requestTokens = [];
    const exports = [];

    function edge(specifier, kind) {
      assert.ok(
        !identitySpecifier(specifier),
        `Unresolved identity-relevant dependency: ${specifier}`,
      );

      if (!specifier.startsWith(".")) {
        assert.ok(isBuiltin(specifier), `Unclassified ESM dependency: ${specifier}`);

        return;
      }

      assert.ok(/\.(m?js)$/.test(specifier), `Unclassified runtime import: ${specifier}`);
      edges.push({ specifier, target: path.resolve(path.dirname(file), specifier), kind });
    }

    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) {
          assert.ok(ts.isStringLiteral(node.moduleSpecifier), `Unhandled static import: ${file}`);
          edge(node.moduleSpecifier.text, "static");
        }

        if (
          ts.isExportDeclaration(node) &&
          node.exportClause &&
          ts.isNamedExports(node.exportClause)
        ) {
          for (const exported of node.exportClause.elements) {
            exports.push(exported.name.text);
          }
        }
      }

      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];

        assert.ok(
          argument &&
            (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)),
          `Unhandled import expression: ${file}`,
        );
        assert.equal(node.arguments.length, 1, `Unhandled import options: ${file}`);
        edge(argument.text, "dynamic");
      }

      if (
        ts.isIdentifier(node) &&
        ["REQUEST", "REQUEST_CONTEXT", "RESPONSE_INIT"].includes(node.text)
      ) {
        requestTokens.push({
          name: node.text,
          declaration: ts.isVariableDeclaration(node.parent) && node.parent.name === node,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        });
      }

      if (ts.isClassDeclaration(node) && node.name) {
        definitions.push(node.name.text);
      }

      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isClassExpression(node.initializer)
      ) {
        definitions.push(node.name.text);
      }

      ts.forEachChild(node, visit);
    }

    visit(source);

    const contributions = [];

    if (details) {
      let metafileText = text;

      if (Buffer.byteLength(text) !== details.bytes) {
        // Angular's ordinary post-bundle ECMA-426 Debug ID comment is not executable code.
        const debug = text.match(
          /\n\/\/# debugId=([0-9a-f-]{36})(?=\n\/\/# sourceMappingURL=[^\n]+\n?$)/,
        );

        assert.ok(debug, `Unclassified post-bundle bytes: ${file}`);

        const map = JSON.parse(await readFile(file + ".map", "utf8"));

        assert.equal(map.debugId, debug[1], `Debug ID/source-map disagreement: ${file}`);
        metafileText = text.replace(debug[0], "");
      }

      assert.equal(
        Buffer.byteLength(metafileText),
        details.bytes,
        `Output executable bytes changed: ${file}`,
      );

      for (const imported of details.imports) {
        assert.ok(
          !imported.external || !identitySpecifier(imported.path),
          `External framework/APF identity: ${imported.path}`,
        );

        if (!imported.external) {
          assert.ok(
            edges.some((item) => item.target === path.resolve(path.dirname(file), imported.path)),
            `Native metafile edge omitted: ${file} -> ${imported.path}`,
          );
        }
      }

      for (const [input, contribution] of Object.entries(details.inputs)) {
        if (!contribution.bytesInOutput) {
          continue;
        }

        const resolved = path.resolve(workspaceDirectory, input);

        for (const library of librarySources) {
          assert.ok(!resolved.startsWith(library + path.sep), `Consumer source alias: ${input}`);
        }

        let identity = null;

        if (
          input.includes("/node_modules/@angular/core/") ||
          input.startsWith("node_modules/@angular/core/")
        ) {
          identity = "core";
        }

        if (
          input.includes("/node_modules/@loozo/origami-ui/") ||
          input.startsWith("node_modules/@loozo/origami-ui/")
        ) {
          identity = "apf";
        }

        if (identity) {
          contributions.push({
            identity,
            input,
            physical: await realpath(path.resolve(workspaceDirectory, input)),
            bytesInOutput: contribution.bytesInOutput,
          });
        }
      }
    } else {
      const relative = path.relative(base, file).replaceAll("\\", "/");
      const manifest = [
        "server/angular-app-engine-manifest.mjs",
        "server/angular-app-manifest.mjs",
      ].includes(relative);
      const asset = relative.startsWith("server/assets-chunks/");

      assert.ok(
        manifest || asset,
        `Unclassified runtime module without native provenance: ${file}`,
      );

      if (asset) {
        assert.ok(
          source.statements.length === 1 &&
            ts.isExportAssignment(source.statements[0]) &&
            (ts.isStringLiteral(source.statements[0].expression) ||
              ts.isNoSubstitutionTemplateLiteral(source.statements[0].expression)),
          `Unclassified generated asset code: ${file}`,
        );
      }
    }

    modules.set(file, {
      file,
      sha256: hash(text),
      edges,
      contributions,
      inputBytes: details?.inputs ?? {},
      definitions,
      requestTokens,
      exports,
      source,
    });

    for (const item of edges) {
      await load(item.target);
    }
  }

  return { base, metafiles, statsSha256, modules, outputs, load };
}

export function reachableModules(graph, entry, boundary = null) {
  const visited = new Set();

  function visit(file) {
    if (visited.has(file)) {
      return;
    }

    assert.ok(graph.modules.has(file), `Missing runtime module: ${file}`);
    visited.add(file);

    for (const edge of graph.modules.get(file).edges) {
      if (
        boundary &&
        file === boundary.from &&
        edge.target === boundary.to &&
        edge.kind === "dynamic"
      ) {
        continue;
      }

      visit(edge.target);
    }
  }

  visit(entry);

  return visited;
}

/** Single actual package identity and single emitted support input within this program context. */
export function inspectContext(graph, files, origins, { host = false, publicClasses = [] } = {}) {
  const contributions = { core: new Map(), apf: new Map() };
  const tokens = new Map();

  for (const file of files) {
    const module = graph.modules.get(file);

    for (const contribution of module.contributions) {
      assert.ok(
        contribution.physical.startsWith(origins[contribution.identity] + path.sep),
        `Wrong ${contribution.identity} package identity: ${contribution.physical}`,
      );
      assert.ok(
        !host || contribution.identity !== "apf",
        `Host APF outside verified boundary: ${file}`,
      );

      const rows = contributions[contribution.identity].get(contribution.physical) ?? [];

      rows.push({
        output: path.relative(graph.base, file),
        bytesInOutput: contribution.bytesInOutput,
      });
      contributions[contribution.identity].set(contribution.physical, rows);
    }

    for (const name of module.definitions) {
      for (const token of publicClasses) {
        if (name === token || (name.startsWith(token) && /^\d+$/.test(name.slice(token.length)))) {
          const rows = tokens.get(token) ?? [];

          rows.push({ output: path.relative(graph.base, file), name });
          tokens.set(token, rows);
        }
      }
    }

    if (host) {
      assert.ok(
        module.requestTokens.every((token) => token.declaration),
        `Host framework request token use crosses unreviewed boundary: ${file}`,
      );
    }
  }

  for (const [token, rows] of tokens) {
    assert.equal(rows.length, 1, `Duplicated application token: ${token}`);
  }

  for (const [identity, inputs] of Object.entries(contributions)) {
    for (const [input, rows] of inputs) {
      assert.equal(rows.length, 1, `Repeated ${identity} input/bytes within context: ${input}`);
    }
  }

  assert.ok(contributions.core.size > 0 || host, "Missing actual application Core evidence");

  return {
    modules: [...files].map((file) => path.relative(graph.base, file)).sort(),
    core: Object.fromEntries(contributions.core),
    apf: Object.fromEntries(contributions.apf),
    publicTokens: Object.fromEntries(tokens),
  };
}

function verifiedManifestBoundary(graph, appEntry, audit) {
  const from = path.join(graph.base, "server/angular-app-engine-manifest.mjs");
  const module = graph.modules.get(from);

  assert.ok(module, "Missing actual SDK engine manifest");

  // `--audit`: the exact reviewed SDK manifest shape. The normal check keeps the boundary itself:
  // one dynamic edge from the engine manifest to the actual application entry.
  if (audit) {
    assert.equal(module.source.statements.length, 1, "Unreviewed engine manifest statements");

    const exported = module.source.statements[0];

    assert.ok(
      ts.isExportAssignment(exported) && ts.isObjectLiteralExpression(exported.expression),
      "Unreviewed engine manifest export",
    );

    const properties = exported.expression.properties;

    assert.ok(
      properties.every(
        (property) =>
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)),
      ),
      "Unreviewed engine manifest property",
    );

    const names = properties.map((property) =>
      property.name.getText(module.source).replaceAll("'", "").replaceAll('"', ""),
    );

    assert.deepEqual(
      names.sort(),
      ["allowedHosts", "basePath", "entryPoints", "supportedLocales"],
      "Engine manifest boundary shape changed",
    );

    const entryPoints = properties.find(
      (property) => property.name.getText(module.source) === "entryPoints",
    ).initializer;

    assert.ok(
      ts.isObjectLiteralExpression(entryPoints) && entryPoints.properties.length === 1,
      "Unreviewed SDK application entrypoints",
    );

    const entry = entryPoints.properties[0];

    assert.ok(
      ts.isPropertyAssignment(entry) && ts.isStringLiteral(entry.name) && entry.name.text === "",
      "Unreviewed SDK entrypoint locale",
    );
    assert.ok(
      ts.isArrowFunction(entry.initializer) &&
        entry.initializer.parameters.length === 0 &&
        ts.isCallExpression(entry.initializer.body) &&
        entry.initializer.body.expression.kind === ts.SyntaxKind.ImportKeyword,
      "Unreviewed SDK dynamic factory boundary",
    );
  }

  assert.equal(module.edges.length, 1, "Unexpected engine manifest dependency");
  assert.equal(module.edges[0].kind, "dynamic");
  assert.equal(
    module.edges[0].target,
    appEntry,
    "SDK boundary does not target actual application entry",
  );

  return { from, to: appEntry, kind: "dynamic" };
}

export async function auditBundleContexts(
  metafiles,
  workspaceDirectory = path.resolve(".scratch/consumer"),
  { audit = false } = {},
) {
  // `--audit` only: byte pins of the reviewed SDK/builder/host sources.
  if (audit) {
    for (const [file, expected] of Object.entries(boundaryPins)) {
      assert.equal(
        hash(await readFile(file)),
        expected,
        `SDK/host boundary changed; source review required: ${file}`,
      );
    }
  }

  const origins = await consumerOrigins();
  const publicClasses = [];

  for (const file of await readdir(path.join(origins.apf, "types"))) {
    if (!file.endsWith(".d.ts")) {
      continue;
    }

    const source = ts.createSourceFile(
      file,
      await readFile(path.join(origins.apf, "types", file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );

    for (const node of source.statements) {
      if (ts.isClassDeclaration(node) && node.name?.text.startsWith("Origami")) {
        publicClasses.push(node.name.text);
      }
    }
  }

  assert.equal(publicClasses.length, 66, "Packaged token inventory changed; review required");

  assert.deepEqual(
    Object.keys(metafiles).sort(),
    ["browser", "server"],
    "Both actual platform metafiles are required",
  );

  const graph = await loadRuntimeGraph(metafiles, workspaceDirectory);
  const browserEntries = [...graph.outputs].filter(
    ([, details]) => details.entryPoint === "src/main.ts",
  );

  assert.equal(browserEntries.length, 1, "Missing/ambiguous actual browser main entry");

  const browserEntry = browserEntries[0][0];
  const appEntry = path.join(graph.base, "server/main.server.mjs");
  const hostEntry = path.join(graph.base, "server/server.mjs");

  assert.equal(
    graph.outputs.get(appEntry)?.entryPoint,
    "angular:main-server:angular:main-server",
    "Missing actual bootstrap entry",
  );
  assert.equal(
    graph.outputs.get(hostEntry)?.entryPoint,
    "angular:ssr-entry:angular:ssr-entry",
    "Missing actual SDK hosting entry",
  );
  await graph.load(browserEntry);
  await graph.load(appEntry);
  await graph.load(hostEntry);
  assert.ok(
    graph.modules.get(appEntry).exports.includes("ɵgetOrCreateAngularServerApp"),
    "Missing application-bound factory export",
  );

  const boundary = verifiedManifestBoundary(graph, appEntry, audit);
  const hostFiles = reachableModules(graph, hostEntry, boundary);

  assert.ok(
    hostFiles.has(boundary.from),
    "Hosting graph does not reach verified SDK engine manifest",
  );
  assert.ok(!hostFiles.has(appEntry), "Unverified host path bypasses factory boundary");

  let sawAuthoredHost = false;
  const hostedSdkInputs = new Set();

  for (const file of hostFiles) {
    for (const [input, contribution] of Object.entries(graph.modules.get(file).inputBytes)) {
      if (!contribution.bytesInOutput) {
        continue;
      }

      const resolved = path.resolve(workspaceDirectory, input);

      if (resolved.startsWith(path.resolve(".scratch/consumer/src") + path.sep)) {
        assert.equal(
          resolved,
          path.resolve(".scratch/consumer/src/server.ts"),
          `Unreviewed authored hosting/DI/hook context: ${input}`,
        );
        sawAuthoredHost = true;
      }

      if (
        input.endsWith("@angular/ssr/fesm2022/node.mjs") ||
        input.endsWith("@angular/ssr/fesm2022/ssr.mjs")
      ) {
        assert.ok(
          resolved.startsWith(
            path.resolve(".scratch/consumer/node_modules/@angular/ssr") + path.sep,
          ),
          `Unverified hosting SDK origin: ${input}`,
        );
        hostedSdkInputs.add(path.basename(input));
      }
    }
  }

  assert.ok(sawAuthoredHost, "Missing reviewed authored hosting source evidence");
  assert.deepEqual(
    [...hostedSdkInputs].sort(),
    ["node.mjs", "ssr.mjs"],
    "Missing reviewed actual hosting SDK call provenance",
  );

  const appFiles = reachableModules(graph, appEntry);
  const browserFiles = reachableModules(graph, browserEntry);
  const host = inspectContext(graph, hostFiles, origins, { host: true, publicClasses });
  const application = inspectContext(graph, appFiles, origins, { publicClasses });
  const browser = inspectContext(graph, browserFiles, origins, { publicClasses });

  for (const context of [application, browser]) {
    assert.equal(
      Object.keys(context.apf).length,
      11,
      "Missing complete installed APF support input evidence",
    );

    if (graph.base.endsWith("-development")) {
      assert.deepEqual(
        Object.keys(context.publicTokens).sort(),
        [...publicClasses].sort(),
        "Missing development public token definition evidence",
      );
    }
  }

  const unusedSdkXhrOutputs = [];

  // `--audit` only: every emitted runtime output is classified (unreachable outputs never run).
  if (audit) {
    const classified = new Set([...hostFiles, ...appFiles, ...browserFiles]);

    for (const [file, details] of graph.outputs) {
      if (classified.has(file)) {
        continue;
      }

      // The separate SDK host compilation also emits its unused xhr2 lazy entry.
      // Classify that exact pinned, non-framework support artifact; arbitrary orphans fail.
      assert.equal(
        details.entryPoint,
        "node_modules/xhr2/lib/xhr2.js",
        `Unclassified runtime output: ${file}`,
      );
      assert.deepEqual(
        Object.keys(details.inputs),
        ["node_modules/xhr2/lib/xhr2.js"],
        `Unreviewed SDK support output: ${file}`,
      );
      await graph.load(file);

      const supportFiles = reachableModules(graph, file);

      for (const support of supportFiles) {
        assert.equal(
          graph.modules.get(support).contributions.length,
          0,
          `Framework/APF code in unused SDK XHR output: ${support}`,
        );
        classified.add(support);
      }

      unusedSdkXhrOutputs.push({
        output: path.relative(graph.base, file),
        entryPoint: details.entryPoint,
        sha256: graph.modules.get(file).sha256,
      });
    }

    assert.ok(unusedSdkXhrOutputs.length <= 1, "Unreviewed extra SDK support programs");
  }

  // Preserve the former global all-mjs ledger, including genuine SDK debug overlap.
  const globalCore = new Map();

  for (const file of new Set([...hostFiles, ...appFiles])) {
    for (const contribution of graph.modules.get(file).contributions) {
      if (contribution.identity === "core") {
        const rows = globalCore.get(contribution.physical) ?? [];

        rows.push({
          output: path.relative(graph.base, file),
          bytesInOutput: contribution.bytesInOutput,
        });
        globalCore.set(contribution.physical, rows);
      }
    }
  }

  return {
    metafiles,
    workspaceDirectory,
    origins,
    statsSha256: graph.statsSha256,
    audit,
    boundary,
    host,
    application,
    browser,
    unusedSdkXhrOutputs,
    globalServerCoreContributions: Object.fromEntries(globalCore),
    globalServerCoreOverlap: [...globalCore].filter(([, rows]) => rows.length > 1),
    modules: [...graph.modules.values()].map(({ source: _source, ...record }) => record),
  };
}
