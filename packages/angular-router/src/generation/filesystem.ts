import ts from "typescript";
import { basename, dirname, resolve } from "node:path";
import { parsePath } from "../../_core/src/path.js";
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

function localPath(root: string, directory: string): string {
  if (directory === root || basename(directory).startsWith("+")) {
    return "";
  }

  return basename(directory);
}

function unusedBinding(source: ts.SourceFile, preferred: string): string {
  const identifiers = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      identifiers.add(node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  let name = preferred;
  let index = 0;

  while (identifiers.has(name)) {
    index += 1;
    name = `${preferred}${index}`;
  }

  return name;
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
    if (
      comment &&
      /@ts-(?:expect-error|ignore|check|nocheck)\b|@jsx(?:frag|importsource|runtime)?\b|\/\/\/\s*<(?:reference|amd-dependency|amd-module)\b|(?:eslint|oxlint)-disable-next-line\b/i.test(
        scanner.getTokenText(),
      )
    ) {
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

    const sameNames =
      names.size === desiredNames.size && [...names].every((name) => desiredNames.has(name));

    if (!sameNames) {
      const params = declaration.config.get("params");

      if (names.size === 1 && desiredNames.size === 1 && params) {
        const entries = properties(params, "Filesystem local params");
        const oldName = [...names][0];
        const newName = [...desiredNames][0];

        if (entries.size !== 1 || !entries.has(oldName)) {
          fail(params, "Ambiguous filesystem codec change; update local params explicitly");
        }

        const inline = params as ts.ObjectLiteralExpression;
        const property = inline.properties[0];

        if (!ts.isPropertyAssignment(property)) {
          fail(
            property,
            "Filesystem param rename requires a direct property with its codec expression",
          );
        }

        patches.push({
          start: property.name.getStart(source),
          end: property.name.end,
          text: JSON.stringify(newName),
        });
      } else if (names.size === 0 && desiredNames.size === 1 && !params) {
        const name = unusedBinding(source, "filesystemStringParam");

        imports.push(`import { stringParam as ${name} } from "@loozo/angular-router";${newline}`);
        additions.push(`params: { ${JSON.stringify([...desiredNames][0])}: ${name} }`);
      } else {
        fail(
          literal,
          "Ambiguous filesystem codec change; update path and local params explicitly before synchronization",
        );
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
          parentName = unusedBinding(source, "filesystemParent");

          let text = parentName;

          if (ts.isShorthandPropertyAssignment(property)) {
            text = `parent: ${parentName}`;
          }

          patches.push({ start: parent.getStart(source), end: parent.end, text });
        }
      }
    }
  } else if (parentFile) {
    parentName = unusedBinding(source, "filesystemParent");
    additions.push(`parent: ${parentName}`);
  }

  if (parentFile && parentName) {
    // A new binding leaves a still-valid old import and its unrelated uses alone.
    imports.push(
      `import ${parentName} from ${JSON.stringify(specifier(declaration.file, parentFile))};${newline}`,
    );
  }

  if (additions.length > 0) {
    patches.push(addProperty(object, additions.join(", ")));
  }

  if (imports.length > 0) {
    // Static imports are hoisted. Appending at the complete module boundary
    // preserves every existing statement/comment attachment without parsing it.
    patches.push({
      start: source.text.length,
      end: source.text.length,
      text: newline + imports.join(""),
    });
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

  for (const directory of participating) {
    let ancestor = directory;

    while (ancestor !== root) {
      ancestor = dirname(ancestor);

      if (!transparent(root, ancestor)) {
        participating.add(ancestor);
      }
    }
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
    let parentFile: string | undefined;

    if (directory !== root) {
      let parent = dirname(directory);

      while (transparent(root, parent)) {
        parent = dirname(parent);
      }

      parentFile = files.get(parent)!;
    }

    const path = localPath(root, directory);
    const segments = parsePath(path);
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

    for (const segment of segments) {
      if (segment.kind !== "static") {
        imported.push("stringParam");
        config.push(`params: { ${JSON.stringify(segment.name)}: stringParam }`);
      }
    }

    imports.unshift(`import { ${imported.join(", ")} } from "@loozo/angular-router";`);
    authored.set(
      file,
      `${imports.join("\n")}\n\nexport default defineRoute(${JSON.stringify(path)}, { ${config.join(", ")} });\n`,
    );
  }

  return authored;
}
