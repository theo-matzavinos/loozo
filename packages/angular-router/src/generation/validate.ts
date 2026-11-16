import ts from "typescript";
import { realpath } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import {
  auditPath,
  contains,
  holdsAny,
  routeFiles,
  specifier as importSpecifier,
} from "./files.js";
import { moduleReferences, RuntimeGraph, type Edge, type ModuleReference } from "./graph.js";
import {
  fail,
  failAt,
  factoryAnnotation,
  isPackageRoot,
  namedImport,
  properties,
  resolveModule,
  routeChain,
  unalias,
  type Declaration,
  type Sources,
} from "./sources.js";
import type { Segment } from "../../_core/src/path.js";
import { overlayHost } from "./overlay.js";
import type { CompilerState } from "./compiler.js";
import { AnchorState, type Anchor, type AnchoredDeclaration } from "./anchor.js";

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

  const holdsGenerated = holdsAny(generated.keys());

  host.directoryExists = (directory) =>
    holdsGenerated(directory) || originalDirectoryExists(directory);

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
  } else {
    // Every copy is validated, whether or not anything imports it yet.
    for (const file of generated.keys()) {
      if (routeFiles.has(basename(file))) {
        rootNames.push(file);
      }
    }
  }

  let program: ts.Program;

  if (compiler) {
    program = compiler.createProgram(rootNames, options, host);
  } else {
    program = ts.createProgram({ rootNames, options, host });
  }

  return { program, host, obsolete };
}

// The default-exported chain of a declaration in the validation program.
function chainOf(program: ts.Program, declaration: Declaration) {
  const source = program.getSourceFile(declaration.file)!;
  const assignment = source.statements.find(ts.isExportAssignment)!;

  return routeChain(assignment.expression);
}

async function matches(
  symbol: ts.Symbol | undefined,
  anchor: readonly AnchoredDeclaration[] | undefined,
): Promise<boolean> {
  if (!symbol?.declarations?.length || symbol.declarations.length !== anchor?.length) {
    return false;
  }

  for (let index = 0; index < symbol.declarations.length; index += 1) {
    const actual = symbol.declarations[index];
    const expected = anchor[index];
    const file = await realpath(actual.getSourceFile().fileName);

    if (
      file !== expected.file ||
      actual.kind !== expected.kind ||
      actual.pos !== expected.pos ||
      actual.end !== expected.end
    ) {
      return false;
    }
  }

  return true;
}

async function physical(file: string | undefined): Promise<string | undefined> {
  if (file === undefined) {
    return undefined;
  }

  return realpath(file);
}

type PassAnchors = (
  entry: string,
  names: readonly string[],
  options: ts.CompilerOptions,
) => Promise<Anchor>;

// Extension and /_core anchors for one validation pass: each distinct (entry, names,
// options) builds its program once per pass, however many routes use it. A new pass
// starts empty, so dependency edits between passes are still picked up.
function passAnchors(): PassAnchors {
  const built = new Map<string, Promise<Anchor>>();

  return (entry, names, options) => {
    const { configFile: _configFile, ...settings } = options;
    const key = JSON.stringify({ entry, names, settings });
    let anchor = built.get(key);

    if (!anchor) {
      anchor = new AnchorState().anchor(entry, names, options);
      built.set(key, anchor);
    }

    return anchor;
  };
}

/**
 * Authenticates an extension factory from declarations alone: a package-root import of
 * that package's anchored defineRoute export, declared as the router's own RouteFactory
 * from its physical `/_core` types entry. The router's entries must be the anchored ones.
 */
async function authenticateExtension(
  root: ts.CallExpression,
  sources: Sources,
  program: ts.Program,
  host: ts.ModuleResolutionHost,
  routerFactory: ts.Symbol,
  routerAnchor: readonly AnchoredDeclaration[] | undefined,
  anchors: PassAnchors,
): Promise<void> {
  const checker = program.getTypeChecker();
  const source = root.getSourceFile();
  const imported = namedImport(source, root.expression, "defineRoute")!;
  const specifier = (imported.moduleSpecifier as ts.StringLiteral).text;
  const options = sources.parsed.options;
  const canonicalOptions = { ...options, paths: undefined, baseUrl: undefined };

  if (!isPackageRoot(specifier)) {
    fail(imported, "Factory import must name a concrete package public entry");
  }

  const actualEntry = await physical(resolveModule(specifier, source.fileName, options, host));
  const expectedEntry = await physical(resolveModule(specifier, source.fileName, canonicalOptions));

  if (!actualEntry || !expectedEntry || actualEntry !== expectedEntry) {
    fail(imported, "Factory import does not resolve to the canonical package public entry");
  }

  const factory = unalias(checker, checker.getSymbolAtLocation(root.expression));
  const entry = program.getSourceFile(actualEntry);
  const entryModule = entry && checker.getSymbolAtLocation(entry);
  let exported: ts.Symbol | undefined;

  if (entryModule) {
    exported = unalias(
      checker,
      checker.getExportsOfModule(entryModule).find((symbol) => symbol.name === "defineRoute"),
    );
  }

  const entryAnchor = await anchors(expectedEntry, ["defineRoute"], canonicalOptions);

  if (
    !factory ||
    factory !== exported ||
    !(await matches(factory, entryAnchor.get("defineRoute")))
  ) {
    fail(root, "Factory is not the anchored public defineRoute export");
  }

  const appRouter = await physical(
    resolveModule("@loozo/angular-router", source.fileName, options, host),
  );

  if (appRouter !== sources.factoryEntry) {
    fail(root, "Application router specifier does not resolve to the anchored router public entry");
  }

  if (!(await matches(routerFactory, routerAnchor))) {
    fail(root, "Router public export was redirected away from its anchored declaration");
  }

  const appCore = await physical(
    resolveModule("@loozo/angular-router/_core", source.fileName, options, host),
  );

  if (appCore !== sources.coreEntry) {
    fail(
      root,
      "Application router /_core specifier does not resolve to the anchored physical /_core types entry",
    );
  }

  const annotation = factoryAnnotation(checker, root);

  // A public-entry RouteFactory fails the extension's own compile; name it precisely.
  if (publicFactory(factory.valueDeclaration?.getSourceFile(), annotation)) {
    fail(
      root,
      "RouteFactory is not exported by @loozo/angular-router; import it from @loozo/angular-router/_core",
    );
  }

  let declared: ts.Symbol | undefined;

  if (annotation && ts.isTypeReferenceNode(annotation)) {
    declared = unalias(checker, checker.getSymbolAtLocation(annotation.typeName));
  } else if (annotation?.qualifier) {
    declared = unalias(checker, checker.getSymbolAtLocation(annotation.qualifier));
  }

  const coreAnchor = await anchors(sources.coreEntry, ["RouteFactory"], canonicalOptions);

  if (!annotation || !(await matches(declared, coreAnchor.get("RouteFactory")))) {
    fail(
      root,
      "Factory annotation must reference RouteFactory from the anchored physical router /_core types entry",
    );
  }

  if (annotation.typeArguments?.length !== 1) {
    fail(root, "RouteFactory requires one explicit manifest spec type argument");
  }
}

// Whether the factory's declaration file names RouteFactory from the public entry: a
// named import or an inline import("@loozo/angular-router").RouteFactory annotation.
function publicFactory(
  file: ts.SourceFile | undefined,
  annotation: ts.TypeReferenceNode | ts.ImportTypeNode | undefined,
): boolean {
  if (
    annotation &&
    ts.isImportTypeNode(annotation) &&
    ts.isLiteralTypeNode(annotation.argument) &&
    ts.isStringLiteral(annotation.argument.literal) &&
    annotation.argument.literal.text === "@loozo/angular-router" &&
    annotation.qualifier &&
    ts.isIdentifier(annotation.qualifier) &&
    annotation.qualifier.text === "RouteFactory"
  ) {
    return true;
  }

  return (file?.statements ?? []).some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@loozo/angular-router"
    ) {
      return false;
    }

    const bindings = statement.importClause?.namedBindings;

    return (
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) => (element.propertyName ?? element.name).text === "RouteFactory",
      )
    );
  });
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
  const anchors = passAnchors();

  // Prove both the concrete module boundary and the final native alias identity.
  for (const declaration of sources.declarations) {
    const call = chainOf(program, declaration).root;

    if (declaration.extension) {
      await authenticateExtension(
        call,
        sources,
        program,
        host,
        concreteFactory,
        canonicalFactory,
        anchors,
      );

      continue;
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

  const globalTargets = new Set([resolve(sources.output, "routes.generated.ts")]);

  if (sources.launch) {
    globalTargets.add(resolve(sources.output, "context.generated.d.ts"));
    globalTargets.add(resolve(sources.output, "server.generated.ts"));
  }

  const declarations = new Map<string, Declaration>();

  for (const declaration of sources.declarations) {
    declarations.set(declaration.file, declaration);
  }

  // A declaration module has exactly its default export.
  for (const declaration of sources.declarations) {
    const source = program.getSourceFile(declaration.file)!;

    for (const statement of source.statements) {
      if (exportsBesidesDefault(statement)) {
        fail(statement, "Route declaration module may only default-export its route");
      }
    }
  }

  const verbatim = sources.parsed.options.verbatimModuleSyntax === true;
  const scanned: ts.SourceFile[] = [];

  for (const source of program.getSourceFiles()) {
    if (
      !source.fileName.includes("/node_modules/") &&
      !program.isSourceFileFromExternalLibrary(source) &&
      !program.isSourceFileDefaultLibrary(source)
    ) {
      scanned.push(source);
    }
  }

  const runtime = new RuntimeGraph(program, host);
  const outside: string[] = [];

  // Authored files first, so an authored import is reported at the author's line rather
  // than through the copy that repeats it.
  scanned.sort(
    (a, b) =>
      Number(generated.has(resolve(a.fileName))) - Number(generated.has(resolve(b.fileName))),
  );

  // The import rule: a declaration module is imported only by its child, as that child's
  // parent default import; nothing else in the program may reference it in any form.
  function importRule(source: ts.SourceFile, reference: ModuleReference, target: string): void {
    const declaration = declarations.get(target);

    if (!declaration) {
      return;
    }

    const importer = declarations.get(resolve(source.fileName));
    const statement = reference.specifier?.parent;

    if (
      importer?.parent === declaration &&
      importer.parentImport &&
      statement &&
      ts.isImportDeclaration(statement) &&
      statement.getStart(source) === importer.parentImport.getStart(importer.source) &&
      !statement.importClause?.isTypeOnly &&
      statement.importClause?.name &&
      !statement.importClause.namedBindings
    ) {
      return;
    }

    if (generated.has(resolve(source.fileName))) {
      failAt(
        source,
        reference.position,
        `Generated file imports a route declaration: ${reference.text}`,
      );
    }

    const destination = importSpecifier(
      source.fileName,
      resolve(dirname(target), "destination.generated.ts"),
    );

    failAt(
      source,
      reference.position,
      `Import of a route declaration: ${reference.text}. Import its destination from ${destination} instead.`,
    );
  }

  for (const source of scanned) {
    if (!generated.has(resolve(source.fileName))) {
      await auditPath(source.fileName);
    }

    for (const reference of moduleReferences(source, verbatim)) {
      if (reference.computed) {
        failAt(source, reference.position, `Computed module specifier: ${reference.text}`);
      }

      if (reference.form === "reference") {
        importRule(source, reference, resolve(dirname(source.fileName), reference.text));

        continue;
      }

      const specifier = reference.specifier!;
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
      let mode = program.getModeForUsageLocation(source, specifier);

      if (reference.form === "require" || reference.form === "import =") {
        mode = ts.ModuleKind.CommonJS;
      }

      const resolved = ts.resolveModuleName(
        name,
        source.fileName,
        sources.parsed.options,
        resolutionHost,
        undefined,
        undefined,
        mode,
      ).resolvedModule;
      const file = resolved?.resolvedFileName;

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
          (routeFiles.has(basename(candidate)) ||
            (sources.launch && basename(candidate) === "rpc.generated.ts")) &&
          !candidate.split(sep).includes("node_modules") &&
          sources.roots.some((root) => contains(root, candidate));

        if ((facadeTarget || globalTargets.has(candidate)) && !generated.has(candidate)) {
          fail(specifier, `Generated import is not a retained owned target: ${name}`);
        }
      }

      // A require() names whatever its runtime finds; only TypeScript's own module forms
      // must resolve.
      if (!file && reference.form !== "require") {
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

      if (file) {
        importRule(source, reference, resolve(file));
      }

      if (file && !file.includes("/node_modules/") && !generated.has(resolve(file))) {
        await auditPath(file);
      }

      if (reference.edge || reference.form === "dynamic import") {
        for (const target of runtime.runs(resolved).targets) {
          if (!program.getSourceFile(target)) {
            outside.push(target);
          }
        }
      }
    }
  }

  // The runtime files the program's modules execute that the program doesn't hold, such as a
  // `.js` behind its `.d.ts` without allowJs or a `.cjs` behind its `.d.cts`, and those they
  // execute in turn, are application code too: the import rule binds them.
  const walked = new Set<string>();

  while (outside.length > 0) {
    const file = outside.pop()!;

    if (walked.has(file)) {
      continue;
    }

    walked.add(file);

    const source = runtime.source(file);

    for (const reference of moduleReferences(source, verbatim)) {
      const resolved = runtime.resolve(source, reference);

      if (resolved && !resolved.isExternalLibraryImport) {
        importRule(source, reference, resolve(resolved.resolvedFileName));
      }

      if (reference.edge || reference.form === "dynamic import") {
        for (const target of runtime.runs(resolved).targets) {
          if (!program.getSourceFile(target)) {
            outside.push(target);
          }
        }
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
    const redirectCall = chainOf(program, declaration).calls.find(
      (call) => (call.expression as ts.PropertyAccessExpression).name.text === "redirect",
    )!;
    const fields = properties(redirectCall.arguments[0], "Redirect");
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
      const targetFacts = properties(
        chainOf(program, declaration.target).root.arguments[1],
        "URL facts",
      );
      const names = targetFacts.get("fragments");

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

  validateCopies(sources, generated, validation, globalTargets, runtime);
}

// Any export other than the default one: named exports (value or type), `export *`,
// `export =` and re-exports. An empty `export {}` exports nothing.
function exportsBesidesDefault(statement: ts.Statement): boolean {
  if (ts.isExportAssignment(statement)) {
    return statement.isExportEquals === true;
  }

  if (ts.isExportDeclaration(statement)) {
    const clause = statement.exportClause;

    return (
      statement.moduleSpecifier !== undefined ||
      !clause ||
      !ts.isNamedExports(clause) ||
      clause.elements.length > 0
    );
  }

  if (ts.isNamespaceExportDeclaration(statement)) {
    return true;
  }

  if (!ts.canHaveModifiers(statement)) {
    return false;
  }

  const modifiers = ts.getModifiers(statement) ?? [];

  return (
    modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
    !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
  );
}

/**
 * The checks of the generated copies over the runtime import graph: neither copy keeps a
 * runtime import of a server module; nothing a destination copy imports reaches a generated
 * file or a declaration module; nothing a route copy imports reaches a route copy, a shared
 * file or a declaration module. Then every copy must type-check; its diagnostics point at
 * the declaration's line.
 */
function validateCopies(
  sources: Sources,
  generated: ReadonlyMap<string, string>,
  validation: ReturnType<typeof createValidationProgram>,
  shared: ReadonlySet<string>,
  graph: RuntimeGraph,
): void {
  const { program } = validation;
  const base = dirname(sources.configFile);
  const declared = new Set(sources.declarations.map((declaration) => declaration.file));

  function label(file: string): string {
    return relative(base, file).split(sep).join("/");
  }

  // Lines past the declaration's own are the copy's generated tail.
  function aligned(declaration: Declaration, line: number): boolean {
    let lines = declaration.source.getLineStarts().length;

    if (/\r?\n$/.test(declaration.source.text)) {
      lines -= 1;
    }

    return line < lines;
  }

  function location(declaration: Declaration, copy: string, position: number): string {
    const source = graph.source(copy);
    const { line, character } = source.getLineAndCharacterOfPosition(position);

    if (aligned(declaration, line)) {
      return `${declaration.file}:${line + 1}:${character + 1}`;
    }

    return `${copy}:${line + 1}:${character + 1}`;
  }

  function hop(edge: Edge, file: string): string {
    const line = graph
      .source(edge.from)
      .getLineAndCharacterOfPosition(edge.reference.position).line;

    return `${label(file)}:${line + 1}`;
  }

  function chain(
    declaration: Declaration,
    found: { readonly chain: readonly Edge[]; readonly target: string },
  ): { text: string; edge: string } {
    const hops: string[] = [];

    for (let index = 0; index < found.chain.length; index += 1) {
      const edge = found.chain[index];
      let file = edge.from;

      // The copy's lines are the declaration's.
      if (index === 0) {
        file = declaration.file;
      }

      hops.push(`${hop(edge, file)} (${edge.kind})`);
    }

    const last = found.chain[found.chain.length - 1];
    let lastFile = last.from;

    if (found.chain.length === 1) {
      lastFile = declaration.file;
    }

    return { text: [...hops, label(found.target)].join(" → "), edge: hop(last, lastFile) };
  }

  const routeCopies = new Set<string>();

  for (const file of generated.keys()) {
    if (basename(file) === "route.generated.ts") {
      routeCopies.add(file);
    }
  }

  for (const declaration of sources.declarations) {
    const directory = dirname(declaration.file);
    const destinationCopy = resolve(directory, "destination.generated.ts");
    const routeCopy = resolve(directory, "route.generated.ts");
    let parentDestination: string | undefined;
    let parentCopy: string | undefined;

    if (declaration.parent) {
      parentDestination = resolve(dirname(declaration.parent.file), "destination.generated.ts");
      parentCopy = resolve(dirname(declaration.parent.file), "route.generated.ts");
    }

    // Server modules (D5): the copies are browser code.
    for (const copy of [destinationCopy, routeCopy]) {
      for (const edge of graph.edges(copy)) {
        const text = edge.reference.text;

        if (
          text.startsWith("node:") ||
          (edge.resolved && /\.server\./.test(basename(edge.resolved)))
        ) {
          throw new Error(
            `${location(declaration, copy, edge.reference.position)}: Browser route copy imports a server module: ${text}. Use \`import type\` for types.`,
          );
        }
      }
    }

    // URL facts modules reach no generated file and no declaration module.
    for (const edge of graph.edges(destinationCopy)) {
      if (edge.targets.length === 1 && edge.targets[0] === parentDestination) {
        continue;
      }

      const found = graph.path(
        edge,
        (file) => generated.has(file) || shared.has(file) || declared.has(file),
        () => false,
      );

      if (found) {
        const { text, edge: last } = chain(declaration, found);

        throw new Error(
          `${location(declaration, destinationCopy, edge.reference.position)}: URL facts import reaches a generated file: ${text}. URL fact modules may import only packages and other non-generated modules; make ${last} \`import type\` if it only needs types.`,
        );
      }
    }

    // A route copy's own imports reach destinations at most: destination files can't reach
    // back, so the walk stops there. Its parent's copy is the one route module it may import;
    // no authored declaration is reachable.
    for (const edge of graph.edges(routeCopy)) {
      if (edge.targets.length === 1 && edge.targets[0] === parentCopy) {
        continue;
      }

      const found = graph.path(
        edge,
        (file) => routeCopies.has(file) || shared.has(file) || declared.has(file),
        (file) => basename(file) === "destination.generated.ts" && generated.has(file),
      );

      if (found) {
        const { text, edge: last } = chain(declaration, found);

        throw new Error(
          `${location(declaration, routeCopy, edge.reference.position)}: Route copy import reaches a generated route module: ${text}. Import a destination.generated.js for URLs, or make ${last} \`import type\` if it only needs types.`,
        );
      }
    }
  }

  const messages: string[] = [];

  for (const declaration of sources.declarations) {
    const directory = dirname(declaration.file);

    for (const [copy, kind] of [
      [resolve(directory, "destination.generated.ts"), "destination copy"],
      [resolve(directory, "route.generated.ts"), "route copy"],
    ] as const) {
      const source = program.getSourceFile(copy)!;
      const diagnostics = [
        ...program.getSyntacticDiagnostics(source),
        ...program.getSemanticDiagnostics(source),
      ];

      for (const diagnostic of diagnostics) {
        const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

        messages.push(
          `${location(declaration, copy, diagnostic.start ?? 0)}: TS${diagnostic.code}: ${text} (in its generated ${kind})`,
        );
      }
    }
  }

  if (messages.length > 0) {
    throw new Error(messages.join("\n"));
  }
}
