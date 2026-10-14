import ts from "typescript";
import { frameworkFailures } from "../client.js";
import type { ErrorMetadata } from "../client.js";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareLaunchRoutes,
  createValidationProgram,
  validateRoutes,
  planOutputs,
  publish,
  walk,
  auditPath,
  launchMarkers,
  fail,
  properties,
  namedImport,
  genuineImport,
  specifier,
  CompilerState,
  AnchorState,
} from "@loozo/angular-router/_generation";
import type { Declaration, Sources, LaunchDeclaration } from "@loozo/angular-router/_generation";

export interface GenerationOptions {
  tsconfig: string;
  scanDirectories: string[];
  outDirectory: string;
  check?: boolean;
}
export interface GenerationSession {
  generate(options?: Pick<GenerationOptions, "check">, stopped?: () => boolean): Promise<void>;
  dispose(): Promise<void>;
}

interface GenerationCompilerState {
  discovery: CompilerState;
  overlay: CompilerState;
  routerAnchor: AnchorState;
  launchAnchor: AnchorState;
}

interface RpcGroup {
  declaration: LaunchDeclaration;
  owner: Declaration;
  namespace: string;
  id: string;
  methods: {
    name: string;
    input: boolean;
    kind: "query" | "mutation";
    errors: ErrorMetadata[];
    call: ts.CallExpression;
  }[];
}

function directCall(node: ts.Expression, label: string): ts.CallExpression {
  if (!ts.isCallExpression(node) || node.typeArguments?.length) {
    fail(node, `${label} requires a direct nongeneric factory call`);
  }

  return node;
}

function guards(node: ts.Expression | undefined): void {
  if (node && (!ts.isArrayLiteralExpression(node) || node.elements.some(ts.isSpreadElement))) {
    fail(node, "canActivate must be an explicit inline array without spreads");
  }
}

function onlyKeys(fields: Map<string, ts.Expression>, allowed: string[], node: ts.Node): void {
  for (const key of fields.keys()) {
    if (!allowed.includes(key)) {
      fail(node, `Unsupported Launch option: ${key}`);
    }
  }
}

function errorMetadata(node: ts.Expression | undefined): ErrorMetadata[] {
  const result: ErrorMetadata[] = [];

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

async function groupsOf(
  sources: Sources,
): Promise<{ context: LaunchDeclaration; groups: RpcGroup[] }> {
  const launch = sources.launch!;
  const contexts = launch.declarations.filter((value) => value.kind === "defineContext");

  if (contexts.length !== 1) {
    throw new Error(
      `Launch requires exactly one default defineContext per application; found ${contexts.length}`,
    );
  }

  const context = contexts[0];

  if (context.call.arguments.length !== 1 || context.call.typeArguments?.length) {
    fail(context.call, "defineContext requires exactly one factory");
  }

  const groups: RpcGroup[] = [];
  const owners = new Set<Declaration>();

  for (const declaration of launch.declarations) {
    if (declaration.kind !== "defineRpc") {
      continue;
    }

    const owner = sources.declarations.find(
      (route) => dirname(route.file) === dirname(declaration.file),
    );

    if (!owner || !owner.retained || owner.target) {
      fail(declaration.call, "RPC requires a colocated retained ordinary route owner");
    }

    if (owners.has(owner)) {
      fail(declaration.call, "Only one RPC group per route owner is supported");
    }

    owners.add(owner);

    const call = directCall(declaration.call, "defineRpc");
    const [namespace, methodsNode, options] = call.arguments;

    if (
      call.arguments.length < 2 ||
      call.arguments.length > 3 ||
      !namespace ||
      !ts.isStringLiteral(namespace) ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(namespace.text) ||
      !methodsNode
    ) {
      fail(
        call,
        "defineRpc requires a literal identifier namespace, inline methods and optional inline options",
      );
    }

    if (namespace.text === "__proto__") {
      fail(namespace, "RPC namespace '__proto__' is reserved");
    }

    if (options) {
      const fields = properties(options, "RPC group options");

      onlyKeys(fields, ["canActivate"], options);
      guards(fields.get("canActivate"));
    }

    const methods: RpcGroup["methods"] = [];

    for (const [name, value] of properties(methodsNode, "RPC methods")) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        fail(value, "RPC methods must be identifier names");
      }

      if (name === "__proto__") {
        fail(value, "RPC procedure '__proto__' is reserved");
      }

      const procedure = directCall(value, "query/mutation");
      let kind: "query" | "mutation" | undefined;

      for (const candidate of ["query", "mutation"] as const) {
        const imported = namedImport(value.getSourceFile(), procedure.expression, candidate);

        if (imported && (await genuineImport(imported, launch.typeEntry, sources.parsed.options))) {
          kind = candidate;
        }
      }

      if (!kind) {
        fail(
          procedure,
          "Procedure must directly call a genuine named query import or mutation import",
        );
      }

      if (procedure.arguments.length !== 1) {
        fail(procedure, `${kind} requires one inline options object`);
      }

      const fields = properties(procedure.arguments[0], "Procedure options");

      onlyKeys(fields, ["handler", "input", "canActivate", "errors"], procedure);

      if (!fields.has("handler")) {
        fail(procedure, `${kind} requires handler`);
      }

      guards(fields.get("canActivate"));
      methods.push({
        name,
        input: fields.has("input"),
        kind,
        errors: errorMetadata(fields.get("errors")),
        call: procedure,
      });
    }

    const identity = relative(dirname(sources.configFile), declaration.file).split(sep).join("/");
    const id = createHash("sha256").update(`launch-v1\0${identity}`).digest("hex").slice(0, 24);

    groups.push({ declaration, owner, namespace: namespace.text, id, methods });
  }

  return { context, groups };
}

interface PayloadImport {
  from: string;
  target: string;
  local: string;
}

function emitLaunch(
  sources: Sources,
  desired: Map<string, string>,
  context: LaunchDeclaration,
  groups: RpcGroup[],
  appId: string,
): PayloadImport[] {
  const payloads: PayloadImport[] = [];

  function payloadImport(from: string, target: string, local: string, typeOnly = false): string {
    payloads.push({ from, target, local });

    let keyword = "import";

    if (typeOnly) {
      keyword += " type";
    }

    return `${keyword} ${local} from ${JSON.stringify(specifier(from, target))};`;
  }

  const registration = resolve(sources.output, "context.generated.d.ts");

  add(
    desired,
    registration,
    `${launchMarkers["context.generated.d.ts"]}\nimport type { ContextOf } from '@loozo/angular-launch/server';\n${payloadImport(registration, context.file, "context", true)}\ndeclare module '@loozo/angular-launch/server' { interface Register { context: ContextOf<typeof context>; } }\n`,
  );

  const registry = resolve(sources.output, "server.generated.ts");
  const server = [
    launchMarkers["server.generated.ts"],
    payloadImport(registry, context.file, "context"),
    `import { createRequestScope, handleRpc, provideLaunchServer } from '@loozo/angular-launch/server';`,
  ];

  for (let index = 0; index < groups.length; index += 1) {
    server.push(payloadImport(registry, groups[index].declaration.file, `group${index}`));
  }

  server.push(
    `export const registry = { ${groups.map((group, index) => `${JSON.stringify(group.id)}: group${index}`).join(", ")} };`,
    `export const appBinding = { id: ${JSON.stringify(appId)}, context };`,
    `export const createContext = (request: Request) => createRequestScope(appBinding, request);`,
    `export const handleRequest = (request: Request) => handleRpc(registry, appBinding, request);`,
    `export const provideServer = () => provideLaunchServer(registry, appBinding);`,
    "",
  );
  add(desired, registry, server.join("\n"));

  const byOwner = new Map(groups.map((group) => [group.owner, group]));

  for (const owner of sources.declarations) {
    if (!owner.retained) {
      continue;
    }

    const available: RpcGroup[] = [];
    const namespaces = new Set<string>();
    let current: Declaration | undefined = owner;

    while (current) {
      const group = byOwner.get(current);

      if (group) {
        if (namespaces.has(group.namespace)) {
          fail(group.declaration.call, `Duplicate RPC namespace in ancestry: ${group.namespace}`);
        }

        namespaces.add(group.namespace);
        available.unshift(group);
      }

      current = current.parent;
    }

    const file = resolve(dirname(owner.file), "rpc.generated.ts");
    const lines = [
      launchMarkers["rpc.generated.ts"],
      `import { injectClient } from '@loozo/angular-launch/_generated';`,
      `import type { Client } from '@loozo/angular-launch';`,
    ];
    const metadata: Record<string, unknown> = Object.create(null);

    for (let index = 0; index < available.length; index += 1) {
      const group = available[index];

      lines.push(payloadImport(file, group.declaration.file, `group${index}`, true));
      metadata[group.namespace] = {
        id: group.id,
        methods: group.methods.map(({ name, input, kind, errors }) => ({
          name,
          input,
          kind,
          errors,
        })),
      };
    }

    lines.push(
      `export type Rpc = { ${available.map((group, index) => `readonly ${JSON.stringify(group.namespace)}: Client<typeof group${index}>`).join("; ")} };`,
      `export function injectRpc(): Rpc { return injectClient(${JSON.stringify(metadata)} as const) as Rpc; }`,
      "",
    );
    add(desired, file, lines.join("\n"));
  }

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

async function validateBindings(
  sources: Sources,
  validation: ReturnType<typeof createValidationProgram>,
  context: LaunchDeclaration,
  groups: RpcGroup[],
  compiler?: GenerationCompilerState,
): Promise<void> {
  const { program, host } = validation;
  const checker = program.getTypeChecker();
  const entryFile = sources.launch!.typeEntry;
  const canonicalOptions = {
    ...sources.parsed.options,
    paths: undefined,
    baseUrl: undefined,
    skipLibCheck: false,
  };
  const anchor = await (compiler?.launchAnchor ?? new AnchorState()).anchor(
    entryFile,
    ["defineContext", "defineRpc", "query", "mutation"],
    canonicalOptions,
  );
  const actualEntry = program.getSourceFile(entryFile)!;
  const actualModule = checker.getSymbolAtLocation(actualEntry)!;
  const expectedCalls = new Map<string, string>();

  function key(node: ts.Node): string {
    return `${node.getSourceFile().fileName}:${node.pos}`;
  }

  expectedCalls.set(key(context.call), "defineContext");

  for (const group of groups) {
    expectedCalls.set(key(group.declaration.call), "defineRpc");

    for (const method of group.methods) {
      expectedCalls.set(key(method.call), method.kind);
    }
  }

  const promises: Promise<void>[] = [];

  for (const source of program.getSourceFiles()) {
    if (!sources.parsed.fileNames.includes(source.fileName)) {
      continue;
    }

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const expected = expectedCalls.get(key(node));
        let spelling: string | undefined;
        const invoked = unalias(checker, checker.getSymbolAtLocation(node.expression));

        for (const name of ["defineContext", "defineRpc", "query", "mutation"]) {
          const exported = unalias(
            checker,
            checker.getExportsOfModule(actualModule).find((symbol) => symbol.name === name),
          );

          if (invoked && invoked === exported) {
            spelling = name;
          }

          if (expected && namedImport(source, node.expression, name)) {
            spelling = name;
          }
        }

        if (expected || spelling) {
          if (!expected || spelling !== expected) {
            fail(
              node,
              "Launch factory calls must be default declarations or inline group procedures",
            );
          }

          const imported = namedImport(source, node.expression, expected)!;

          promises.push(
            (async () => {
              if (!(await genuineImport(imported, entryFile, sources.parsed.options, host))) {
                fail(node, "Launch factory import provenance is not concrete");
              }

              const actual = unalias(checker, checker.getSymbolAtLocation(node.expression));
              const exported = unalias(
                checker,
                checker.getExportsOfModule(actualModule).find((symbol) => symbol.name === expected),
              );
              const anchored = anchor.get(expected);

              if (
                !actual?.declarations?.length ||
                actual !== exported ||
                actual.declarations.length !== anchored?.length
              ) {
                fail(node, "Launch factory binding is not the concrete canonical export");
              }

              for (let index = 0; index < actual.declarations.length; index += 1) {
                const a = actual.declarations[index];
                const b = anchored[index];

                if (
                  (await realpath(a.getSourceFile().fileName)) !== b.file ||
                  a.pos !== b.pos ||
                  a.end !== b.end ||
                  a.kind !== b.kind
                ) {
                  fail(node, "Launch factory underlying declaration was redirected");
                }
              }
            })(),
          );
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(source);
  }

  await Promise.all(promises);

  for (const group of groups) {
    const source = program.getSourceFile(group.declaration.file)!;
    const assignment = source.statements.find(ts.isExportAssignment)!;
    const call = assignment.expression as ts.CallExpression;

    for (const expression of properties(call.arguments[1], "RPC methods").values()) {
      const procedure = expression as ts.CallExpression;
      const fields = properties(procedure.arguments[0], "Procedure options");
      const input = fields.get("input");

      if (input && hasNonConcreteSchemaBranch(checker.getTypeAtLocation(input))) {
        fail(
          input,
          "Explicit query input must have a concrete Standard Schema type (also required for mutations)",
        );
      }

      const errors = fields.get("errors");

      if (errors) {
        for (const value of properties(errors, "Declared RPC errors").values()) {
          const data = properties(value, "Declared RPC error").get("data")!;

          if (hasNonConcreteSchemaBranch(checker.getTypeAtLocation(data))) {
            fail(data, "Declared error data must have a concrete Standard Schema type");
          }
        }
      }
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

// Check generation's own domain before publication: generated outputs, discovered
// route/Launch declarations and application TypeScript files that directly import
// a generated output (import/export-from, import(), import types, import =). Other
// application files and dependencies are left to the application's own build.
function checkGeneratedDomain(
  sources: Sources,
  validation: ReturnType<typeof createValidationProgram>,
  generated: ReadonlyMap<string, string>,
): void {
  const { program, host } = validation;
  const options = program.getCompilerOptions();
  const selected = new Set(generated.keys());

  for (const declaration of sources.declarations) {
    selected.add(declaration.file);
  }

  for (const declaration of sources.launch!.declarations) {
    selected.add(declaration.file);
  }

  const cache = ts.createModuleResolutionCache(
    program.getCurrentDirectory(),
    (file) => host.getCanonicalFileName(file),
    options,
  );

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

      if (resolved && generated.has(resolve(resolved.resolvedFileName))) {
        selected.add(file);

        break;
      }
    }
  }

  const declarationEmit = options.declaration || options.composite;
  const diagnostics: ts.Diagnostic[] = [...program.getOptionsDiagnostics()];

  for (const file of selected) {
    const source = program.getSourceFile(file)!;

    diagnostics.push(
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    );

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

async function runGeneration(
  workspace: string,
  options: GenerationOptions,
  stopped: () => boolean,
  compiler?: GenerationCompilerState,
): Promise<void> {
  // The built package root (dist/ in the workspace, the tarball root when installed).
  const root = fileURLToPath(new URL("../", import.meta.url));
  const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const typeEntry = await realpath(resolve(root, manifest.exports["./server"].types));
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

  const { sources, desired } = await prepareLaunchRoutes(
    application,
    options,
    typeEntry,
    compiler?.discovery,
  );

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

  const { context, groups } = await groupsOf(sources);

  const appManifest = JSON.parse(await readFile(resolve(application, "package.json"), "utf8"));

  if (typeof appManifest.name !== "string" || appManifest.name.length === 0) {
    throw new Error("Launch application package.json requires a name for generated app identity");
  }

  const appId = createHash("sha256")
    .update("launch-app-v1\0")
    .update(appManifest.name)
    .update("\0")
    .update(relative(application, sources.configFile).split(sep).join("/"))
    .update("\0")
    .update(relative(application, context.file).split(sep).join("/"))
    .update("\0")
    .update(context.call.getSourceFile().text)
    .digest("hex");
  const payloads = emitLaunch(sources, desired, context, groups, appId);

  await auditPath(sources.output);

  const outputInventory = await walk(sources.output);
  const globals = [
    "routes.generated.ts",
    "destinations.generated.ts",
    "context.generated.d.ts",
    "server.generated.ts",
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
  await validateBindings(sources, validation, context, groups, compiler);
  checkGeneratedDomain(sources, validation, desired);
  publish(plan, options.check === true, stopped, new Map(), new Set());
}

export function generate(
  workspace: string,
  options: GenerationOptions,
  stopped: () => boolean = () => false,
): Promise<void> {
  return runGeneration(workspace, options, stopped);
}

/** Owns compiler reuse for one explicitly sequenced application-generation lifetime. */
export function createGenerationSession(
  workspace: string,
  { tsconfig, scanDirectories, outDirectory }: Omit<GenerationOptions, "check">,
): GenerationSession {
  const application = resolve(workspace);
  const fixed = { tsconfig, scanDirectories: [...scanDirectories], outDirectory };
  const compiler: GenerationCompilerState = {
    discovery: new CompilerState(),
    overlay: new CompilerState(),
    routerAnchor: new AnchorState(),
    launchAnchor: new AnchorState(),
  };
  let closed = false;
  let active: Promise<void> | undefined;

  function clear(): void {
    for (const slot of Object.values(compiler)) {
      slot.clear();
    }
  }

  return {
    async generate({ check = false } = {}, stopped = () => false): Promise<void> {
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
        await work;
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
}
