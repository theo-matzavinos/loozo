import ts from "typescript";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePath, type Segment } from "../../_core/src/path.js";
import { auditPath, contains, metadata, walk, workspacePaths, markers } from "./files.js";

export interface Declaration {
  file: string;
  id: string;
  source: ts.SourceFile;
  config: Map<string, ts.Expression>;
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

export interface Sources {
  configFile: string;
  parsed: ts.ParsedCommandLine;
  roots: string[];
  output: string;
  encountered: string[];
  declarations: Declaration[];
  factoryEntry: string;
  deferredFactories: Declaration[];
}

export function fail(node: ts.Node, message: string): never {
  const source = node.getSourceFile();
  const position = source.getLineAndCharacterOfPosition(node.getStart());

  throw new Error(`${source.fileName}:${position.line + 1}:${position.character + 1}: ${message}`);
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
  return ts.resolveModuleName(name, source, options, host).resolvedModule?.resolvedFileName;
}

function namedImport(
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

async function genuineImport(
  statement: ts.ImportDeclaration,
  expected: string,
  options: ts.CompilerOptions,
): Promise<boolean> {
  const actual = resolveModule(moduleText(statement), statement.getSourceFile().fileName, options);

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

const keys = new Set([
  "parent",
  "params",
  "search",
  "resolve",
  "runGuardsAndResolvers",
  "redirect",
  "fragments",
  "canActivate",
  "canActivateChild",
  "canMatch",
  "canDeactivate",
  "providers",
  "title",
  "data",
]);

export async function discover(
  workspace: string,
  config: string,
  scans: readonly string[],
  out: string,
): Promise<Sources> {
  const access = await workspacePaths(workspace);
  const configFile = await access.resolve(config);
  const configDirectory = dirname(configFile);
  const output = await access.resolve(out);
  const resolvedRoots = await Promise.all(
    scans.map((scan) => access.resolve(resolve(configDirectory, scan))),
  );
  const roots = [...new Set(resolvedRoots)].sort();

  for (const root of roots) {
    if (contains(root, output) || contains(output, root)) {
      throw new Error(`Output and scan directory overlap: ${output}; ${root}`);
    }
  }

  await Promise.all([auditPath(configFile), auditPath(output)]);

  const encountered = [
    ...new Set((await Promise.all(roots.map((root) => walk(root)))).flat()),
  ].sort();
  const fatal: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configFile,
    {},
    {
      ...ts.sys,
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

  const candidates: string[] = [];

  for (const file of parsed.fileNames) {
    const normalized = await access.resolve(file);

    if (
      !normalized.endsWith(".ts") ||
      normalized.endsWith(".d.ts") ||
      normalized.split(sep).includes("node_modules")
    ) {
      continue;
    }

    await auditPath(normalized);

    if (roots.some((root) => contains(root, normalized))) {
      candidates.push(normalized);
    }
  }

  candidates.sort();

  const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const manifestBytes = await readFile(resolve(packageRoot, "package.json"), "utf8");
  const manifest = JSON.parse(manifestBytes);
  const factoryEntry = await realpath(resolve(packageRoot, manifest.exports["."].types));
  const declarations: Declaration[] = [];
  const pages = new Map<string, string>();
  const deferredFactories: Declaration[] = [];
  const syntaxProgram = ts.createProgram({
    rootNames: candidates,
    options: parsed.options,
    host: ts.createCompilerHost(parsed.options, true),
  });

  for (const file of candidates) {
    const bytes = await readFile(file, "utf8");

    if (
      file.endsWith(`${sep}route.generated.ts`) &&
      bytes.split("\n", 1)[0] === markers["route.generated.ts"]
    ) {
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

    if (ts.isClassDeclaration(node)) {
      await component(source, node, parsed.options);

      if (pages.has(dirname(file))) {
        fail(node, `Competing colocated components: ${pages.get(dirname(file))}; ${file}`);
      }

      pages.set(dirname(file), file);

      continue;
    }

    if (!ts.isExportAssignment(node) || !ts.isCallExpression(node.expression)) {
      fail(node, "Default export must be a direct defineRoute call or Component class");
    }

    const call = node.expression;
    const imported = namedImport(source, call.expression, "defineRoute");

    if (!imported) {
      fail(
        call,
        "Factory must be a genuine named value import of defineRoute, not a local wrapper/alias",
      );
    }

    const [path, configNode] = call.arguments;

    if (call.arguments.length !== 2 || !path || !ts.isStringLiteral(path) || !configNode) {
      fail(call, "defineRoute requires a literal path and inline config");
    }

    const config = properties(configNode, "Route config");

    for (const key of config.keys()) {
      if (!keys.has(key)) {
        fail(configNode, `Unknown or generation-owned route config key: ${key}`);
      }
    }

    let segments: readonly Segment[];

    try {
      segments = parsePath(path.text);
    } catch (error) {
      fail(path, String(error));
    }

    const needsParams = segments.some((segment) => segment.kind !== "static");

    if (needsParams !== config.has("params")) {
      fail(configNode, "Local params must be present exactly when the path declares placeholders");
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
      config,
      path: path.text,
      segments,
      effective: [],
      children: [],
      retained: true,
      full: false,
    };
    const ownFacade = resolve(dirname(file), "route.generated.ts");
    const resolved = resolveModule(moduleText(imported), file, parsed.options);
    const facadeSpelling = resolve(dirname(file), moduleText(imported)).replace(/\.js$/, ".ts");

    if (resolved === ownFacade || (!resolved && facadeSpelling === ownFacade)) {
      deferredFactories.push(declaration);
    } else {
      const genuine = await genuineImport(imported, factoryEntry, parsed.options);

      if (!genuine) {
        fail(
          imported,
          "defineRoute import does not resolve to this package's concrete public entry",
        );
      }
    }

    declarations.push(declaration);
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

      const file = resolveModule(moduleText(statement), declaration.file, compilerOptions);
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

      if (
        declaration.page ||
        declaration.children.length ||
        declaration.config.has("canActivate") ||
        declaration.config.has("canMatch")
      ) {
        fail(redirect, "Redirect cannot have a component, children, canActivate or canMatch");
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

  return {
    configFile,
    parsed,
    roots,
    output,
    encountered,
    declarations,
    factoryEntry,
    deferredFactories,
  };
}
