import ts from "typescript";
import { frameworkFailures } from "../client.js";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverLaunchRoutes,
  emitLaunchRoutes,
  createValidationProgram,
  validateRoutes,
  planOutputs,
  publish,
  walk,
  auditPath,
  launchMarkers,
  fail,
  properties,
  specifier,
  CompilerState,
  AnchorState,
  validateLocales,
} from "@loozo/angular-router/_generation";
import type {
  Declaration,
  JsonRecord,
  LaunchCopies,
  Localization,
  LocaleWords,
  Sources,
} from "@loozo/angular-router/_generation";
import type { ClientMethod } from "../remote-client.js";
import { emitRedirects } from "./redirects.js";

// One procedure's browser metadata, as JSON in its route's copy data.
type MethodData = {
  readonly name: string;
  readonly input: boolean;
  readonly kind: ClientMethod["kind"];
  readonly errors: readonly ErrorData[];
};
type ErrorData = { readonly code: string; readonly status: number; readonly message: string };

/** Options for {@link generate} and {@link createGenerationSession}. */
export interface GenerationOptions {
  /** The application's tsconfig, relative to the workspace. It must enable strict checking. */
  tsconfig: string;
  /** Exactly one route directory, relative to the tsconfig's directory. */
  scanDirectories: string[];
  /** Where the application-wide generated files go, relative to the workspace. */
  outDirectory: string;
  /**
   * Adds `route.queries` and `type Queries` to each route copy: TanStack Query options and
   * keys for the same namespaces as `route.remote`. Requires `@tanstack/angular-query` in
   * the application and `provideLaunchQueries()` from `@loozo/angular-launch/tanstack-query`
   * in its providers. Defaults to `false`.
   */
  tanstackQuery?: boolean;
  /**
   * Translates static route segments per Angular localize build, as the router's
   * `translateSegments` does, and writes `redirects.generated.ts`, whose
   * `provideRedirectTranslation()` puts RPC redirects in the page's language. Needs
   * `localization`. Defaults to `false`.
   */
  translateSegments?: boolean;
  /**
   * The build's i18n configuration and polyfills, which every locale's translated route tree
   * is validated against. Read only when `translateSegments` is true; Launch's builders fill it
   * from the project.
   */
  localization?: Localization;
  /**
   * Verifies the generated files without writing them, failing when any is changed,
   * missing or stale. Defaults to `false`.
   */
  check?: boolean;
}
/**
 * A generation session created by {@link createGenerationSession}, reusing compiler
 * work between calls.
 */
export interface GenerationSession {
  /**
   * Generates or checks the application's files, like {@link generate} with the
   * session's options.
   *
   * @remarks
   * Calls must be sequential. A failed call doesn't break the session; the next call
   * starts clean.
   *
   * @param options - `check`: verify without writing. Defaults to `false`.
   * @param stopped - Called once just before writing; returning `true` skips writing and
   * resolves. Defaults to never stopping.
   * @returns A promise that resolves when generation finishes.
   * @throws Rejects when the session is disposed, when another call hasn't settled yet,
   * and for the same failures as {@link generate}.
   */
  generate(options?: Pick<GenerationOptions, "check">, stopped?: () => boolean): Promise<void>;
  /**
   * Disposes the session: stops an active call before it writes, waits for it to settle
   * and makes later calls reject.
   *
   * @returns A promise that resolves once any active call has settled.
   */
  dispose(): Promise<void>;
}

/**
 * The builders' session: {@link GenerationSession}, with each call resolving to the locale words
 * that `translateSegments` validated, for the locale table.
 */
export interface BuilderSession {
  generate(
    options?: Pick<GenerationOptions, "check">,
    stopped?: () => boolean,
  ): Promise<LocaleWords | undefined>;
  dispose(): Promise<void>;
}

interface GenerationCompilerState {
  discovery: CompilerState;
  overlay: CompilerState;
  routerAnchor: AnchorState;
}

// A node of an authored route, found again in the validation program by its position.
interface Located {
  readonly file: string;
  readonly start: number;
  readonly end: number;
}

// What generation reads from the routes' Launch steps.
interface Analysis {
  // Each route's own copy data: `{ remote: { [namespace]: { methods } } }`.
  readonly data: Map<Declaration, JsonRecord>;
  // Schemas whose type must be concrete, with the message for one that isn't.
  readonly schemas: { readonly node: Located; readonly message: string }[];
}

function directCall(node: ts.Expression, label: string): ts.CallExpression {
  if (!ts.isCallExpression(node) || node.typeArguments?.length) {
    fail(node, `${label} requires a direct nongeneric factory call`);
  }

  return node;
}

const builderShape =
  ".remote() requires an arrow function destructuring query, mutation, stream and/or channel, returning a parenthesized object of namespaces";
const builders = ["query", "mutation", "stream", "channel"];

// `({ query, mutation }) => ({ ... })`: the builder names it binds and its namespaces.
function builderCallback(node: ts.Expression): {
  bound: Set<string>;
  namespaces: Map<string, ts.Expression>;
} {
  if (
    !ts.isArrowFunction(node) ||
    node.modifiers?.length ||
    node.typeParameters?.length ||
    node.type ||
    node.parameters.length !== 1
  ) {
    fail(node, builderShape);
  }

  const [parameter] = node.parameters;

  if (
    !ts.isObjectBindingPattern(parameter.name) ||
    parameter.type ||
    parameter.initializer ||
    parameter.dotDotDotToken
  ) {
    fail(parameter, builderShape);
  }

  const bound = new Set<string>();

  for (const element of parameter.name.elements) {
    if (
      element.propertyName ||
      element.initializer ||
      element.dotDotDotToken ||
      !ts.isIdentifier(element.name) ||
      !builders.includes(element.name.text) ||
      bound.has(element.name.text)
    ) {
      fail(
        element,
        ".remote()'s callback may only destructure query, mutation, stream and channel, without renaming",
      );
    }

    bound.add(element.name.text);
  }

  if (!ts.isParenthesizedExpression(node.body)) {
    fail(node.body, builderShape);
  }

  return { bound, namespaces: properties(node.body.expression, "RPC namespaces") };
}

function onlyKeys(fields: Map<string, ts.Expression>, allowed: string[], node: ts.Node): void {
  for (const key of fields.keys()) {
    if (!allowed.includes(key)) {
      fail(node, `Unsupported Launch option: ${key}`);
    }
  }
}

function errorMetadata(node: ts.Expression | undefined): ErrorData[] {
  const result: ErrorData[] = [];

  if (!node) {
    return result;
  }

  for (const [code, value] of properties(node, "Declared RPC errors")) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(code) ||
      code === "__proto__" ||
      Object.hasOwn(frameworkFailures, code)
    ) {
      fail(value, `Invalid or reserved declared RPC error code: ${code}`);
    }

    const fields = properties(value, "Declared RPC error");

    onlyKeys(fields, ["status", "message", "data"], value);

    const status = fields.get("status");
    const message = fields.get("message");

    if (
      !status ||
      !ts.isNumericLiteral(status) ||
      !Number.isInteger(Number(status.text)) ||
      Number(status.text) < 400 ||
      Number(status.text) > 599 ||
      !message ||
      !ts.isStringLiteral(message) ||
      message.text.length === 0 ||
      !fields.has("data")
    ) {
      fail(
        value,
        "Declared errors require literal integer status 400–599, nonempty message and data schema",
      );
    }

    result.push({ code, status: Number(status.text), message: message.text });
  }

  return result;
}

function hasNonConcreteSchemaBranch(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.some(hasNonConcreteSchemaBranch);
  }

  return (
    (type.flags &
      (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !==
    0
  );
}

function add(desired: Map<string, string>, path: string, text: string): void {
  if (desired.has(path)) {
    throw new Error(`Duplicate desired output path: ${path}`);
  }

  desired.set(path, text);
}

function located(node: ts.Node): Located {
  const source = node.getSourceFile();

  return { file: source.fileName, start: node.getStart(source), end: node.getEnd() };
}

// The same node in another program's copy of its file.
function nodeAt(program: ts.Program, at: Located): ts.Expression {
  const source = program.getSourceFile(at.file)!;
  let found: ts.Node | undefined;

  function visit(node: ts.Node): void {
    if (found || node.getStart(source) > at.start || node.getEnd() < at.end) {
      return;
    }

    if (node.getStart(source) === at.start && node.getEnd() === at.end && ts.isExpression(node)) {
      found = node;

      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  return found as ts.Expression;
}

function label(workspace: string, file: string): string {
  return relative(workspace, file).split(sep).join("/");
}

// Reads every route's Launch steps: the procedure metadata its copy carries, and the nodes
// the validation program checks once it exists.
async function analyze(sources: Sources, launchEntry: string): Promise<Analysis> {
  const analysis: Analysis = { data: new Map(), schemas: [] };
  const namespaces = new Map<string, Declaration>();

  for (const declaration of sources.declarations) {
    if (!declaration.extension) {
      continue;
    }

    if ((await realpath(declaration.extension.entry)) !== launchEntry) {
      fail(declaration.root, "Route uses a route extension that isn't Launch's defineRoute");
    }

    for (const step of declaration.steps) {
      if (step.name !== "remote") {
        continue;
      }

      const own: Record<string, { readonly methods: readonly MethodData[] }> = {};
      const { bound, namespaces: declared } = builderCallback(step.args[0]);

      for (const [namespace, value] of declared) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(namespace)) {
          fail(value, "RPC namespaces must be identifier names");
        }

        if (namespace === "__proto__") {
          fail(value, "RPC namespace '__proto__' is reserved");
        }

        const previous = namespaces.get(namespace);

        if (previous) {
          fail(value, `Duplicate RPC namespace: ${namespace}; also declared in ${previous.file}`);
        }

        namespaces.set(namespace, declaration);

        const methods: MethodData[] = [];

        for (const [name, entry] of properties(value, "RPC procedures")) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            fail(entry, "RPC methods must be identifier names");
          }

          if (name === "__proto__") {
            fail(entry, "RPC procedure '__proto__' is reserved");
          }

          const procedure = directCall(entry, "query/mutation/stream/channel");

          // The callback's own binding: its body is an object literal, so nothing can shadow it.
          if (!ts.isIdentifier(procedure.expression) || !bound.has(procedure.expression.text)) {
            fail(
              procedure,
              "Procedure must directly call the callback's query, mutation, stream or channel",
            );
          }

          const kind = procedure.expression.text as ClientMethod["kind"];

          if (procedure.arguments.length !== 1) {
            fail(procedure, `${kind} requires one inline options object`);
          }

          const fields = properties(procedure.arguments[0], "Procedure options");

          if (kind === "channel") {
            onlyKeys(fields, ["handler", "input", "message", "use", "errors"], procedure);

            if (!fields.has("message")) {
              fail(procedure, "channel requires message");
            }
          } else {
            onlyKeys(fields, ["handler", "input", "use", "errors"], procedure);
          }

          if (!fields.has("handler")) {
            fail(procedure, `${kind} requires handler`);
          }

          const input = fields.get("input");
          const message = fields.get("message");
          const errors = fields.get("errors");

          if (input) {
            analysis.schemas.push({
              node: located(input),
              message:
                "Explicit query input must have a concrete Standard Schema type (also required for mutations)",
            });
          }

          if (message) {
            analysis.schemas.push({
              node: located(message),
              message: "A channel's message must have a concrete Standard Schema type",
            });
          }

          if (errors) {
            for (const error of properties(errors, "Declared RPC errors").values()) {
              const data = properties(error, "Declared RPC error").get("data");

              if (data) {
                analysis.schemas.push({
                  node: located(data),
                  message: "Declared error data must have a concrete Standard Schema type",
                });
              }
            }
          }

          methods.push({ name, input: input !== undefined, kind, errors: errorMetadata(errors) });
        }

        own[namespace] = { methods };
      }

      analysis.data.set(declaration, { remote: own });
    }
  }

  return analysis;
}

interface PayloadImport {
  from: string;
  target: string;
  local: string;
}

// server.generated.ts: every authored route with a server step, bound into the application.
function emitServer(
  sources: Sources,
  desired: Map<string, string>,
  workspace: string,
  appId: string,
  translateSegments: boolean,
): PayloadImport[] {
  const payloads: PayloadImport[] = [];
  const file = resolve(sources.output, "server.generated.ts");
  const lines: string[] = [launchMarkers["server.generated.ts"]];

  // First, so the host has a source-text $localize before any destination copy evaluates.
  if (translateSegments) {
    lines.push(`import '@loozo/angular-launch/_source-text';`);
  }

  lines.push(
    `import type { HandleOptions } from '@loozo/angular-launch/server';`,
    `import { bindApplication, createRequestScope as scopeFor, handleChannelUpgrade, handleRpc, provideLaunchServer } from '@loozo/angular-launch/_server';`,
  );
  const routes: string[] = [];
  // By code unit, so the order doesn't depend on the machine's locale.
  const declarations = [...sources.declarations].sort((a, b) => {
    if (a.id < b.id) {
      return -1;
    }

    return Number(a.id > b.id);
  });

  for (const declaration of declarations) {
    if (!declaration.steps.some((step) => step.serverOnly)) {
      continue;
    }

    const local = `route${routes.length}`;

    payloads.push({ from: file, target: declaration.file, local });
    lines.push(`import ${local} from ${JSON.stringify(specifier(file, declaration.file))};`);
    routes.push(`[${local}, ${JSON.stringify(label(workspace, declaration.file))}]`);
  }

  const binding = translateSegments ? ", { translateSegments: true }" : "";

  // Each entry is checked against bindApplication's entry type on its own, so the array's
  // elements share that one type. Inline, the array literal's element type would be the
  // subtype-reduced union of every route's own type: quadratic in server-step routes. With no
  // entries, the type would be an unused local.
  if (routes.length > 0) {
    lines.push(`type Entry = Parameters<typeof bindApplication>[1][number];`);
    lines.push(...routes.map((entry, index) => `const entry${index}: Entry = ${entry};`));
  }

  lines.push(
    `const application = bindApplication(${JSON.stringify(appId)}, [${routes.map((_, index) => `entry${index}`).join(", ")}]${binding});`,
    `export const createRequestScope = (request: Request) => scopeFor(application, request);`,
    `export const handleRequest = (request: Request, options: HandleOptions) => handleRpc(application, request, options);`,
    `export const handleUpgrade = (request: Request, options: HandleOptions) => handleChannelUpgrade(application, request, options);`,
    `export const provideServer = () => provideLaunchServer(application);`,
    "",
  );
  add(desired, file, lines.join("\n"));

  return payloads;
}

function unalias(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined {
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
    return checker.getAliasedSymbol(symbol);
  }

  return symbol;
}

async function validatePayloadImports(
  validation: ReturnType<typeof createValidationProgram>,
  payloads: readonly PayloadImport[],
): Promise<void> {
  const { program, host } = validation;
  const checker = program.getTypeChecker();

  for (const payload of payloads) {
    const source = program.getSourceFile(payload.from)!;
    const statement = source.statements.find(
      (node): node is ts.ImportDeclaration =>
        ts.isImportDeclaration(node) && node.importClause?.name?.text === payload.local,
    )!;
    const name = statement.moduleSpecifier as ts.StringLiteral;
    const resolved = ts.resolveModuleName(
      name.text,
      source.fileName,
      program.getCompilerOptions(),
      host,
      undefined,
      undefined,
      program.getModeForUsageLocation(source, name),
    ).resolvedModule;

    if (
      !resolved ||
      (await realpath(resolved.resolvedFileName)) !== (await realpath(payload.target))
    ) {
      fail(
        statement,
        `Generated payload import must resolve to its discovered declaration: ${payload.target}`,
      );
    }

    const target = program.getSourceFile(payload.target)!;
    const module = checker.getSymbolAtLocation(target)!;
    const expected = unalias(
      checker,
      checker.getExportsOfModule(module).find((symbol) => symbol.name === "default"),
    );
    const actual = unalias(checker, checker.getSymbolAtLocation(statement.importClause!.name!));

    if (
      !expected?.declarations?.length ||
      actual !== expected ||
      expected.declarations.some((node) => node.getSourceFile() !== target)
    ) {
      fail(statement, "Generated payload import does not bind the discovered default declaration");
    }
  }
}

// What only the validation program's checker can tell: schema concreteness.
function checkLaunchTypes(
  validation: ReturnType<typeof createValidationProgram>,
  analysis: Analysis,
): void {
  const { program } = validation;
  const checker = program.getTypeChecker();

  for (const { node, message } of analysis.schemas) {
    const expression = nodeAt(program, node);

    if (hasNonConcreteSchemaBranch(checker.getTypeAtLocation(expression))) {
      fail(expression, message);
    }
  }
}

function moduleReferences(source: ts.SourceFile): ts.StringLiteralLike[] {
  const references: ts.StringLiteralLike[] = [];

  function visit(node: ts.Node): void {
    let specifier: ts.Node | undefined;

    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
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

  return references;
}

const translationProvider = "provideRedirectTranslation";

// Whether `specifier` is a value import declaration that names the translation provider.
function importsProvider(specifier: ts.StringLiteralLike): boolean {
  const statement = specifier.parent;

  if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) {
    return false;
  }

  const bindings = statement.importClause?.namedBindings;

  if (!bindings || !ts.isNamedImports(bindings)) {
    return false;
  }

  return bindings.elements.some(
    (element) =>
      !element.isTypeOnly && (element.propertyName ?? element.name).text === translationProvider,
  );
}

// Check generation's own domain before publication: generated outputs, discovered
// route/Launch declarations and application TypeScript files that directly import
// a generated output (import/export-from, import(), import types, import =). Other
// application files and dependencies are left to the application's own build. With
// `redirects`, some application file must import its provider: the check proves the import,
// not that both applications install it.
function checkGeneratedDomain(
  sources: Sources,
  validation: ReturnType<typeof createValidationProgram>,
  generated: ReadonlyMap<string, string>,
  redirects?: string,
): void {
  const { program, host, semanticDiagnostics } = validation;
  const options = program.getCompilerOptions();
  const selected = new Set(generated.keys());

  for (const declaration of sources.declarations) {
    selected.add(declaration.file);
  }

  const cache = ts.createModuleResolutionCache(
    program.getCurrentDirectory(),
    (file) => host.getCanonicalFileName(file),
    options,
  );
  let provided = false;

  for (const source of program.getSourceFiles()) {
    const file = resolve(source.fileName);

    if (
      selected.has(file) ||
      source.fileName.includes("/node_modules/") ||
      program.isSourceFileFromExternalLibrary(source) ||
      program.isSourceFileDefaultLibrary(source)
    ) {
      continue;
    }

    for (const specifier of moduleReferences(source)) {
      const resolved = ts.resolveModuleName(
        specifier.text,
        source.fileName,
        options,
        host,
        cache,
        undefined,
        program.getModeForUsageLocation(source, specifier),
      ).resolvedModule;

      if (!resolved) {
        continue;
      }

      const target = resolve(resolved.resolvedFileName);

      if (generated.has(target)) {
        selected.add(file);

        if (target === redirects && importsProvider(specifier)) {
          provided = true;
        }
      }
    }
  }

  if (redirects !== undefined && !provided) {
    throw new Error(
      `translateSegments needs ${translationProvider}() from ${label(dirname(sources.configFile), redirects)} in your application config's providers, so RPC redirects reach the page's language`,
    );
  }

  const declarationEmit = options.declaration || options.composite;
  const diagnostics: ts.Diagnostic[] = [...program.getOptionsDiagnostics()];

  for (const file of selected) {
    const source = program.getSourceFile(file)!;

    diagnostics.push(...program.getSyntacticDiagnostics(source), ...semanticDiagnostics(source));

    if (declarationEmit && !source.isDeclarationFile) {
      diagnostics.push(...program.getDeclarationDiagnostics(source));
    }
  }

  // Global diagnostics can surface while checking the selected files.
  diagnostics.push(...program.getGlobalDiagnostics());

  const unique = ts.sortAndDeduplicateDiagnostics(diagnostics);

  if (unique.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(unique, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => dirname(sources.configFile),
        getNewLine: () => "\n",
      }),
    );
  }
}

/**
 * Generation for the builders: {@link generate}, resolving to each non-source locale's text for
 * every route word when `translateSegments` is on, and undefined otherwise.
 */
export async function runGeneration(
  workspace: string,
  options: GenerationOptions,
  stopped: () => boolean,
  compiler?: GenerationCompilerState,
): Promise<LocaleWords | undefined> {
  // The built package root (dist/ in the workspace, the tarball root when installed).
  const root = fileURLToPath(new URL("../", import.meta.url));
  const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const launchEntry = await realpath(resolve(root, manifest.exports["."].types));
  const application = await realpath(workspace);

  function requireInside(file: string): void {
    const suffix = relative(application, file);

    if (suffix === ".." || suffix.startsWith(`..${sep}`) || resolve(application, suffix) !== file) {
      throw new Error(`Launch source/output escapes application workspace: ${file}`);
    }
  }

  const config = resolve(application, options.tsconfig);

  requireInside(config);
  requireInside(resolve(application, options.outDirectory));

  for (const directory of options.scanDirectories) {
    requireInside(resolve(dirname(config), directory));
  }

  const sources = await discoverLaunchRoutes(application, options, compiler?.discovery);

  for (const file of sources.parsed.fileNames) {
    requireInside(file);
  }

  // TS 6 defaults strict checking on, but each explicit false overrides it.
  // Match its getStrictOptionValue rule without relying on an untyped internal API.
  for (const flag of [
    "noImplicitAny",
    "strictNullChecks",
    "strictFunctionTypes",
    "strictBindCallApply",
    "strictPropertyInitialization",
    "strictBuiltinIteratorReturn",
    "noImplicitThis",
    "useUnknownInCatchVariables",
  ] as const) {
    const enabled = sources.parsed.options[flag] ?? sources.parsed.options.strict ?? true;

    if (!enabled) {
      throw new Error(
        `Launch generation requires effective strict TypeScript checking: ${flag} is disabled`,
      );
    }
  }

  if (sources.parsed.options.noCheck) {
    throw new Error(
      "Launch generation requires effective strict TypeScript checking: noCheck must be false",
    );
  }

  const translateSegments = options.translateSegments === true;
  let words: LocaleWords | undefined;

  if (translateSegments) {
    if (!options.localization) {
      throw new Error("translateSegments needs the build's localization");
    }

    words = await validateLocales(sources, options.localization);
  }

  const analysis = await analyze(sources, launchEntry);
  const tanstackQuery = options.tanstackQuery === true;
  const copies: LaunchCopies = {
    data: analysis.data,
    types: [
      { name: "Remote", type: "RemoteOf", from: "@loozo/angular-launch" },
      { name: "Context", type: "ContextOf", from: "@loozo/angular-launch" },
      ...(tanstackQuery
        ? [{ name: "Queries", type: "QueriesOf", from: "@loozo/angular-launch/tanstack-query" }]
        : []),
    ],
    members: [
      { member: "remote", type: "Remote" },
      ...(tanstackQuery ? [{ member: "queries", type: "Queries" }] : []),
    ],
  };
  const desired = emitLaunchRoutes(sources, copies, { translateSegments });
  const redirects = resolve(sources.output, "redirects.generated.ts");

  if (translateSegments) {
    add(desired, redirects, emitRedirects(sources));
  }

  const appManifest = JSON.parse(await readFile(resolve(application, "package.json"), "utf8"));

  if (typeof appManifest.name !== "string" || appManifest.name.length === 0) {
    throw new Error("Launch application package.json requires a name for generated app identity");
  }

  // Stable across route edits: the application is its package, tsconfig and output.
  const appId = createHash("sha256")
    .update("launch-app-v2\0")
    .update(appManifest.name)
    .update("\0")
    .update(label(application, sources.configFile))
    .update("\0")
    .update(label(application, sources.output))
    .digest("hex");
  const payloads = emitServer(sources, desired, application, appId, translateSegments);

  await auditPath(sources.output);

  const outputInventory = await walk(sources.output);
  // context.generated.d.ts is a retired output. The router's retired marker for it is what
  // finds a marked leftover in the output directory and deletes it; listing it here keeps its
  // location in the plan's set of owned outputs. redirects.generated.ts is listed so turning
  // translateSegments off removes it as stale.
  const globals = [
    "routes.generated.ts",
    "server.generated.ts",
    "redirects.generated.ts",
    "context.generated.d.ts",
  ].map((name) => resolve(sources.output, name));
  const plan = await planOutputs(
    desired,
    [...sources.encountered, ...outputInventory],
    globals,
    "router-and-launch",
  );
  const validation = createValidationProgram(sources, desired, plan.stale, compiler?.overlay);

  await validateRoutes(sources, desired, validation, compiler?.routerAnchor);
  await validatePayloadImports(validation, payloads);
  checkLaunchTypes(validation, analysis);
  checkGeneratedDomain(sources, validation, desired, translateSegments ? redirects : undefined);
  publish(plan, options.check === true, stopped, new Map(), new Set());

  return words;
}

/**
 * Generates the router's and Launch's files for an application, or checks them.
 *
 * @remarks
 * Node-only. Generation reads your sources without running them. It writes the router's
 * files, with each route copy carrying its route's `.remote()` metadata and the `Remote`,
 * `Context` and, with `tanstackQuery`, `Queries` types, and `server.generated.ts` in the
 * output directory, which binds every route with a server step. With `translateSegments`,
 * every locale's translated route tree is validated first, static segments become `$localize`
 * messages, `server.generated.ts` first imports Launch's source-text `$localize` for the
 * unlocalized host, and `redirects.generated.ts` holds the word table an application file must
 * import `provideRedirectTranslation()` from. It deletes a marked
 * `rpc.generated.ts` or `context.generated.d.ts` an earlier version wrote. Run it before
 * the Angular build.
 *
 * Everything is validated, including a type check of the generated files with
 * `skipLibCheck: false`, before anything is written, so a failed run changes nothing.
 * Files are then written one at a time without rollback; a write error partway through
 * can leave some files updated, which the next successful run repairs. Generation only
 * replaces or removes files carrying its ownership marker, and removes stale ones.
 *
 * @example
 * ```js
 * import { generate } from "@loozo/angular-launch/generation";
 *
 * await generate(import.meta.dirname, {
 *   tsconfig: "tsconfig.app.json",
 *   scanDirectories: ["src/routes"],
 *   outDirectory: "generated",
 *   check: process.argv.includes("--check"),
 * });
 * ```
 *
 * @param workspace - The absolute path of the application directory, which contains
 * its `package.json`. The tsconfig, scanned directory, sources and output directory
 * must all be inside it.
 * @param options - The generation options.
 * @param stopped - Called once just before writing; returning `true` skips writing and
 * resolves. Defaults to never stopping.
 * @returns A promise that resolves when generation finishes.
 * @throws Rejects when a path escapes the workspace, the tsconfig disables strict
 * checking or enables `noCheck`, the application's `package.json` has no `name`, the
 * sources or generated files fail validation, a file to replace lacks the ownership
 * marker, or, with `check`, a generated file is out of date; with `translateSegments`, also
 * when `localization` is missing, the build lacks the `@angular/localize/init` polyfill, a
 * locale's catalog fails the router's checks, or no application file imports
 * `provideRedirectTranslation`.
 */
export async function generate(
  workspace: string,
  options: GenerationOptions,
  stopped: () => boolean = () => false,
): Promise<void> {
  await runGeneration(workspace, options, stopped);
}

/**
 * Creates a generation session that reuses compiler work between sequential calls.
 *
 * @remarks
 * Node-only. For long-running tools that regenerate repeatedly, such as after file
 * changes. A session doesn't watch files; you decide when to call `generate`. Edits
 * inside the application are picked up by the next call. Create a new session after
 * moving the application directory or changing dependencies. Don't run two sessions or
 * generators against the same output at once.
 *
 * @example
 * ```js
 * const session = createGenerationSession(workspace, {
 *   tsconfig: "tsconfig.app.json",
 *   scanDirectories: ["src/routes"],
 *   outDirectory: "generated",
 * });
 *
 * try {
 *   await session.generate();
 *   await session.generate({ check: true });
 * } finally {
 *   await session.dispose();
 * }
 * ```
 *
 * @param workspace - The absolute path of the application directory, as for
 * {@link generate}.
 * @param options - The generation options, fixed for the session's lifetime; `check` is
 * passed per call instead.
 * @returns The session. Dispose it when done.
 */
export function createGenerationSession(
  workspace: string,
  options: Omit<GenerationOptions, "check">,
): GenerationSession {
  const session = createBuilderSession(workspace, options);

  return {
    async generate(options, stopped) {
      await session.generate(options, stopped);
    },
    dispose: () => session.dispose(),
  };
}

/** {@link createGenerationSession} for the builders, whose calls resolve to the locale words. */
export function createBuilderSession(
  workspace: string,
  {
    tsconfig,
    scanDirectories,
    outDirectory,
    tanstackQuery,
    translateSegments,
    localization,
  }: Omit<GenerationOptions, "check">,
): BuilderSession {
  const application = resolve(workspace);
  const fixed = {
    tsconfig,
    scanDirectories: [...scanDirectories],
    outDirectory,
    tanstackQuery,
    translateSegments,
    localization,
  };
  const compiler: GenerationCompilerState = {
    discovery: new CompilerState(),
    overlay: new CompilerState(),
    routerAnchor: new AnchorState(),
  };
  let closed = false;
  let active: Promise<unknown> | undefined;

  function clear(): void {
    for (const slot of Object.values(compiler)) {
      slot.clear();
    }
  }

  const session: BuilderSession = {
    async generate({ check = false } = {}, stopped = () => false) {
      if (closed) {
        throw new Error("Generation session is disposed");
      }

      if (active) {
        throw new Error("Generation session requires sequential calls");
      }

      let interrupted = false;

      function isStopped(): boolean {
        if (closed) {
          interrupted = true;

          return true;
        }

        const requested = stopped();

        if (closed || requested) {
          interrupted = true;

          return true;
        }

        return false;
      }

      const work = runGeneration(application, { ...fixed, check }, isStopped, compiler);

      active = work;

      try {
        return await work;
      } catch (error) {
        clear();

        throw error;
      } finally {
        active = undefined;

        if (closed || interrupted) {
          clear();
        }
      }
    },
    async dispose(): Promise<void> {
      closed = true;
      await active?.catch(() => undefined);
      clear();
    },
  };

  return session;
}
