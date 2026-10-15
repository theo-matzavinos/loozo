import ts from "typescript";
import { basename, dirname, resolve } from "node:path";
import { parsePath, type Segment } from "../../_core/src/path.js";
import { auditPath, metadata } from "./files.js";
import { fail, properties, resolveModule, type Declaration } from "./sources.js";
import { specifier } from "./emit.js";

export interface AutoDefineRoutes {
  filename?: string;
}

interface Patch {
  start: number;
  end: number;
  text: string;
}

export function transparent(root: string, directory: string): boolean {
  return directory !== root && basename(directory).startsWith("-");
}

// Directive comments bind to a following line or the module start, so edits must not move them.
const directive =
  /@ts-(?:expect-error|ignore|check|nocheck)\b|@jsx(?:frag|importsource|runtime)?\b|\/\/\/\s*<(?:reference|amd-dependency|amd-module)\b|(?:eslint|oxlint)-disable-next-line\b/i;

function contribution(root: string, directory: string): string {
  if (directory === root || transparent(root, directory) || basename(directory).startsWith("+")) {
    return "";
  }

  return basename(directory);
}

// Names that bindings, declarations and references use; property names are not bindings.
function identifiers(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  function visit(node: ts.Node): void {
    const propertyName =
      (ts.isPropertyAssignment(node.parent) || ts.isPropertyAccessExpression(node.parent)) &&
      node.parent.name === node;

    if (ts.isIdentifier(node) && !propertyName) {
      names.add(node.text);
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(source, visit);

  return names;
}

function unusedBinding(source: ts.SourceFile, preferred: string): string {
  const used = identifiers(source);
  let name = preferred;
  let index = 0;

  while (used.has(name)) {
    index += 1;
    name = `${preferred}${index}`;
  }

  return name;
}

function parentBinding(source: ts.SourceFile): string {
  if (identifiers(source).has("parent")) {
    return unusedBinding(source, "filesystemParent");
  }

  return "parent";
}

// Reuse a stringParam import from the router, else import it as `stringParam` when that
// identifier is free.
function stringParamBinding(source: ts.SourceFile, imports: string[]): string {
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause?.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@loozo/angular-router"
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;

    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }

    for (const binding of bindings.elements) {
      if (!binding.isTypeOnly && (binding.propertyName ?? binding.name).text === "stringParam") {
        return binding.name.text;
      }
    }
  }

  if (identifiers(source).has("stringParam")) {
    const name = unusedBinding(source, "filesystemStringParam");

    imports.push(`import { stringParam as ${name} } from "@loozo/angular-router";`);

    return name;
  }

  imports.push('import { stringParam } from "@loozo/angular-router";');

  return "stringParam";
}

// After the last import, keeping ordinary same-line comments with the import they annotate. A
// directive or multiline comment there can bind to the next line, so insert before it instead.
function importPosition(source: ts.SourceFile): number {
  let last: ts.ImportDeclaration | undefined;

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      last = statement;
    }
  }

  // Every admitted declaration imports defineRoute.
  let position = last!.end;

  for (const range of ts.getTrailingCommentRanges(source.text, last!.end) ?? []) {
    const comment = source.text.slice(range.pos, range.end);

    if (directive.test(comment) || /[\r\n]/.test(comment)) {
      return last!.end;
    }

    position = range.end;
  }

  return position;
}

// Point the parent property at a binding, as shorthand when it is named `parent` and nothing
// but whitespace separates the key from its value.
function parentValue(
  property: ts.ObjectLiteralElementLike,
  value: ts.Expression,
  name: string,
  source: ts.SourceFile,
): Patch {
  if (ts.isShorthandPropertyAssignment(property)) {
    return { start: value.getStart(source), end: value.end, text: `parent: ${name}` };
  }

  const separator = source.text.slice(property.name!.end, value.getStart(source));

  if (name === "parent" && /^\s*:\s*$/.test(separator)) {
    return { start: property.getStart(source), end: property.end, text: name };
  }

  return { start: value.getStart(source), end: value.end, text: name };
}

function removeSyntax(node: ts.Node, source: ts.SourceFile): Patch {
  const start = node.getStart(source);
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    source.text,
  );

  scanner.setTextPos(node.getFullStart());

  let text = "";
  let hasComments = false;

  while (true) {
    const token = scanner.scan();

    const comment =
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia;
    const trivia =
      comment || token === ts.SyntaxKind.WhitespaceTrivia || token === ts.SyntaxKind.NewLineTrivia;

    if (token === ts.SyntaxKind.EndOfFileToken || (scanner.getTokenPos() >= node.end && !trivia)) {
      break;
    }

    // Include adjacent retained trivia: it too can become module-leading after
    // deletion. Stop at the next actual token, without copying trailing bytes.
    if (comment && directive.test(scanner.getTokenText())) {
      fail(node, "Cannot remove directive-bound filesystem parent syntax; repair it explicitly");
    }

    if (scanner.getTokenPos() >= start && scanner.getTokenPos() < node.end && trivia) {
      text += scanner.getTokenText();
      hasComments ||= comment;
    }
  }

  if (!hasComments) {
    text = "";
  }

  return { start, end: node.end, text };
}

function removeProperty(property: ts.ObjectLiteralElementLike, source: ts.SourceFile): Patch[] {
  const object = property.parent as ts.ObjectLiteralExpression;
  const index = object.properties.indexOf(property);
  const patches = [removeSyntax(property, source)];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source.text,
  );

  if (index < object.properties.length - 1 || object.properties.hasTrailingComma) {
    scanner.setTextPos(property.end);
  } else if (index > 0) {
    scanner.setTextPos(object.properties[index - 1].end);
  } else {
    return patches;
  }

  scanner.scan();
  patches.push({ start: scanner.getTokenPos(), end: scanner.getTextPos(), text: "" });

  return patches;
}

function addProperty(object: ts.ObjectLiteralExpression, text: string): Patch {
  let prefix = "";

  if (object.properties.length > 0 && !object.properties.hasTrailingComma) {
    prefix = ",";
  }

  return { start: object.end - 1, end: object.end - 1, text: `${prefix} ${text} ` };
}

function parentImport(declaration: Declaration, parent: ts.Expression): ts.ImportDeclaration {
  if (!ts.isIdentifier(parent)) {
    fail(parent, "Filesystem parent must directly reference a default import");
  }

  for (const statement of declaration.source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      !statement.importClause?.isTypeOnly &&
      statement.importClause?.name?.text === parent.text &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return statement;
    }
  }

  fail(parent, "Filesystem parent must directly reference a default import");
}

function otherUses(
  source: ts.SourceFile,
  imported: ts.ImportDeclaration,
  parent: ts.Expression,
  checker: ts.TypeChecker,
) {
  const binding = checker.getSymbolAtLocation(imported.importClause!.name!)!;
  let used = false;

  function visit(node: ts.Node): void {
    if (node === imported || node === parent) {
      return;
    }

    if (ts.isIdentifier(node)) {
      let reference = checker.getSymbolAtLocation(node);

      if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
        reference = checker.getShorthandAssignmentValueSymbol(node.parent);
      } else if (ts.isExportSpecifier(node.parent)) {
        reference = checker.getExportSpecifierLocalTargetSymbol(node.parent);
      }

      if (reference === binding) {
        used = true;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  return used;
}

// The builder owns the path, so the fix is in the params or the directories, never the path.
// `opaque` says why the builder can't read the params' keys.
function ambiguousParams(
  node: ts.Node,
  path: string,
  removed: readonly string[],
  added: readonly string[],
  opaque?: string,
): never {
  const changes: string[] = [];

  if (removed.length > 0) {
    changes.push(`removed params: ${removed.join(", ")}`);
  }

  if (added.length > 0) {
    changes.push(`added params: ${added.join(", ")}`);
  }

  let repair = "Edit this file's params to match";

  if (!parsePath(path).some((segment) => segment.kind !== "static")) {
    repair = "Remove this file's params";
  } else if (opaque) {
    repair = `This file's params ${opaque}; write each one as a plain \`name: codec\` property to match`;
  }

  fail(
    node,
    `Ambiguous filesystem params: the directories give path "${path}" (${changes.join("; ")}). ` +
      `${repair}, or move or rename the directory`,
  );
}

// The keys of a direct inline params object, or why the builder can't read them.
function paramKeys(params: ts.Expression): Set<string> | string {
  if (!ts.isObjectLiteralExpression(params)) {
    return "are not an inline object";
  }

  const keys = new Set<string>();

  for (const property of params.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return "use a spread or accessor";
    }

    const name = property.name;

    if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) {
      return "use a computed or numeric key";
    }

    if (keys.has(name.text)) {
      return `repeat the key ${name.text}`;
    }

    keys.add(name.text);
  }

  return keys;
}

function patchDeclaration(
  declaration: Declaration,
  path: string,
  parentFile: string | undefined,
  options: ts.CompilerOptions,
  host: ts.ModuleResolutionHost,
  checker: ts.TypeChecker,
): string {
  const source = declaration.source;
  const assignment = source.statements.find(ts.isExportAssignment)!;
  const call = assignment.expression as ts.CallExpression;
  const literal = call.arguments[0] as ts.StringLiteral;
  const object = call.arguments[1] as ts.ObjectLiteralExpression;
  const patches: Patch[] = [];
  const additions: string[] = [];
  const imports: string[] = [];
  let newline = "\n";

  if (source.text.includes("\r\n")) {
    newline = "\r\n";
  }

  if (declaration.path !== path) {
    const names = new Set<string>();
    const desiredNames = new Set<string>();

    for (const segment of declaration.segments) {
      if (segment.kind !== "static") {
        names.add(segment.name);
      }
    }

    for (const segment of parsePath(path)) {
      if (segment.kind !== "static") {
        desiredNames.add(segment.name);
      }
    }

    const removed: string[] = [];
    const added: string[] = [];

    for (const name of names) {
      if (!desiredNames.has(name)) {
        removed.push(name);
      }
    }

    for (const name of desiredNames) {
      if (!names.has(name)) {
        added.push(name);
      }
    }

    if (removed.length > 0 || added.length > 0) {
      const params = declaration.config.get("params");
      let keys = new Set<string>();

      if (params) {
        const readable = paramKeys(params);

        if (typeof readable === "string") {
          ambiguousParams(params, path, removed, added, readable);
        }

        keys = readable;
      }

      // Params the author already made match the directories need only the path rewritten. A
      // path without params matches only a declaration without `params`, as at runtime.
      let reconciled = keys.size === desiredNames.size;

      if (desiredNames.size === 0 && params) {
        reconciled = false;
      }

      for (const name of desiredNames) {
        if (!keys.has(name)) {
          reconciled = false;
        }
      }

      if (!reconciled) {
        if (removed.length === 1 && added.length === 1 && params) {
          const entries = properties(params, "Filesystem local params");
          const [oldName] = removed;
          const [newName] = added;

          if (entries.size !== names.size || !entries.has(oldName)) {
            ambiguousParams(params, path, removed, added);
          }

          const property = entries.get(oldName)!.parent;

          if (!ts.isPropertyAssignment(property)) {
            ambiguousParams(property, path, removed, added, "use a shorthand property");
          }

          patches.push({
            start: property.name.getStart(source),
            end: property.name.end,
            text: JSON.stringify(newName),
          });
        } else if (removed.length === 0 && params) {
          // Pure additions keep every authored codec and give each new param the seed's codec.
          for (const name of names) {
            if (!keys.has(name)) {
              ambiguousParams(params, path, removed, added);
            }
          }

          if (keys.size !== names.size) {
            ambiguousParams(params, path, removed, added);
          }

          const name = stringParamBinding(source, imports);
          const appended: string[] = [];

          for (const param of added) {
            appended.push(`${JSON.stringify(param)}: ${name}`);
          }

          patches.push(addProperty(params as ts.ObjectLiteralExpression, appended.join(", ")));
        } else if (names.size === 0 && !params) {
          const name = stringParamBinding(source, imports);
          const entries: string[] = [];

          for (const param of added) {
            entries.push(`${JSON.stringify(param)}: ${name}`);
          }

          additions.push(`params: { ${entries.join(", ")} }`);
        } else {
          ambiguousParams(literal, path, removed, added);
        }
      }
    }

    patches.push({ start: literal.getStart(source), end: literal.end, text: JSON.stringify(path) });
  }

  const parent = declaration.config.get("parent");
  let parentName: string | undefined;

  if (parent) {
    const imported = parentImport(declaration, parent);
    const module = imported.moduleSpecifier as ts.StringLiteral;
    const resolved = resolveModule(module.text, declaration.file, options, host);
    const usedElsewhere = otherUses(source, imported, parent, checker);

    if (!parentFile || resolved !== parentFile) {
      if (parentFile && !usedElsewhere && !imported.importClause?.namedBindings) {
        patches.push({
          start: module.getStart(source),
          end: module.end,
          text: JSON.stringify(specifier(declaration.file, parentFile)),
        });

        // A specifier that still resolves names a different parent, and so does its binding. An
        // unresolvable one went stale because a file moved or was deleted; its name may still fit.
        const binding = imported.importClause!.name!;

        if (resolved && binding.text !== "parent" && !identifiers(source).has("parent")) {
          patches.push({ start: binding.getStart(source), end: binding.end, text: "parent" });
          patches.push(
            parentValue(parent.parent as ts.PropertyAssignment, parent, "parent", source),
          );
        }
      } else {
        if (!resolved && (usedElsewhere || imported.importClause?.namedBindings)) {
          fail(
            imported,
            "Stale parent import has unrelated uses; repair it explicitly before filesystem synchronization",
          );
        }

        if (!usedElsewhere && !imported.importClause?.namedBindings) {
          patches.push(removeSyntax(imported, source));
        }

        const property = object.properties.find(
          (entry) =>
            entry.name &&
            (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) &&
            entry.name.text === "parent",
        )!;

        if (!parentFile) {
          patches.push(...removeProperty(property, source));
        } else {
          parentName = parentBinding(source);
          patches.push(parentValue(property, parent, parentName, source));
        }
      }
    }
  } else if (parentFile) {
    parentName = parentBinding(source);

    if (parentName === "parent") {
      additions.push("parent");
    } else {
      additions.push(`parent: ${parentName}`);
    }
  }

  if (parentFile && parentName) {
    // A new binding leaves a still-valid old import and its unrelated uses alone.
    imports.push(
      `import ${parentName} from ${JSON.stringify(specifier(declaration.file, parentFile))};`,
    );
  }

  if (additions.length > 0) {
    patches.push(addProperty(object, additions.join(", ")));
  }

  if (imports.length > 0) {
    const position = importPosition(source);
    let text = "";

    for (const statement of imports) {
      text += newline + statement;
    }

    patches.push({ start: position, end: position, text });
  }

  patches.sort((a, b) => b.start - a.start);

  let bytes = source.text;

  for (const patch of patches) {
    bytes = bytes.slice(0, patch.start) + patch.text + bytes.slice(patch.end);
  }

  // ts.sys.readFile strips a UTF-8 BOM; compiler positions refer to source.text.
  // Apply positions there, then restore the raw prefix if the host stripped it.
  if (declaration.rawText.startsWith("\uFEFF") && !source.text.startsWith("\uFEFF")) {
    bytes = "\uFEFF" + bytes;
  }

  return bytes;
}

export async function synchronize(
  root: string,
  declarations: readonly Declaration[],
  pages: ReadonlyMap<string, string>,
  options: ts.CompilerOptions,
  { filename = "route.ts" }: AutoDefineRoutes,
  checker: ts.TypeChecker,
): Promise<Map<string, string>> {
  const byDirectory = new Map<string, Declaration>();
  // Only directories with a page or a declaration become records. Others contribute their
  // path segment to the records below them.
  const participating = new Set<string>();

  for (const declaration of declarations) {
    const directory = dirname(declaration.file);

    if (byDirectory.has(directory)) {
      fail(declaration.source, "Competing colocated declarations");
    }

    byDirectory.set(directory, declaration);

    if (transparent(root, directory)) {
      for (const key of declaration.config.keys()) {
        if (key !== "parent") {
          fail(
            declaration.source,
            "Transparent directory declaration has incompatible authored behavior",
          );
        }
      }

      continue;
    }

    participating.add(directory);
  }

  for (const [directory, page] of pages) {
    if (transparent(root, directory)) {
      throw new Error(`Transparent directory cannot own a page: ${page}`);
    }

    participating.add(directory);
  }

  const files = new Map<string, string>();

  for (const directory of [...participating].sort()) {
    let file = byDirectory.get(directory)?.file;

    if (!file) {
      file = resolve(directory, filename);
      await auditPath(file);

      if (await metadata(file)) {
        throw new Error(`Filesystem seed collision with an unadmitted file: ${file}`);
      }
    }

    files.set(directory, file);
  }

  const plannedFiles = new Set(files.values());
  const host: ts.ModuleResolutionHost = {
    ...ts.sys,
    fileExists: (file) => plannedFiles.has(resolve(file)) || ts.sys.fileExists(file),
  };
  const authored = new Map<string, string>();

  for (const [directory, file] of files) {
    const contributions = [contribution(root, directory)];
    let ancestor = directory;
    let parentFile: string | undefined;

    while (ancestor !== root && !parentFile) {
      ancestor = dirname(ancestor);
      parentFile = files.get(ancestor);

      if (!parentFile) {
        contributions.unshift(contribution(root, ancestor));
      }
    }

    const parts: string[] = [];

    for (const part of contributions) {
      if (part !== "") {
        parts.push(part);
      }
    }

    const path = parts.join("/");
    let segments: readonly Segment[];

    try {
      segments = parsePath(path);
    } catch (error) {
      throw new Error(`Invalid filesystem path "${path}" for ${file}: ${(error as Error).message}`);
    }

    const declaration = byDirectory.get(directory);

    if (declaration) {
      const bytes = patchDeclaration(declaration, path, parentFile, options, host, checker);

      if (bytes !== declaration.rawText) {
        authored.set(file, bytes);
      }

      continue;
    }

    const imported = ["defineRoute"];
    const config: string[] = [];
    const imports: string[] = [];

    if (parentFile) {
      imports.push(`import parent from ${JSON.stringify(specifier(file, parentFile))};`);
      config.push("parent");
    }

    const params = new Set<string>();

    for (const segment of segments) {
      if (segment.kind !== "static") {
        params.add(segment.name);
      }
    }

    if (params.size > 0) {
      const entries: string[] = [];

      for (const name of params) {
        entries.push(`${JSON.stringify(name)}: stringParam`);
      }

      imported.push("stringParam");
      config.push(`params: { ${entries.join(", ")} }`);
    }

    let object = "{}";

    if (config.length > 0) {
      object = `{ ${config.join(", ")} }`;
    }

    imports.unshift(`import { ${imported.join(", ")} } from "@loozo/angular-router";`);
    authored.set(
      file,
      `${imports.join("\n")}\n\nexport default defineRoute(${JSON.stringify(path)}, ${object});\n`,
    );
  }

  return authored;
}
