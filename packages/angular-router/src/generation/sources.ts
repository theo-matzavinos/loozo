import ts from "typescript";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePath, type Segment } from "../../_core/src/path.js";
import { auditPath, contains, marked, metadata, walk, workspacePaths, markers } from "./files.js";
import { overlayDirectory, overlayHost } from "./overlay.js";
import type { CompilerState } from "./compiler.js";
import { synchronize, transparent, type AutoDefineRoutes } from "./filesystem.js";

export interface Declaration {
  file: string;
  id: string;
  source: ts.SourceFile;
  rawText: string;
  // URL facts and router steps (one argument each), flattened from the chain.
  config: Map<string, ts.Expression>;
  // defineRoute(path, facts), the chain's innermost call.
  root: ts.CallExpression;
  // Every chained step, in source order.
  steps: readonly RouteStep[];
  // Absent for the router's own factory.
  extension?: RouteExtension;
  path: string;
  segments: readonly Segment[];
  effective: readonly Segment[];
  parent?: Declaration;
  target?: Declaration;
  children: Declaration[];
  page?: string;
  retained: boolean;
  full: boolean;
}

export interface RouteStep {
  readonly name: string;
  readonly call: ts.CallExpression;
  // Source order; exactly one for router steps.
  readonly args: readonly ts.Expression[];
  readonly contributed: boolean;
  // Always false for router steps.
  readonly serverOnly: boolean;
}

export interface ManifestStep {
  readonly name: string;
  readonly serverOnly: boolean;
  readonly arity: { readonly min: number; readonly max: number | null };
}

export interface RouteExtension {
  // The bare package root as imported.
  readonly specifier: string;
  // The physical .d.ts entry the import resolves to.
  readonly entry: string;
  // The full manifest, in order.
  readonly steps: readonly ManifestStep[];
}

export interface LaunchDeclaration {
  file: string;
  kind: "defineContext" | "defineRpc";
  call: ts.CallExpression;
}

export interface LaunchMode {
  typeEntry: string;
}

export interface Sources {
  configFile: string;
  parsed: ts.ParsedCommandLine;
  roots: string[];
  output: string;
  encountered: string[];
  declarations: Declaration[];
  factoryEntry: string;
  // The router's physical `/_core` types entry, which declares RouteFactory.
  coreEntry: string;
  deferredFactories: Declaration[];
  authored: ReadonlyMap<string, string>;
  filesystem: boolean;
  launch?: { typeEntry: string; declarations: LaunchDeclaration[] };
}

export function fail(node: ts.Node, message: string): never {
  const source = node.getSourceFile();
  const position = source.getLineAndCharacterOfPosition(node.getStart());

  // Native, like the generator's other file diagnostics; TypeScript's fileName uses "/" everywhere.
  const file = resolve(source.fileName);

  throw new Error(`${file}:${position.line + 1}:${position.character + 1}: ${message}`);
}

export function properties(node: ts.Expression, label: string): Map<string, ts.Expression> {
  if (!ts.isObjectLiteralExpression(node)) {
    fail(node, `${label} must be an inline object`);
  }

  const result = new Map<string, ts.Expression>();

  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      fail(property, `${label} requires explicit unique keys; no spreads/accessors`);
    }

    const name = property.name;

    if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) {
      fail(name, `${label} requires noncomputed keys`);
    }

    if (result.has(name.text)) {
      fail(property, `Duplicate ${label} key: ${name.text}`);
    }

    let value: ts.Expression;

    if (ts.isPropertyAssignment(property)) {
      value = property.initializer;
    } else {
      value = property.name;
    }

    result.set(name.text, value);
  }

  return result;
}

export function resolveModule(
  name: string,
  source: string,
  options: ts.CompilerOptions,
  host: ts.ModuleResolutionHost = ts.sys,
): string | undefined {
  const resolved = ts.resolveModuleName(name, source, options, host).resolvedModule
    ?.resolvedFileName;

  // TypeScript separates resolved paths with "/" on every host; callers compare native paths.
  if (resolved === undefined) {
    return undefined;
  }

  return resolve(resolved);
}

export function namedImport(
  source: ts.SourceFile,
  name: ts.Expression,
  imported: string,
): ts.ImportDeclaration | undefined {
  if (!ts.isIdentifier(name)) {
    return undefined;
  }

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;

    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }

    for (const binding of bindings.elements) {
      if (
        !binding.isTypeOnly &&
        binding.name.text === name.text &&
        (binding.propertyName?.text ?? binding.name.text) === imported
      ) {
        return statement;
      }
    }
  }

  return undefined;
}

async function installedAngular(source: string): Promise<string> {
  let directory = dirname(source);

  while (true) {
    const packageFile = resolve(directory, "node_modules/@angular/core/package.json");
    const info = await metadata(packageFile);

    if (info) {
      const bytes = await readFile(packageFile, "utf8");
      const json = JSON.parse(bytes);
      const entry = json.exports?.["."]?.types;

      if (typeof entry !== "string") {
        throw new Error(`Installed Angular has no types entry: ${packageFile}`);
      }

      return realpath(resolve(dirname(packageFile), entry));
    }

    const parent = dirname(directory);

    if (parent === directory) {
      throw new Error(`Cannot find consumer-installed @angular/core for ${source}`);
    }

    directory = parent;
  }
}

function moduleText(statement: ts.ImportDeclaration): string {
  if (!ts.isStringLiteral(statement.moduleSpecifier)) {
    fail(statement, "Import module must be a string literal");
  }

  return statement.moduleSpecifier.text;
}

export async function genuineImport(
  statement: ts.ImportDeclaration,
  expected: string,
  options: ts.CompilerOptions,
  host: ts.ModuleResolutionHost = ts.sys,
): Promise<boolean> {
  const actual = resolveModule(
    moduleText(statement),
    statement.getSourceFile().fileName,
    options,
    host,
  );

  if (!actual) {
    return false;
  }

  const physical = await realpath(actual);

  return physical === expected;
}

function isDefault(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }

  return (
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ===
    true
  );
}

async function component(
  source: ts.SourceFile,
  node: ts.ClassDeclaration,
  options: ts.CompilerOptions,
): Promise<void> {
  let found = false;

  for (const decorator of ts.getDecorators(node) ?? []) {
    if (!ts.isCallExpression(decorator.expression)) {
      continue;
    }

    const call = decorator.expression;
    const imported = namedImport(source, call.expression, "Component");

    if (!imported) {
      continue;
    }

    const expected = await installedAngular(source.fileName);

    const genuine = await genuineImport(imported, expected, options);

    if (!genuine) {
      fail(decorator, "Component decorator is not from consumer-installed @angular/core");
    }

    if (found || call.arguments.length !== 1 || !ts.isObjectLiteralExpression(call.arguments[0])) {
      fail(decorator, "Component requires one inline metadata object");
    }

    found = true;

    let proven = true;
    let explicit = false;

    for (const property of call.arguments[0].properties) {
      if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name!)) {
        proven = false;

        continue;
      }

      const name = property.name;

      if (
        name &&
        (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
        name.text === "standalone"
      ) {
        if (explicit) {
          fail(property, "Duplicate standalone property");
        }

        explicit = true;
        proven =
          ts.isPropertyAssignment(property) &&
          property.initializer.kind === ts.SyntaxKind.TrueKeyword;

        if (!proven) {
          fail(property, "Component standalone must be final literal true or safely omitted");
        }
      }
    }

    if (!proven) {
      fail(decorator, "Component metadata cannot prove standalone after opaque override");
    }
  }

  if (!found) {
    fail(node, "Default class must have a genuine Angular Component decorator");
  }
}

const factsKeys = new Set(["parent", "params", "search", "fragments"]);
export const routerSteps: ReadonlySet<string> = new Set([
  "canMatch",
  "canActivate",
  "canActivateChild",
  "canDeactivate",
  "resolve",
  "title",
  "providers",
  "data",
  "runGuardsAndResolvers",
  "onInvalidParams",
  "redirect",
]);
// Any of these steps rules a redirect out.
const guardSteps = new Set([
  "canMatch",
  "canActivate",
  "canActivateChild",
  "canDeactivate",
  "onInvalidParams",
]);
const reservedStepNames = new Set([
  ...routerSteps,
  "path",
  "then",
  "__params",
  "__search",
  "__data",
  "__title",
  "__contribution",
  ...Object.getOwnPropertyNames(Object.prototype),
]);

function unwrapped(node: ts.Expression): boolean {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isElementAccessExpression(node)
  );
}

/**
 * Peels a default-exported `defineRoute(path, facts).step(…)…` chain into its root call
 * and its step calls, in source order.
 */
export function routeChain(expression: ts.Expression): {
  root: ts.CallExpression;
  calls: ts.CallExpression[];
} {
  const calls: ts.CallExpression[] = [];
  let current = expression;

  if (!ts.isCallExpression(current) && !unwrapped(current)) {
    fail(current, "Default export must be a defineRoute(...) chain or Component class");
  }

  while (true) {
    if (!ts.isCallExpression(current) || current.questionDotToken) {
      if (
        calls.length > 0 &&
        (ts.isIdentifier(current) || ts.isPropertyAccessExpression(current))
      ) {
        // ns.defineRoute(…): the innermost "step" is a factory call through a namespace.
        fail(
          calls[0],
          "Factory must be a genuine named value import of defineRoute, not a local wrapper/alias",
        );
      }

      fail(current, "Route chain must be plain calls: defineRoute(path, facts).step(…)…");
    }

    const callee = current.expression;

    if (ts.isIdentifier(callee)) {
      return { root: current, calls };
    }

    if (!ts.isPropertyAccessExpression(callee) || callee.questionDotToken) {
      fail(callee, "Route chain must be plain calls: defineRoute(path, facts).step(…)…");
    }

    calls.unshift(current);
    current = callee.expression;
  }
}

function stepName(call: ts.CallExpression): ts.MemberName {
  return (call.expression as ts.PropertyAccessExpression).name;
}

export function unalias(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): ts.Symbol | undefined {
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
    return checker.getAliasedSymbol(symbol);
  }

  return symbol;
}

/**
 * The factory declaration's `RouteFactory<E>` annotation with exactly one type argument,
 * or undefined. Its identity is checked in validation.
 */
export function factoryAnnotation(
  checker: ts.TypeChecker,
  root: ts.CallExpression,
): (ts.TypeReferenceNode | ts.ImportTypeNode) | undefined {
  const factory = unalias(checker, checker.getSymbolAtLocation(root.expression));
  const declaration = factory?.valueDeclaration;

  if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.type) {
    return undefined;
  }

  const annotation = declaration.type;

  if (!ts.isTypeReferenceNode(annotation) && !ts.isImportTypeNode(annotation)) {
    return undefined;
  }

  return annotation;
}

function propertyType(checker: ts.TypeChecker, type: ts.Type, name: string, at: ts.Node): ts.Type {
  const property = checker.getPropertyOfType(type, name);

  if (!property || property.flags & ts.SymbolFlags.Optional) {
    fail(at, `Manifest requires a required ${name} property`);
  }

  return checker.getTypeOfSymbolAtLocation(property, at);
}

// Reads E["steps"] from the declared RouteFactory<E>: a fixed tuple of literal entries.
function readManifest(
  checker: ts.TypeChecker,
  annotation: ts.TypeReferenceNode | ts.ImportTypeNode,
  root: ts.CallExpression,
): ManifestStep[] | undefined {
  const argument = annotation.typeArguments?.[0];

  if (annotation.typeArguments?.length !== 1 || !argument) {
    return undefined;
  }

  const spec = checker.getTypeFromTypeNode(argument);
  const steps = propertyType(checker, spec, "steps", root);

  if (!checker.isTupleType(steps)) {
    fail(root, "Extension steps must be a fixed-length tuple");
  }

  // TupleType.target.elementFlags tells optional, rest and variadic elements apart.
  const tuple = steps as ts.TupleTypeReference;

  for (const flag of tuple.target.elementFlags) {
    if (flag !== ts.ElementFlags.Required) {
      fail(root, "Extension steps must be a fixed-length tuple of required entries");
    }
  }

  const result: ManifestStep[] = [];
  const names = new Set<string>();

  for (const element of checker.getTypeArguments(tuple)) {
    const nameType = propertyType(checker, element, "name", root);

    if (!nameType.isStringLiteral()) {
      fail(root, "Manifest step name must be a string literal");
    }

    const name = nameType.value;

    if (reservedStepNames.has(name)) {
      fail(root, `Reserved contributed step name: ${name}`);
    }

    if (names.has(name)) {
      fail(root, `Duplicate contributed step name: ${name}`);
    }

    names.add(name);

    const flag = propertyType(checker, element, "serverOnly", root);

    if (!(flag.flags & ts.TypeFlags.BooleanLiteral)) {
      fail(root, `serverOnly must be a boolean literal: ${name}`);
    }

    const arity = propertyType(checker, element, "arity", root);
    const min = propertyType(checker, arity, "min", root);

    if (!min.isNumberLiteral() || !Number.isInteger(min.value) || min.value < 0) {
      fail(root, `arity.min must be a non-negative integer literal: ${name}`);
    }

    const max = propertyType(checker, arity, "max", root);
    let upper: number | null = null;

    if (!(max.flags & ts.TypeFlags.Null)) {
      if (
        !max.isNumberLiteral() ||
        !Number.isInteger(max.value) ||
        max.value < Math.max(min.value, 1)
      ) {
        fail(root, `arity.max must be null or an integer literal >= max(min, 1): ${name}`);
      }

      upper = max.value;
    }

    result.push({
      name,
      serverOnly: checker.typeToString(flag) === "true",
      arity: { min: min.value, max: upper },
    });
  }

  return result;
}

// Checks each step's name, order and argument count; router steps feed `config`.
function analyzeSteps(
  calls: readonly ts.CallExpression[],
  manifest: readonly ManifestStep[],
  config: Map<string, ts.Expression>,
): RouteStep[] {
  const steps: RouteStep[] = [];
  const used = new Set<string>();
  let routerStarted = false;
  let lastContributed = -1;

  for (const call of calls) {
    const nameNode = stepName(call);
    const name = nameNode.text;
    const index = manifest.findIndex((entry) => entry.name === name);

    if (index < 0 && !routerSteps.has(name)) {
      fail(nameNode, `Unknown step: ${name}`);
    }

    if (used.has("redirect")) {
      fail(nameNode, `No step may follow redirect: ${name}`);
    }

    if (used.has(name)) {
      fail(nameNode, `Repeated step: ${name}`);
    }

    used.add(name);

    for (const argument of call.arguments) {
      if (ts.isSpreadElement(argument)) {
        fail(argument, `Route step arguments cannot be spread: ${name}`);
      }
    }

    if (index >= 0) {
      const entry = manifest[index];

      if (routerStarted) {
        fail(nameNode, `Contributed step must precede router steps: ${name}`);
      }

      if (index <= lastContributed) {
        fail(nameNode, `Contributed steps must follow manifest order: ${name}`);
      }

      const { min, max } = entry.arity;

      if (call.arguments.length < min || (max !== null && call.arguments.length > max)) {
        if (max === null) {
          fail(call, `Route step ${name} takes at least ${min} arguments`);
        }

        fail(call, `Route step ${name} takes ${min}…${max} arguments`);
      }

      lastContributed = index;
      steps.push({
        name,
        call,
        args: call.arguments,
        contributed: true,
        serverOnly: entry.serverOnly,
      });

      continue;
    }

    if (call.arguments.length !== 1) {
      fail(call, `Route step ${name} takes exactly one argument`);
    }

    if (name === "redirect") {
      for (const guard of used) {
        if (guardSteps.has(guard)) {
          fail(nameNode, `Redirect cannot follow ${guard}`);
        }
      }
    }

    routerStarted = true;
    config.set(name, call.arguments[0]);
    steps.push({ name, call, args: call.arguments, contributed: false, serverOnly: false });
  }

  return steps;
}

export function isPackageRoot(specifier: string): boolean {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("#")) {
    return false;
  }

  const parts = specifier.split("/");

  if (specifier.startsWith("@")) {
    return parts.length === 2;
  }

  return parts.length === 1;
}

export async function discover(
  workspace: string,
  config: string,
  scans: readonly string[],
  out: string,
  auto?: AutoDefineRoutes,
  authored: ReadonlyMap<string, string> = new Map(),
  filesystem = auto !== undefined,
  launch?: LaunchMode,
  compiler?: CompilerState,
): Promise<Sources> {
  if (scans.length !== 1) {
    throw new Error("scanDirectories must contain exactly one directory");
  }

  const access = await workspacePaths(workspace);
  const configFile = access.resolve(config);
  const configDirectory = dirname(configFile);
  const output = access.resolve(out);
  const root = access.resolve(resolve(configDirectory, scans[0]));
  const roots = [root];

  if (contains(root, output) || contains(output, root)) {
    throw new Error(`Output and scan directory overlap: ${output}; ${root}`);
  }

  await Promise.all([auditPath(configFile), auditPath(output)]);

  const encountered = (await walk(root)).sort();
  const fatal: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configFile,
    {},
    {
      ...ts.sys,
      readDirectory: overlayDirectory(authored, (directory) => access.resolve(directory, true)),
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => fatal.push(diagnostic),
    },
  );
  const errors = [...fatal, ...(parsed?.errors ?? [])].filter((error) => error.code !== 18003);

  if (!parsed || errors.length > 0) {
    const codes = errors.map((diagnostic) => diagnostic.code).join(", ");

    throw new Error(
      `TypeScript diagnostic codes: ${codes}\n` +
        ts.formatDiagnosticsWithColorAndContext(errors, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => configDirectory,
          getNewLine: () => "\n",
        }),
    );
  }

  // Canonicalize only permitted workspace-access prefixes, never source links.
  // Membership, candidate discovery and the final program share these roots.
  const admitted = new Set<string>();

  for (const file of parsed.fileNames) {
    admitted.add(access.resolve(file));
  }

  parsed.fileNames = [...admitted];

  for (const file of authored.keys()) {
    if (!admitted.has(file)) {
      throw new Error(`TypeScript config does not admit filesystem definition: ${file}`);
    }
  }

  const candidates: string[] = [];

  for (const normalized of parsed.fileNames) {
    if (
      !normalized.endsWith(".ts") ||
      normalized.endsWith(".d.ts") ||
      normalized.split(sep).includes("node_modules")
    ) {
      continue;
    }

    await auditPath(normalized);

    if (launch || contains(root, normalized)) {
      candidates.push(normalized);
    }
  }

  candidates.sort();

  const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const manifestBytes = await readFile(resolve(packageRoot, "package.json"), "utf8");
  const manifest = JSON.parse(manifestBytes);
  const factoryEntry = await realpath(resolve(packageRoot, manifest.exports["."].types));
  const coreEntry = await realpath(resolve(packageRoot, manifest.exports["./_core"].types));
  const declarations: Declaration[] = [];
  const launchDeclarations: LaunchDeclaration[] = [];
  const launchEntry = launch && (await realpath(launch.typeEntry));
  const pages = new Map<string, string>();
  const deferredFactories: Declaration[] = [];
  const syntaxHost = overlayHost(parsed.options, authored);
  let syntaxProgram: ts.Program;
  // Built only when an extension factory's manifest must be read.
  let checker: ts.TypeChecker | undefined;

  if (compiler) {
    syntaxProgram = compiler.createProgram(candidates, parsed.options, syntaxHost);
  } else {
    syntaxProgram = ts.createProgram({
      rootNames: candidates,
      options: parsed.options,
      host: syntaxHost,
    });
  }

  for (const file of candidates) {
    const bytes = syntaxHost.readFile(file);

    if (bytes === undefined) {
      if (auto) {
        // An explicit tsconfig files entry may name a not-yet-seeded definition.
        continue;
      }

      throw new Error(`Cannot read admitted TypeScript source: ${file}`);
    }

    if (file.endsWith(`${sep}route.generated.ts`) && marked(bytes, markers["route.generated.ts"])) {
      continue;
    }

    const source = syntaxProgram.getSourceFile(file)!;
    const syntax = syntaxProgram.getSyntacticDiagnostics(source);

    if (syntax.length > 0) {
      throw new Error(
        ts.formatDiagnostics(syntax, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => configDirectory,
          getNewLine: () => "\n",
        }),
      );
    }

    const defaults = source.statements.filter((node) => {
      if ((ts.isExportAssignment(node) && !node.isExportEquals) || isDefault(node)) {
        return true;
      }

      if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ) {
        return node.exportClause.elements.some((element) => element.name.text === "default");
      }

      return false;
    });

    if (defaults.length === 0) {
      continue;
    }

    if (defaults.length !== 1) {
      fail(defaults[1], "Multiple competing default exports");
    }

    const node = defaults[0];
    const inRoutes = contains(root, file);

    if (launchEntry && ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      let kind: "defineContext" | "defineRpc" | undefined;
      let imported = namedImport(source, call.expression, "defineContext");

      if (imported) {
        kind = "defineContext";
      } else if (inRoutes) {
        imported = namedImport(source, call.expression, "defineRpc");

        if (imported) {
          kind = "defineRpc";
        }
      }

      if (kind && imported) {
        if (!(await genuineImport(imported, launchEntry, parsed.options, syntaxHost))) {
          fail(imported, `${kind} must resolve to Launch's concrete server entry`);
        }

        launchDeclarations.push({ file, kind, call });

        continue;
      }
    }

    // Context is audited over all application roots; unrelated bootstrap defaults
    // outside route scans are not route declarations.
    if (!inRoutes) {
      continue;
    }

    if (ts.isClassDeclaration(node)) {
      await component(source, node, parsed.options);

      if (pages.has(dirname(file))) {
        fail(node, `Competing colocated components: ${pages.get(dirname(file))}; ${file}`);
      }

      pages.set(dirname(file), file);

      continue;
    }

    if (!ts.isExportAssignment(node)) {
      fail(node, "Default export must be a defineRoute(...) chain or Component class");
    }

    const { root: call, calls } = routeChain(node.expression);
    const imported = namedImport(source, call.expression, "defineRoute");

    if (!imported) {
      fail(
        call,
        "Factory must be a genuine named value import of defineRoute, not a local wrapper/alias",
      );
    }

    const [path, configNode] = call.arguments;

    if (call.arguments.length !== 2 || !path || !ts.isStringLiteral(path) || !configNode) {
      fail(call, "defineRoute requires a literal path and inline URL facts");
    }

    const config = properties(configNode, "URL facts");

    for (const key of config.keys()) {
      if (routerSteps.has(key)) {
        fail(configNode, `Behavior key in URL facts: ${key}; chain .${key}(…) instead`);
      }

      if (!factsKeys.has(key)) {
        fail(configNode, `Unknown or generation-owned URL facts key: ${key}`);
      }
    }

    // The router's own import (by name, through its own facade, or through any link that
    // resolves to its public entry) takes the router path; anything else is an extension.
    const specifier = moduleText(imported);
    const ownFacade = resolve(dirname(file), "route.generated.ts");
    const resolved = resolveModule(specifier, file, parsed.options, syntaxHost);
    const facadeSpelling = resolve(dirname(file), specifier).replace(/\.js$/, ".ts");
    const deferred = resolved === ownFacade || (!resolved && facadeSpelling === ownFacade);
    let extension: RouteExtension | undefined;
    let manifest: readonly ManifestStep[] = [];

    if (specifier === "@loozo/angular-router") {
      const genuine = await genuineImport(imported, factoryEntry, parsed.options, syntaxHost);

      if (!genuine) {
        fail(
          imported,
          "defineRoute import does not resolve to this package's concrete public entry",
        );
      }
    } else if (
      !deferred &&
      !(await genuineImport(imported, factoryEntry, parsed.options, syntaxHost))
    ) {
      checker ??= syntaxProgram.getTypeChecker();

      const annotation = factoryAnnotation(checker, call);
      let steps: ManifestStep[] | undefined;

      // Without a readable annotation, validation rejects the factory before any write.
      if (annotation) {
        steps = readManifest(checker, annotation, call);
      }

      manifest = steps ?? [];

      let entry = specifier;

      if (resolved) {
        entry = await realpath(resolved);
      }

      extension = { specifier, entry, steps: manifest };
    }

    const steps = analyzeSteps(calls, manifest, config);

    let segments: readonly Segment[];

    try {
      segments = parsePath(path.text);
    } catch (error) {
      fail(path, String(error));
    }

    const needsParams = segments.some((segment) => segment.kind !== "static");

    const ignored = filesystem && transparent(roots[0], dirname(file));

    if (!auto && !ignored && needsParams !== config.has("params")) {
      fail(configNode, "Local params must be present exactly when the path declares placeholders");
    }

    if (!auto && !ignored && !needsParams && config.has("onInvalidParams")) {
      const handler = steps.find((step) => step.name === "onInvalidParams")!;

      fail(handler.call, "onInvalidParams requires local path placeholders");
    }

    const data = config.get("data");

    if (data && ts.isObjectLiteralExpression(data)) {
      for (const property of data.properties) {
        const name = property.name;

        if (
          name &&
          (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
          name.text === "__loozoAngularRouterRouteId"
        ) {
          fail(data, "Static data cannot supply reserved generated identity");
        }
      }
    }

    const id = relative(configDirectory, file).split(sep).join("/");

    if (isAbsolute(id)) {
      fail(node, "Source identity cannot be represented relative to tsconfig");
    }

    const declaration: Declaration = {
      file,
      id,
      source,
      rawText: authored.get(resolve(file)) ?? (await readFile(file, "utf8")),
      config,
      root: call,
      steps,
      extension,
      path: path.text,
      segments,
      effective: [],
      children: [],
      retained: true,
      full: false,
    };
    if (deferred) {
      deferredFactories.push(declaration);
    }

    declarations.push(declaration);
  }

  if (auto) {
    const edits = await synchronize(
      roots[0],
      declarations,
      pages,
      parsed.options,
      auto,
      syntaxProgram.getTypeChecker(),
    );

    return discover(workspace, config, scans, out, undefined, edits, true, launch, compiler);
  }

  if (filesystem) {
    for (let index = declarations.length - 1; index >= 0; index -= 1) {
      const declaration = declarations[index];

      if (transparent(roots[0], dirname(declaration.file))) {
        declarations.splice(index, 1);

        const deferred = deferredFactories.indexOf(declaration);

        if (deferred >= 0) {
          deferredFactories.splice(deferred, 1);
        }
      }
    }
  }

  const byDirectory = new Map<string, Declaration>();
  const byFile = new Map<string, Declaration>();

  for (const declaration of declarations) {
    const directory = dirname(declaration.file);

    if (byDirectory.has(directory)) {
      fail(
        declaration.source,
        `Competing colocated declarations: ${byDirectory.get(directory)!.file}; ${declaration.file}`,
      );
    }

    byDirectory.set(directory, declaration);
    byFile.set(declaration.file, declaration);
    declaration.page = pages.get(directory);
  }

  for (const [directory, page] of pages) {
    if (!byDirectory.has(directory)) {
      throw new Error(`Component without a colocated admitted declaration: ${page}`);
    }
  }

  const compilerOptions = parsed.options;

  function referenced(node: ts.Expression, declaration: Declaration): Declaration {
    if (!ts.isIdentifier(node)) {
      fail(node, "Parent/redirect target must directly reference a default import");
    }

    for (const statement of declaration.source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        statement.importClause?.isTypeOnly ||
        statement.importClause?.name?.text !== node.text
      ) {
        continue;
      }

      const file = resolveModule(
        moduleText(statement),
        declaration.file,
        compilerOptions,
        syntaxHost,
      );
      const target = file && byFile.get(file);

      if (target) {
        return target;
      }

      fail(
        node,
        `Parent/redirect target is not an admitted declaration: ${file ?? moduleText(statement)}`,
      );
    }

    fail(node, "Parent/redirect target must directly reference a default import");
  }

  for (const declaration of declarations) {
    const parent = declaration.config.get("parent");

    if (parent) {
      declaration.parent = referenced(parent, declaration);
      declaration.parent.children.push(declaration);
    }

    const redirect = declaration.config.get("redirect");

    if (redirect) {
      const fields = properties(redirect, "Redirect");

      for (const key of fields.keys()) {
        if (!["to", "params", "search", "fragment"].includes(key)) {
          fail(redirect, `Unknown redirect key: ${key}`);
        }
      }

      const target = fields.get("to");

      if (!target) {
        fail(redirect, "Redirect requires a direct target");
      }

      declaration.target = referenced(target, declaration);

      if (declaration.page || declaration.children.length) {
        fail(redirect, "Redirect cannot have a component or children");
      }

      declaration.retained = false;
    }
  }

  const visiting = new Set<Declaration>();
  const completed = new Set<Declaration>();

  function ancestry(declaration: Declaration): void {
    if (completed.has(declaration)) {
      return;
    }

    if (visiting.has(declaration)) {
      fail(declaration.source, "Parent cycle");
    }

    visiting.add(declaration);

    if (declaration.parent) {
      ancestry(declaration.parent);

      if (declaration.parent.effective.some((segment) => segment.kind === "catchall")) {
        fail(declaration.source, "Catchall declarations cannot have children");
      }

      const owned = new Set<string>();

      for (const segment of declaration.parent.effective) {
        if (segment.kind !== "static") {
          owned.add(segment.name);
        }
      }

      for (const segment of declaration.segments) {
        if (segment.kind !== "static" && owned.has(segment.name)) {
          fail(declaration.source, `Ancestor already owns path param: ${segment.name}`);
        }
      }

      declaration.effective = [...declaration.parent.effective, ...declaration.segments];
    } else {
      declaration.effective = declaration.segments;
    }

    visiting.delete(declaration);
    completed.add(declaration);
  }

  for (const declaration of declarations) {
    ancestry(declaration);

    const chain = new Set<Declaration>();
    let current: Declaration | undefined = declaration;

    while (current?.target) {
      if (chain.has(current)) {
        fail(declaration.source, "Redirect cycle/self redirect");
      }

      chain.add(current);
      current = current.target;
    }
  }

  // One extension per ancestry; router-made routes in between are neutral.
  for (const declaration of declarations) {
    if (!declaration.extension) {
      continue;
    }

    for (let ancestor = declaration.parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor.extension && ancestor.extension.entry !== declaration.extension.entry) {
        fail(
          declaration.root,
          `Route ancestry mixes route extensions: ${ancestor.extension.specifier}, ${declaration.extension.specifier}`,
        );
      }
    }
  }

  // Prune only ancestors made empty by redirect hoisting, not ordinary missing pages.
  function retain(declaration: Declaration): boolean {
    if (declaration.target) {
      if (declaration.children.length > 0) {
        fail(declaration.source, "Redirect cannot have authored children");
      }

      return false;
    }

    let retainedChild = false;

    for (const child of declaration.children) {
      if (retain(child)) {
        retainedChild = true;
      }
    }

    if (!declaration.page && !retainedChild) {
      if (declaration.children.length === 0) {
        fail(declaration.source, "Ordinary componentless leaf");
      }

      declaration.retained = false;
    }

    return declaration.retained;
  }

  for (const declaration of declarations) {
    if (!declaration.parent) {
      retain(declaration);
    }
  }

  for (const declaration of deferredFactories) {
    if (!declaration.retained) {
      fail(declaration.source, "Factory facade is not a final retained generated location");
    }
  }

  let launchSources: Sources["launch"];

  if (launchEntry) {
    launchSources = { typeEntry: launchEntry, declarations: launchDeclarations };
  }

  return {
    configFile,
    parsed,
    roots,
    output,
    encountered,
    declarations,
    factoryEntry,
    coreEntry,
    deferredFactories,
    authored,
    filesystem,
    launch: launchSources,
  };
}
