import ts from "typescript";
import { realpath } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { auditPath, contains } from "./files.js";
import { fail, properties, resolveModule, type Declaration, type Sources } from "./sources.js";
import type { Segment } from "../../_core/src/path.js";
import { overlayHost } from "./overlay.js";
import type { CompilerState } from "./compiler.js";
import { AnchorState } from "./anchor.js";

export function authoredPath(declaration: Declaration): string {
  const parts: string[] = [];

  for (const segment of declaration.effective) {
    if (segment.kind === "static") {
      parts.push(segment.text);
    } else if (segment.kind === "catchall") {
      parts.push(`$${segment.name}[]`);
    } else {
      parts.push(`$${segment.name}`);
    }
  }

  return `/${parts.join("/")}`;
}

function compatible(a: Segment, b: Segment): boolean {
  return a.kind !== "static" || b.kind !== "static" || a.text === b.text;
}

function ancestor(a: Declaration, b: Declaration): boolean {
  let parent = b.parent;

  while (parent) {
    if (parent === a) {
      return true;
    }

    parent = parent.parent;
  }

  return false;
}

export function selections(sources: Sources): Map<string, Declaration> {
  const declarations = sources.declarations.filter(
    (declaration) => declaration.retained || declaration.target,
  );

  for (let left = 0; left < declarations.length; left += 1) {
    const a = declarations[left];

    for (let right = left + 1; right < declarations.length; right += 1) {
      const b = declarations[right];
      const catchA = a.effective.at(-1)?.kind === "catchall";
      const catchB = b.effective.at(-1)?.kind === "catchall";

      if (catchA || catchB) {
        if (catchA && catchB) {
          let scopeA = a.parent;
          let scopeB = b.parent;

          if (a.target) {
            scopeA = undefined;
          }

          if (b.target) {
            scopeB = undefined;
          }

          if (scopeA === scopeB) {
            const length = Math.min(a.effective.length, b.effective.length) - 1;
            let overlap = true;

            for (let index = 0; index < length; index += 1) {
              if (!compatible(a.effective[index], b.effective[index])) {
                overlap = false;
              }
            }

            if (overlap) {
              fail(a.source, `Competing sibling catchalls: ${a.id}; ${b.id}`);
            }
          }
        }

        continue;
      }

      if (a.effective.length !== b.effective.length) {
        continue;
      }

      let overlap = true;

      for (let index = 0; index < a.effective.length; index += 1) {
        if (!compatible(a.effective[index], b.effective[index])) {
          overlap = false;
        }
      }

      if (overlap && !ancestor(a, b) && !ancestor(b, a)) {
        fail(
          a.source,
          `Ordinary route collision/overlap: ${a.id} (${authoredPath(a)}); ${b.id} (${authoredPath(b)})`,
        );
      }
    }
  }

  const groups = new Map<string, Declaration[]>();

  for (const declaration of declarations) {
    const path = authoredPath(declaration);
    const group = groups.get(path) ?? [];

    group.push(declaration);
    groups.set(path, group);
  }

  const result = new Map<string, Declaration>();

  for (const [path, group] of groups) {
    if (group.length === 1) {
      result.set(path, group[0]);

      if (group[0].path === "" && !group[0].children.some((child) => child.retained)) {
        group[0].full = true;
      }

      continue;
    }

    const leaf = group.find((declaration) => !declaration.children.some((child) => child.retained));

    if (leaf && leaf.path === "") {
      leaf.full = true;
      result.set(path, leaf);
    }
  }

  for (const declaration of declarations) {
    if (declaration.target) {
      if (
        (!declaration.target.retained && !declaration.target.target) ||
        result.get(authoredPath(declaration.target)) !== declaration.target
      ) {
        fail(
          declaration.source,
          `Redirect target is pruned or not the canonical shared-path target: ${declaration.target.id}`,
        );
      }
    }
  }

  return result;
}

// Overlay only final generated locations. Never evaluate application code.
export function createValidationProgram(
  sources: Sources,
  generated: ReadonlyMap<string, string>,
  stale: readonly string[],
  compiler?: CompilerState,
) {
  const options = { ...sources.parsed.options };

  if (sources.launch) {
    options.skipLibCheck = false;
  }

  const host = overlayHost(options, sources.authored);
  const originalRead = host.readFile.bind(host);
  const originalExists = host.fileExists.bind(host);
  const originalDirectoryExists = host.directoryExists!.bind(host);

  host.directoryExists = (directory) => {
    for (const file of generated.keys()) {
      if (contains(resolve(directory), file)) {
        return true;
      }
    }

    return originalDirectoryExists(directory);
  };

  const obsolete = new Set(stale);

  host.readFile = (file) => {
    const path = resolve(file);

    if (obsolete.has(path)) {
      return "";
    }

    return generated.get(path) ?? originalRead(file);
  };
  host.fileExists = (file) => generated.has(resolve(file)) || originalExists(file);
  host.getSourceFile = (file, language) => {
    const text = host.readFile(file);

    if (text === undefined) {
      return undefined;
    }

    return ts.createSourceFile(file, text, language, true);
  };

  const rootNames = [
    ...sources.parsed.fileNames.filter((file) => !obsolete.has(resolve(file))),
    sources.factoryEntry,
  ];

  if (sources.launch) {
    rootNames.push(sources.launch.typeEntry, ...generated.keys());
  }

  let program: ts.Program;

  if (compiler) {
    program = compiler.createProgram(rootNames, options, host);
  } else {
    program = ts.createProgram({ rootNames, options, host });
  }

  return { program, host, obsolete };
}

export async function validateRoutes(
  sources: Sources,
  generated: ReadonlyMap<string, string>,
  validation: ReturnType<typeof createValidationProgram>,
  canonical?: AnchorState,
): Promise<void> {
  const { program, host, obsolete } = validation;

  if (sources.filesystem) {
    const diagnostics: ts.Diagnostic[] = [];

    for (const declaration of sources.declarations) {
      const source = program.getSourceFile(declaration.file)!;

      diagnostics.push(
        ...program.getSyntacticDiagnostics(source),
        ...program.getSemanticDiagnostics(source),
      );
    }

    if (diagnostics.length > 0) {
      throw new Error(
        ts.formatDiagnostics(diagnostics, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => dirname(sources.configFile),
          getNewLine: () => "\n",
        }),
      );
    }
  }

  const checker = program.getTypeChecker();

  const entry = program.getSourceFile(sources.factoryEntry)!;
  const entryModule = checker.getSymbolAtLocation(entry)!;
  const exportedFactory = checker
    .getExportsOfModule(entryModule)
    .find((symbol) => symbol.name === "defineRoute")!;
  let concreteFactory = exportedFactory;

  if (exportedFactory.flags & ts.SymbolFlags.Alias) {
    concreteFactory = checker.getAliasedSymbol(exportedFactory);
  }

  // Anchor the public export's declaration independently of application paths,
  // which can also redirect imports inside the concrete public type entry.
  const canonicalOptions = { ...sources.parsed.options, paths: undefined, baseUrl: undefined };
  const anchor = await (canonical ?? new AnchorState()).anchor(
    sources.factoryEntry,
    ["defineRoute"],
    canonicalOptions,
  );
  const canonicalFactory = anchor.get("defineRoute");

  // Tentative own-facade admission is not authority for its re-exported binding.
  // Prove both the concrete module boundary and the final native alias identity.
  for (const declaration of sources.declarations) {
    const source = program.getSourceFile(declaration.file)!;
    const assignment = source.statements.find(ts.isExportAssignment)!;
    const call = assignment.expression as ts.CallExpression;

    if (sources.deferredFactories.includes(declaration)) {
      const facade = program.getSourceFile(
        resolve(dirname(declaration.file), "route.generated.ts"),
      )!;
      const reexport = facade.statements.find(
        (statement): statement is ts.ExportDeclaration =>
          ts.isExportDeclaration(statement) &&
          !!statement.exportClause &&
          ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.some((element) => element.name.text === "defineRoute"),
      )!;
      const moduleSpecifier = reexport.moduleSpecifier as ts.StringLiteral;
      const resolved = resolveModule(
        moduleSpecifier.text,
        facade.fileName,
        sources.parsed.options,
        host,
      );

      if (!resolved || (await realpath(resolved)) !== sources.factoryEntry) {
        fail(call, "Factory facade does not re-export this package's concrete public entry");
      }
    }

    const importedFactory = checker.getSymbolAtLocation(call.expression);
    let actualFactory = importedFactory;

    if (importedFactory && importedFactory.flags & ts.SymbolFlags.Alias) {
      actualFactory = checker.getAliasedSymbol(importedFactory);
    }

    if (
      !actualFactory?.declarations?.length ||
      actualFactory !== concreteFactory ||
      actualFactory.declarations.length !== canonicalFactory?.length
    ) {
      fail(call, "Factory binding does not resolve to the concrete defineRoute export");
    }

    for (let index = 0; index < actualFactory.declarations.length; index += 1) {
      const actual = actualFactory.declarations[index];
      const canonical = canonicalFactory[index];
      const actualFile = await realpath(actual.getSourceFile().fileName);

      if (
        actualFile !== canonical.file ||
        actual.kind !== canonical.kind ||
        actual.pos !== canonical.pos ||
        actual.end !== canonical.end
      ) {
        fail(call, "Factory binding is not the concrete defineRoute declaration");
      }
    }
  }

  const globalTargets = new Set([
    resolve(sources.output, "routes.generated.ts"),
    resolve(sources.output, "destinations.generated.ts"),
  ]);

  if (sources.launch) {
    globalTargets.add(resolve(sources.output, "context.generated.d.ts"));
    globalTargets.add(resolve(sources.output, "server.generated.ts"));
  }

  for (const source of program.getSourceFiles()) {
    if (
      source.fileName.includes("/node_modules/") ||
      program.isSourceFileFromExternalLibrary(source) ||
      program.isSourceFileDefaultLibrary(source)
    ) {
      continue;
    }

    if (!generated.has(resolve(source.fileName))) {
      await auditPath(source.fileName);
    }

    const references: ts.StringLiteralLike[] = [];

    function visit(node: ts.Node): void {
      let specifier: ts.Node | undefined;

      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        specifier = node.moduleSpecifier;
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        specifier = node.arguments[0];
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        specifier = node.argument.literal;
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        specifier = node.moduleReference.expression;
      }

      if (specifier && ts.isStringLiteralLike(specifier)) {
        references.push(specifier);
      }

      ts.forEachChild(node, visit);
    }

    visit(source);

    for (const specifier of references) {
      const name = specifier.text;
      const candidates = new Set<string>();
      const resolutionHost: ts.ModuleResolutionHost = {
        ...host,
        // Omit the optional directory shortcut so native resolution probes files
        // even below absent directories. Observe only; never invent existence.
        directoryExists: undefined,
        fileExists(file) {
          candidates.add(resolve(file));

          return host.fileExists(file);
        },
      };
      const file = ts.resolveModuleName(
        name,
        source.fileName,
        sources.parsed.options,
        resolutionHost,
        undefined,
        undefined,
        program.getModeForUsageLocation(source, specifier),
      ).resolvedModule?.resolvedFileName;

      if (file && obsolete.has(resolve(file))) {
        fail(specifier, `Generated import is not a retained owned target: ${name}`);
      }

      if (file) {
        // A real resolved module wins over earlier failed search candidates.
        candidates.clear();
        candidates.add(resolve(file));
      }

      for (const candidate of candidates) {
        const facadeTarget =
          (basename(candidate) === "route.generated.ts" ||
            (sources.launch && basename(candidate) === "rpc.generated.ts")) &&
          !candidate.split(sep).includes("node_modules") &&
          sources.roots.some((root) => contains(root, candidate));

        if ((facadeTarget || globalTargets.has(candidate)) && !generated.has(candidate)) {
          fail(specifier, `Generated import is not a retained owned target: ${name}`);
        }
      }

      if (!file) {
        const symbol = checker.getSymbolAtLocation(specifier);
        const declaredAmbient = symbol?.declarations?.some(
          (node) => ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name),
        );

        // Let the native checker resolve exact/pattern ambient declarations.
        // Unknown/error placeholders have no actual declared module binding.
        if (!symbol || !(symbol.flags & ts.SymbolFlags.Module) || !declaredAmbient) {
          fail(specifier, `Unresolved import: ${name}`);
        }
      }

      if (file && !file.includes("/node_modules/") && !generated.has(resolve(file))) {
        await auditPath(file);
      }
    }
  }

  function typeWitness(declaration: Declaration, name: string): ts.Type {
    const source = program.getSourceFile(declaration.file)!;
    const module = checker.getSymbolAtLocation(source)!;
    let symbol = checker.getExportsOfModule(module).find((value) => value.name === "default")!;

    if (symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }

    const type = checker.getTypeOfSymbolAtLocation(symbol, source);
    const witness = type.getProperty(name);

    if (!witness) {
      fail(source, `Cannot infer route ${name} for redirect compatibility`);
    }

    return checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(witness, source));
  }

  function entryType(type: ts.Type, key: string, node: ts.Node): ts.Type {
    const property = type.getProperty(key);

    if (!property) {
      fail(node, `Redirect input key is not declared: ${key}`);
    }

    return checker.getTypeOfSymbolAtLocation(property, node);
  }

  for (const declaration of sources.declarations) {
    if (!declaration.target) {
      continue;
    }

    const redirect = declaration.config.get("redirect")!;
    const programSource = program.getSourceFile(declaration.file)!;
    const assignment = programSource.statements.find(ts.isExportAssignment)!;
    const config = properties(
      (assignment.expression as ts.CallExpression).arguments[1],
      "Route config",
    );
    const fields = properties(config.get("redirect")!, "Redirect");
    const sourceParams = typeWitness(declaration, "__params");
    const targetParams = typeWitness(declaration.target, "__params");
    const mapping = fields.get("params");
    let supplied: Map<string, ts.Expression> | undefined;

    if (mapping) {
      supplied = properties(mapping, "Redirect params");

      for (const key of supplied.keys()) {
        if (!targetParams.getProperty(key)) {
          fail(mapping, `Unknown redirect mapping key: ${key}`);
        }
      }
    }

    for (const targetKey of targetParams.getProperties()) {
      let sourceKey = targetKey.name;

      if (supplied) {
        const expression = supplied.get(targetKey.name);

        if (!expression || !ts.isStringLiteral(expression)) {
          fail(mapping!, `Missing/nonliteral redirect mapping: ${targetKey.name}`);
        }

        sourceKey = expression.text;
      }

      const from = entryType(sourceParams, sourceKey, redirect);
      const to = checker.getTypeOfSymbolAtLocation(targetKey, redirect);

      if (!checker.isTypeAssignableTo(from, to)) {
        fail(redirect, `Incompatible logical redirect params: ${sourceKey} -> ${targetKey.name}`);
      }
    }

    // Every search key is optional when writing a URL, so only replacement values need checking.
    const targetSearch = typeWitness(declaration.target, "__search");
    const search = fields.get("search");
    const fragment = fields.get("fragment");

    if (!search || !fragment) {
      fail(redirect, "Redirect requires search and fragment policies");
    }

    const policy = properties(search, "Redirect search");
    const mode = policy.get("mode");

    if (
      !mode ||
      !ts.isStringLiteral(mode) ||
      !["drop", "preserve", "replace"].includes(mode.text)
    ) {
      fail(search, "Invalid redirect search mode");
    }

    for (const key of policy.keys()) {
      if (key !== "mode" && (mode.text !== "replace" || key !== "values")) {
        fail(search, `Unknown redirect search policy key: ${key}`);
      }
    }

    const fragmentPolicy = properties(fragment, "Redirect fragment");
    const fragmentMode = fragmentPolicy.get("mode");

    if (
      !fragmentMode ||
      !ts.isStringLiteral(fragmentMode) ||
      !["preserve", "drop", "replace"].includes(fragmentMode.text)
    ) {
      fail(fragment, "Invalid redirect fragment mode");
    }

    for (const key of fragmentPolicy.keys()) {
      if (key !== "mode" && (fragmentMode.text !== "replace" || key !== "value")) {
        fail(fragment, `Unknown redirect fragment policy key: ${key}`);
      }
    }

    if (fragmentMode.text === "replace") {
      const value = fragmentPolicy.get("value");
      const targetSource = program.getSourceFile(declaration.target.file)!;
      const targetAssignment = targetSource.statements.find(ts.isExportAssignment)!;
      const targetConfig = properties(
        (targetAssignment.expression as ts.CallExpression).arguments[1],
        "Route config",
      );
      const names = targetConfig.get("fragments");

      if (!value || !names) {
        fail(fragment, "Fragment replacement requires a destination-declared name");
      }

      const allowed = checker.getIndexTypeOfType(
        checker.getTypeAtLocation(names),
        ts.IndexKind.Number,
      );

      if (!allowed || !checker.isTypeAssignableTo(checker.getTypeAtLocation(value), allowed)) {
        fail(value, "Redirect replacement fragment is not declared by its destination");
      }
    }

    if (mode.text === "replace") {
      const values = policy.get("values");

      if (!values) {
        fail(search, "Redirect replacement requires values");
      }

      const type = checker.getTypeAtLocation(values);

      for (const key of type.getProperties()) {
        const targetKey = targetSearch.getProperty(key.name);

        if (!targetKey) {
          fail(values, `Unknown/incompatible redirect replacement key: ${key.name}`);
        }

        // Replacements use the write type, `Value | undefined`: undefined omits the key, even
        // one that reads a fallback, so only the other constituents must be codec values.
        const supplied = checker.getTypeOfSymbolAtLocation(key, values);
        const target = checker.getTypeOfSymbolAtLocation(targetKey, values);
        let constituents = [supplied];

        if (supplied.isUnion()) {
          constituents = supplied.types;
        }

        for (const constituent of constituents) {
          if (
            !(constituent.flags & ts.TypeFlags.Undefined) &&
            !checker.isTypeAssignableTo(constituent, target)
          ) {
            fail(values, `Unknown/incompatible redirect replacement key: ${key.name}`);
          }
        }
      }
    }
  }

  // Native Bundler resolution must preserve the discovered lazy component identity.
  const routesFile = resolve(sources.output, "routes.generated.ts");
  const routes = program.getSourceFile(routesFile);

  if (routes) {
    const promises: Promise<void>[] = [];

    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const name = node.arguments[0].text;
        const resolved = resolveModule(name, routesFile, sources.parsed.options, host);

        if (
          !resolved ||
          !sources.declarations.some((declaration) => declaration.page === resolved)
        ) {
          fail(node, `Lazy page import does not resolve to its discovered component: ${name}`);
        }

        promises.push(realpath(resolved).then(() => undefined));
      }

      ts.forEachChild(node, visit);
    }

    visit(routes);
    await Promise.all(promises);
  }
}
