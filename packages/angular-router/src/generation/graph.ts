import ts from "typescript";
import { extname, resolve, sep } from "node:path";

/** How a module reference names its module. */
export type ReferenceForm =
  | "import"
  | "export"
  | "dynamic import"
  | "import type"
  | "import ="
  | "require"
  | "reference";

/** A reference that executes its module synchronously when the referencing module evaluates. */
export type EdgeKind =
  | "value import"
  | "require"
  | "import ="
  | "type-specifier import under verbatimModuleSyntax";

export interface ModuleReference {
  readonly form: ReferenceForm;
  // The literal specifier; absent when it's computed or a `/// <reference path>`.
  readonly specifier?: ts.StringLiteralLike;
  // The specifier's text, a reference path, or a computed specifier's expression text.
  readonly text: string;
  readonly computed: boolean;
  // Where a diagnostic about it points.
  readonly position: number;
  readonly edge?: EdgeKind;
}

// Every specifier element inline `type` (no default, no namespace): TypeScript erases the
// declaration unless verbatimModuleSyntax keeps it as `import {} from "m"`.
function typeSpecifiersOnly(elements: readonly ts.ImportOrExportSpecifier[]): boolean {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}

function importEdge(node: ts.ImportDeclaration, verbatim: boolean): EdgeKind | undefined {
  const clause = node.importClause;

  if (!clause) {
    return "value import";
  }

  if (clause.isTypeOnly) {
    return undefined;
  }

  const named = clause.namedBindings;

  if (!clause.name && named && ts.isNamedImports(named) && typeSpecifiersOnly(named.elements)) {
    if (verbatim) {
      return "type-specifier import under verbatimModuleSyntax";
    }

    return undefined;
  }

  // TypeScript can elide a value specifier used only as a type, but Angular's compiler keeps
  // imports a decorated class uses for DI, so elision isn't modeled.
  return "value import";
}

function exportEdge(node: ts.ExportDeclaration, verbatim: boolean): EdgeKind | undefined {
  if (node.isTypeOnly) {
    return undefined;
  }

  const clause = node.exportClause;

  if (clause && ts.isNamedExports(clause) && typeSpecifiersOnly(clause.elements)) {
    if (verbatim) {
      return "type-specifier import under verbatimModuleSyntax";
    }

    return undefined;
  }

  return "value import";
}

/**
 * Every module reference in `source`: import and export declarations, dynamic `import()`,
 * import types, `import x = require()`, literal `require("m")` calls and
 * `/// <reference path>`, each with the runtime edge it makes, if any.
 */
export function moduleReferences(source: ts.SourceFile, verbatim: boolean): ModuleReference[] {
  const references: ModuleReference[] = [];

  function literal(
    form: ReferenceForm,
    node: ts.Node | undefined,
    edge: EdgeKind | undefined,
    at: ts.Node,
  ): void {
    if (node && ts.isStringLiteralLike(node)) {
      references.push({
        form,
        specifier: node,
        text: node.text,
        computed: false,
        position: node.getStart(source),
        edge,
      });
    } else if (node && (form === "dynamic import" || form === "require")) {
      references.push({
        form,
        text: node.getText(source),
        computed: true,
        position: at.getStart(source),
      });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      literal("import", node.moduleSpecifier, importEdge(node, verbatim), node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      literal("export", node.moduleSpecifier, exportEdge(node, verbatim), node);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      literal("dynamic import", node.arguments[0], undefined, node);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1
    ) {
      literal("require", node.arguments[0], "require", node);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      literal("import type", node.argument.literal, undefined, node);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      let edge: EdgeKind | undefined;

      if (!node.isTypeOnly) {
        edge = "import =";
      }

      literal("import =", node.moduleReference.expression, edge, node);
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  for (const reference of source.referencedFiles) {
    references.push({
      form: "reference",
      text: reference.fileName,
      computed: false,
      position: reference.pos,
    });
  }

  return references;
}

const implementations = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
// A declaration file is opaque; its runtime sibling is what executes.
const siblings: readonly [string, readonly string[]][] = [
  [".d.mts", [".mjs"]],
  [".d.cts", [".cjs"]],
  [".d.ts", [".js", ".jsx"]],
];

function scriptKind(file: string): ts.ScriptKind {
  switch (extname(file)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

/** One runtime edge: a reference and the files it executes. */
export interface Edge {
  readonly from: string;
  readonly reference: ModuleReference;
  readonly kind: EdgeKind;
  // The resolved module; undefined for an unresolved or package (leaf) module.
  readonly resolved?: string;
  // The implementation files the edge runs: the resolved file, or a declaration's runtime
  // siblings; empty for leaves.
  readonly targets: readonly string[];
}

/**
 * The synchronous runtime import graph over application modules: every resolved
 * implementation file in any format TypeScript admits, program file or not, and each
 * declaration file's runtime sibling. Package entries, arbitrary-extension declarations,
 * JSON and declarations without a runtime sibling are leaves.
 */
export class RuntimeGraph {
  readonly #program: ts.Program;
  readonly #options: ts.CompilerOptions;
  readonly #host: ts.ModuleResolutionHost;
  readonly #verbatim: boolean;
  readonly #edges = new Map<string, Edge[]>();

  constructor(program: ts.Program, host: ts.ModuleResolutionHost) {
    this.#program = program;
    this.#options = program.getCompilerOptions();
    this.#host = host;
    this.#verbatim = this.#options.verbatimModuleSyntax === true;
  }

  source(file: string): ts.SourceFile {
    const existing = this.#program.getSourceFile(file);

    if (existing) {
      return existing;
    }

    const text = this.#host.readFile(file) ?? "";
    const impliedNodeFormat = ts.getImpliedNodeFormatForFile(
      file,
      undefined,
      this.#host,
      this.#options,
    );

    return ts.createSourceFile(
      file,
      text,
      { languageVersion: ts.ScriptTarget.Latest, impliedNodeFormat },
      true,
      scriptKind(file),
    );
  }

  /** The resolved file of a literal reference in `source`, or undefined. */
  resolve(source: ts.SourceFile, reference: ModuleReference): ts.ResolvedModuleFull | undefined {
    if (!reference.specifier) {
      return undefined;
    }

    let mode: ts.ResolutionMode;

    if (reference.form === "require" || reference.form === "import =") {
      mode = ts.ModuleKind.CommonJS;
    } else {
      mode = ts.getModeForUsageLocation(source, reference.specifier, this.#options);
    }

    return ts.resolveModuleName(
      reference.text,
      source.fileName,
      this.#options,
      this.#host,
      undefined,
      undefined,
      mode,
    ).resolvedModule;
  }

  edges(file: string): readonly Edge[] {
    const known = this.#edges.get(file);

    if (known) {
      return known;
    }

    const source = this.source(file);
    const edges: Edge[] = [];

    for (const reference of moduleReferences(source, this.#verbatim)) {
      if (!reference.edge) {
        continue;
      }

      const resolved = this.resolve(source, reference);
      let name: string | undefined;
      const targets: string[] = [];

      if (resolved && !resolved.isExternalLibraryImport) {
        name = resolve(resolved.resolvedFileName);
      }

      // `.d.<ext>.ts` describes a non-JavaScript asset: a leaf, like a package entry.
      if (name && !name.split(sep).includes("node_modules") && !/\.d\.[^.]+\.ts$/.test(name)) {
        const declaration = siblings.find(([extension]) => name.endsWith(extension));

        if (declaration) {
          const stem = name.slice(0, -declaration[0].length);

          for (const extension of declaration[1]) {
            if (this.#host.fileExists(stem + extension)) {
              targets.push(stem + extension);
            }
          }
        } else if (implementations.has(extname(name))) {
          targets.push(name);
        }
      }

      edges.push({ from: file, reference, kind: reference.edge, resolved: name, targets });
    }

    this.#edges.set(file, edges);

    return edges;
  }

  /**
   * The shortest chain of runtime edges from `start` to a file `forbidden` accepts, not
   * walking past files `stop` accepts; `start` is the chain's first edge.
   */
  path(
    start: Edge,
    forbidden: (file: string) => boolean,
    stop: (file: string) => boolean,
  ): { readonly chain: readonly Edge[]; readonly target: string } | undefined {
    const queue: { file: string; chain: Edge[] }[] = [];
    const seen = new Set<string>();

    for (const target of start.targets) {
      queue.push({ file: target, chain: [start] });
    }

    for (let index = 0; index < queue.length; index += 1) {
      const { file, chain } = queue[index];

      if (seen.has(file)) {
        continue;
      }

      seen.add(file);

      if (forbidden(file)) {
        return { chain, target: file };
      }

      if (stop(file)) {
        continue;
      }

      for (const edge of this.edges(file)) {
        for (const target of edge.targets) {
          if (!seen.has(target)) {
            queue.push({ file: target, chain: [...chain, edge] });
          }
        }
      }
    }

    return undefined;
  }
}
