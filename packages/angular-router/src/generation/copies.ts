import ts from "typescript";
import { markers, specifier } from "./files.js";
import { fail, properties, type Declaration } from "./sources.js";

/** A JSON value, as generation writes it into a route copy. */
export type Json = null | boolean | number | string | readonly Json[] | JsonRecord;
export interface JsonRecord {
  readonly [key: string]: Json;
}

/**
 * What a route extension's generation adds to its routes' copies, records and
 * `RouteTypes`. Launch supplies it; the router emits exactly what it says.
 */
export interface LaunchCopies {
  /** Each route's own generation data: its copy's runtime own contribution record. */
  readonly data: ReadonlyMap<Declaration, JsonRecord>;
  /** `export type <name> = <type><typeof route>` per copy, `type` imported from `from`. */
  readonly types: readonly {
    readonly name: string;
    readonly type: string;
    readonly from: string;
  }[];
  /** `readonly <member>: <type>` per handle, `type` naming one of `types`. */
  readonly members: readonly { readonly member: string; readonly type: string }[];
}

/**
 * Whether a declaration's route copy is typed from its authored declaration: an extension
 * route whose contributed steps are all server-only, at least one used. A kept contributed
 * step would add its record again on top of the authored one.
 */
export function seedsCopy(declaration: Declaration): boolean {
  if (!declaration.extension) {
    return false;
  }

  let stripped = false;

  for (const step of declaration.steps) {
    if (step.contributed && !step.serverOnly) {
      return false;
    }

    if (step.serverOnly) {
      stripped = true;
    }
  }

  return stripped;
}

/**
 * The type-only imports of a route extension's type descriptors, one per module in
 * descriptor order, and each descriptor's local name by its exported name.
 */
export function typeImports(types: LaunchCopies["types"]): {
  readonly lines: string[];
  readonly locals: Map<string, string>;
} {
  const byModule = new Map<string, string[]>();
  const locals = new Map<string, string>();

  for (const [index, descriptor] of types.entries()) {
    const local = `routegen$t${index}`;
    let names = byModule.get(descriptor.from);

    if (!names) {
      names = [];
      byModule.set(descriptor.from, names);
    }

    names.push(`${descriptor.type} as ${local}`);
    locals.set(descriptor.name, local);
  }

  const lines: string[] = [];

  for (const [from, names] of byModule) {
    lines.push(`import type { ${names.join(", ")} } from ${JSON.stringify(from)};`);
  }

  return { lines, locals };
}

/** How a declaration's copies reach the files around them; every specifier is `.js`-suffixed. */
export interface CopyWiring {
  // The parent's destination file and route copy, from this declaration's directory.
  readonly parent?: { readonly destination: string; readonly route: string };
  // The `..` winner's destination file; absent when the route has no winner.
  readonly up?: string;
  // Whether the route copy exports injectRoute: a redirect record never activates.
  readonly activates: boolean;
  // An extension route's copy data, type exports and handle members.
  readonly launch?: {
    readonly data?: JsonRecord;
    readonly types: LaunchCopies["types"];
    readonly members: LaunchCopies["members"];
  };
}

export interface Copies {
  readonly destination: string;
  readonly route: string;
}

// One liveness unit: an import binding, a side-effect import or another top-level statement.
interface Unit {
  // The node whose identifiers the unit references.
  readonly node: ts.Node;
  refs: Set<Unit>;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const prefix = "routegen$";
const destinationDoc =
  "/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */";
const routeDoc =
  "/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */";
const injectDoc = `/**
 * Injects a typed handle bound to this exact generated activated route record.
 *
 * @remarks
 * Call in an Angular injection context. The handle exposes readonly native
 * params/search/data/title Signals and destination-typed link/navigate methods.
 * Data holds the resolver results of this route and its ancestors, a nearer
 * key hiding an ancestor's; native static data and the title stay out. Title
 * is the nearest declared title in the chain, or undefined when none declares one.
 * All navigation values are explicit; current inputs are never reused implicitly.
 *
 * @returns A noncallable handle for this declaration.
 * @throws A synchronous wiring error outside an injection context or when the
 * activated record does not carry this declaration's own generated identity.
 */`;

// Every name a top-level statement binds, with the node to report it at.
function bindings(statement: ts.Statement): ts.Identifier[] {
  const names: ts.Identifier[] = [];

  function bindingName(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) {
      names.push(name);

      return;
    }

    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) {
        bindingName(element.name);
      }
    }
  }

  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;

    if (clause?.name) {
      names.push(clause.name);
    }

    const named = clause?.namedBindings;

    if (named && ts.isNamespaceImport(named)) {
      names.push(named.name);
    } else if (named) {
      for (const element of named.elements) {
        names.push(element.name);
      }
    }
  } else if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      bindingName(declaration.name);
    }
  } else if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement)) &&
    statement.name &&
    ts.isIdentifier(statement.name)
  ) {
    names.push(statement.name);
  }

  return names;
}

// The text of a call's own regions: its type arguments and its arguments (A1).
function regions(call: ts.CallExpression): ts.Node[] {
  return [...(call.typeArguments ?? []), ...call.arguments];
}

/**
 * Builds the destination copy and the route copy of one declaration from its final
 * SourceFile, line-aligned with it: line k of each copy is the declaration's line k with
 * the copy's edits applied, generated lines follow, and the marker is the last line.
 */
export function copies(
  declaration: Declaration,
  checker: ts.TypeChecker,
  wiring: CopyWiring,
): Copies {
  const source = declaration.source;
  const root = declaration.root;
  const exported = source.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals,
  )!;

  for (const statement of source.statements) {
    for (const name of bindings(statement)) {
      if (name.text.startsWith(prefix)) {
        fail(name, `Reserved generated binding prefix: ${name.text}`);
      }
    }
  }

  // Units, keyed by the node a symbol's declaration lies in. The default export holds the
  // chain the copies transform, so it is no unit: its parts are regions.
  const units: Unit[] = [];
  const byNode = new Map<ts.Node, Unit>();

  function add(declared: ts.Node, node: ts.Node = declared): void {
    const unit: Unit = { node, refs: new Set() };

    units.push(unit);
    byNode.set(declared, unit);
  }

  for (const statement of source.statements) {
    if (statement === exported) {
      continue;
    }

    const clause = ts.isImportDeclaration(statement) && statement.importClause;

    if (!clause) {
      add(statement);

      continue;
    }

    // A default import's symbol is declared by the whole clause, which also holds its sibling
    // bindings; the unit references only its own name.
    if (clause.name) {
      add(clause, clause.name);
    }

    const named = clause.namedBindings;

    if (named && ts.isNamespaceImport(named)) {
      add(named);
    } else if (named) {
      for (const element of named.elements) {
        add(element);
      }
    }
  }

  function unitOf(node: ts.Node): Unit | undefined {
    if (node.getSourceFile() !== source) {
      return undefined;
    }

    for (let current: ts.Node | undefined = node; current; current = current.parent) {
      const unit = byNode.get(current);

      if (unit) {
        return unit;
      }
    }

    return undefined;
  }

  // The symbol an identifier references; a shorthand property's is its value's.
  function symbolOf(identifier: ts.Identifier): ts.Symbol | undefined {
    if (
      ts.isShorthandPropertyAssignment(identifier.parent) &&
      identifier.parent.name === identifier
    ) {
      return checker.getShorthandAssignmentValueSymbol(identifier.parent);
    }

    return checker.getSymbolAtLocation(identifier);
  }

  // The units the identifiers in `nodes` reference, by the discovery checker's symbols.
  function references(nodes: readonly ts.Node[]): Set<Unit> {
    const found = new Set<Unit>();

    function visit(node: ts.Node): void {
      if (ts.isIdentifier(node)) {
        const symbol = symbolOf(node);

        for (const declared of symbol?.declarations ?? []) {
          const unit = unitOf(declared);

          if (unit) {
            found.add(unit);
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    for (const node of nodes) {
      visit(node);
    }

    return found;
  }

  function reach(roots: Iterable<Unit>): Set<Unit> {
    const live = new Set<Unit>();
    const pending = [...roots];

    while (pending.length > 0) {
      const unit = pending.pop()!;

      if (live.has(unit)) {
        continue;
      }

      live.add(unit);
      pending.push(...unit.refs);
    }

    return live;
  }

  for (const unit of units) {
    unit.refs = references([unit.node]);
    unit.refs.delete(unit);
  }

  const facts = properties(root.arguments[1], "URL facts");
  const parentValue = facts.get("parent");
  const stripped = declaration.steps.filter((step) => step.serverOnly);
  const kept = declaration.steps.filter((step) => !step.serverOnly);

  // Route copy: the stripped steps' regions and the root call's arguments go;
  // whatever they reach goes unless a kept step, an inserted binding or an untouched
  // statement still reaches it.
  const removedRegions: ts.Node[] = [...root.arguments];
  const keptRegions: ts.Node[] = [];

  for (const step of stripped) {
    removedRegions.push(...regions(step.call));
  }

  for (const step of kept) {
    keptRegions.push(...regions(step.call));
  }

  const inserted: ts.Node[] = [root.expression];

  if (parentValue) {
    inserted.push(parentValue);
  }

  const detached = reach(references(removedRegions));
  const roots = new Set([...references(keptRegions), ...references(inserted)]);

  for (const unit of units) {
    if (!detached.has(unit)) {
      roots.add(unit);
    }
  }

  const routeLive = reach(roots);
  // Destination copy: only what the path and facts reach.
  const destinationLive = reach(references(root.arguments));

  const parentImport = declaration.parentImport;
  let parentBinding: string | undefined;

  // The destination copy rebinds the parent import to the parent's destination, so the path,
  // the facts and what they reach may use it only as the facts' `parent` value. Steps and
  // what only they reach keep it: the route copy rebinds it to the parent's route copy.
  if (parentImport) {
    const clause = parentImport.importClause!;
    const parentUnit = byNode.get(clause)!;
    const parentSymbol = checker.getSymbolAtLocation(clause.name!);
    const scanned: ts.Node[] = [...root.arguments];
    let first: ts.Identifier | undefined;

    parentBinding = clause.name!.text;

    for (const unit of destinationLive) {
      if (unit !== parentUnit) {
        scanned.push(unit.node);
      }
    }

    function visit(node: ts.Node): void {
      if (
        ts.isIdentifier(node) &&
        node !== parentValue &&
        symbolOf(node) === parentSymbol &&
        (!first || node.getStart(source) < first.getStart(source))
      ) {
        first = node;
      }

      ts.forEachChild(node, visit);
    }

    for (const node of scanned) {
      visit(node);
    }

    if (first) {
      fail(
        first,
        "URL facts may use the parent import only as `parent:`; for its URL types use ParamsOf<TargetOf<typeof d>> with d imported from the parent's destination.generated.js",
      );
    }
  }

  // The destination copy keeps the declarations of the bindings its facts reach but drops
  // every other statement, so a later write to one of them would give the copy different URL
  // facts from the declaration's. Any write to one, anywhere in the file, fails.
  const factBindings = new Set<ts.Symbol>();

  for (const statement of source.statements) {
    for (const name of bindings(statement)) {
      const unit = unitOf(name);
      const symbol = checker.getSymbolAtLocation(name);

      if (unit && destinationLive.has(unit) && symbol) {
        factBindings.add(symbol);
      }
    }
  }

  let write: ts.Identifier | undefined;

  function written(identifier: ts.Identifier): void {
    const symbol = symbolOf(identifier);

    if (
      symbol &&
      factBindings.has(symbol) &&
      (!write || identifier.getStart(source) < write.getStart(source))
    ) {
      write = identifier;
    }
  }

  // The bindings an assignment target writes, through destructuring patterns.
  function target(node: ts.Expression): void {
    if (ts.isIdentifier(node)) {
      written(node);
    } else if (
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isSpreadElement(node)
    ) {
      target(node.expression);
    } else if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        target(element);
      }
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          target(property.initializer);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          written(property.name);
        } else if (ts.isSpreadAssignment(property)) {
          target(property.expression);
        }
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      // A pattern element's default value.
      target(node.left);
    }
  }

  function writes(node: ts.Node): void {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      target(node.left);
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      target(node.operand);
    } else if (
      (ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer)
    ) {
      target(node.initializer);
    }

    ts.forEachChild(node, writes);
  }

  if (factBindings.size > 0) {
    writes(source);
  }

  if (write) {
    fail(write, "a binding the URL facts read is reassigned; declare it const");
  }

  // Removals of dead units, leaving the parent import to its rewrite.
  function removals(live: ReadonlySet<Unit>): Edit[] {
    const edits: Edit[] = [];

    for (const statement of source.statements) {
      if (statement === exported || statement === parentImport) {
        continue;
      }

      const clause = ts.isImportDeclaration(statement) && statement.importClause;

      if (!clause) {
        if (!live.has(byNode.get(statement)!)) {
          edits.push({ start: statement.getStart(source), end: statement.end, text: "" });
        }

        continue;
      }

      const named = clause.namedBindings;
      const name = clause.name && byNode.get(clause)!;
      let elements: Unit[] = [];
      let namespace: Unit | undefined;

      if (named && ts.isNamespaceImport(named)) {
        namespace = byNode.get(named)!;
      } else if (named) {
        elements = named.elements.map((element) => byNode.get(element)!);
      }

      const all = [name, namespace, ...elements].filter((unit) => unit !== undefined);
      const surviving = all.filter((unit) => live.has(unit));

      if (surviving.length === 0) {
        edits.push({ start: statement.getStart(source), end: statement.end, text: "" });

        continue;
      }

      if (surviving.length === all.length) {
        continue;
      }

      if (name && !live.has(name)) {
        // `name, ` goes; the bindings that follow it stay.
        edits.push({
          start: clause.name!.getStart(source),
          end: named!.getStart(source),
          text: "",
        });
      }

      if (namespace && !live.has(namespace)) {
        edits.push({ start: clause.name!.end, end: named!.end, text: "" });
      }

      if (named && ts.isNamedImports(named)) {
        if (!elements.some((unit) => live.has(unit))) {
          // Only the default binding survives: `, { … }` goes.
          edits.push({ start: clause.name!.end, end: named.end, text: "" });

          continue;
        }

        // Each removed specifier takes the comma after it; the last one, without a trailing
        // comma, takes the comma before it unless that comma went with a removed neighbor.
        for (let index = 0; index < elements.length; index += 1) {
          if (live.has(elements[index])) {
            continue;
          }

          const element = named.elements[index];
          const last = index === elements.length - 1;

          if (!last || named.elements.hasTrailingComma) {
            // The next token after the specifier is its comma; comments between them are trivia.
            const scanner = ts.createScanner(
              source.languageVersion,
              true,
              source.languageVariant,
              source.text,
              undefined,
              element.end,
            );

            scanner.scan();

            let end = scanner.getTokenEnd();

            // The spaces after the comma go too, never its line break.
            while (source.text[end] === " " || source.text[end] === "\t") {
              end += 1;
            }

            edits.push({ start: element.getStart(source), end, text: "" });
          } else if (live.has(elements[index - 1])) {
            edits.push({ start: named.elements[index - 1].end, end: element.end, text: "" });
          } else {
            edits.push({ start: element.getStart(source), end: element.end, text: "" });
          }
        }
      }
    }

    return edits;
  }

  function steps(remove: (step: Declaration["steps"][number]) => boolean): Edit[] {
    const edits: Edit[] = [];

    for (const step of declaration.steps) {
      if (remove(step)) {
        const link = step.call.expression as ts.PropertyAccessExpression;

        edits.push({ start: link.expression.end, end: step.call.end, text: "" });
      }
    }

    return edits;
  }

  const exportPrefix = {
    start: exported.getStart(source),
    end: exported.expression.getStart(source),
  };
  const id = JSON.stringify(declaration.id);
  const lastArgument = root.arguments[root.arguments.length - 1];

  const destinationEdits: Edit[] = [
    { ...exportPrefix, text: `${destinationDoc} const routegen$destination = ` },
    {
      start: root.expression.getStart(source),
      end: root.expression.end,
      text: "routegen$defineDestination",
    },
    { start: lastArgument.end, end: lastArgument.end, text: `, ${id}` },
    ...steps(() => true),
    ...removals(destinationLive),
  ];
  const routeArguments = [root.expression.getText(source), "routegen$destination"];
  // Typed from its authored declaration, so its kept callbacks see what the stripped steps
  // added.
  const seeded = seedsCopy(declaration);
  const data = wiring.launch?.data;

  if (data && !seeded) {
    throw new Error(
      `Route copy data needs a route whose contributed steps are server-only: ${declaration.file}`,
    );
  }

  if (parentValue) {
    routeArguments.push(parentValue.getText(source));
  } else if (data) {
    routeArguments.push("undefined");
  }

  if (data) {
    routeArguments.push("routegen$own()");
  }

  let routeStart = `routegen$routeOf(${routeArguments.join(", ")})`;

  if (seeded) {
    routeStart = `routegen$authoredRouteOf<typeof routegen$Authored>()(${routeArguments.join(", ")})`;
  }

  const routeEdits: Edit[] = [
    { ...exportPrefix, text: `${routeDoc} const routegen$route = ` },
    {
      start: root.getStart(source),
      end: root.end,
      text: routeStart,
    },
    ...steps((step) => step.serverOnly),
    ...removals(routeLive),
  ];

  if (parentImport && wiring.parent) {
    const span = { start: parentImport.getStart(source), end: parentImport.end };

    destinationEdits.push({
      ...span,
      text: `import { destination as ${parentBinding} } from ${JSON.stringify(wiring.parent.destination)};`,
    });
    routeEdits.push({
      ...span,
      text: `import { route as ${parentBinding} } from ${JSON.stringify(wiring.parent.route)};`,
    });
  }

  const destinationTail = [
    'import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";',
    "export { routegen$destination as destination };",
  ];
  const routeTail: string[] = [];
  let parentType = "";
  let parentArgument = "";
  let upType = "never";
  let start = "routeOf as routegen$routeOf";

  if (seeded) {
    // Erased: the import rule admits exactly this form, from this copy to its own declaration.
    routeTail.push(
      `import type routegen$Authored from ${JSON.stringify(specifier(declaration.file, declaration.file))};`,
    );
    start = "authoredRouteOf as routegen$authoredRouteOf";
  }

  if (wiring.activates) {
    routeTail.push(
      `import { ${start}, injectGeneratedRoute as routegen$injectGeneratedRoute, type Handle as routegen$Handle } from "@loozo/angular-router/_generated";`,
    );
  } else {
    routeTail.push(`import { ${start} } from "@loozo/angular-router/_generated";`);
  }

  const launch = wiring.launch;
  let typeNames = new Map<string, string>();

  if (launch) {
    const imports = typeImports(launch.types);

    routeTail.push(...imports.lines);
    typeNames = imports.locals;
  }

  routeTail.push(
    'import { destination as routegen$destination } from "./destination.generated.js";',
  );

  if (wiring.up && wiring.activates) {
    routeTail.push(`import { destination as routegen$up } from ${JSON.stringify(wiring.up)};`);
    parentType = ", typeof routegen$up";
    parentArgument = ", routegen$up";
    upType = "typeof routegen$up";
  }

  if (data) {
    // A declaration, so the root line above can call it.
    routeTail.push(`function routegen$own() { return ${JSON.stringify(data)}; }`);
  }

  routeTail.push("export { routegen$route as route };");

  let members = "";
  let membersArgument = "";

  if (launch) {
    // Local names stay in the `routegen$` space, so an exported name such as `Context` can
    // match a binding the declaration keeps.
    for (const descriptor of launch.types) {
      const local = `routegen$type_${descriptor.name}`;

      routeTail.push(
        `type ${local} = ${typeNames.get(descriptor.name)}<typeof routegen$route>;`,
        `export type { ${local} as ${descriptor.name} };`,
      );
    }

    if (wiring.activates && launch.members.length > 0) {
      const entries = launch.members.map((member) => {
        if (!typeNames.has(member.type)) {
          throw new Error(`Route copy member type is not a type export: ${member.type}`);
        }

        return `readonly ${member.member}: routegen$type_${member.type}`;
      });

      routeTail.push(`type routegen$Members = { ${entries.join("; ")} };`);
      members = " & routegen$Members";
      membersArgument = `<typeof routegen$route, ${upType}, routegen$Members>`;
    }
  }

  if (wiring.activates) {
    routeTail.push(
      injectDoc,
      `function routegen$injectRoute(): routegen$Handle<typeof routegen$route${parentType}>${members} { return routegen$injectGeneratedRoute${membersArgument}(routegen$route${parentArgument}); }`,
      "export { routegen$injectRoute as injectRoute };",
    );
  }

  let comments: ts.CommentRange[] = [];

  // Only a declaration whose text names a directive can hold one.
  if (directiveName.test(source.text)) {
    comments = commentRanges(source);
  }

  destinationEdits.push(...unboundDirectives(source, comments, destinationEdits));
  routeEdits.push(...unboundDirectives(source, comments, routeEdits));

  return {
    destination: render(source, destinationEdits, [
      ...destinationTail,
      markers["destination.generated.ts"],
    ]),
    route: render(source, routeEdits, [...routeTail, markers["route.generated.ts"]]),
  };
}

// TypeScript's comment-directive tests (its scanner): a line comment that starts with the
// directive, or a block comment whose last line does. A directive binds to the line its comment
// ends on and applies to the next line holding more than whitespace or a line comment.
const directiveName = /@(?:ts-expect-error|ts-ignore)/;
const lineDirective = /^\/\/\/?\s*@(?:ts-expect-error|ts-ignore)/;
const blockDirective = /^(?:\/|\*)*\s*@(?:ts-expect-error|ts-ignore)/;
const skippedLine = /^(?:\/\/.*)?$/;

// Every comment in the declaration: the trivia before each token holds the comments on the
// previous token's line (trailing) and those after its line break (leading). A JSDoc node lies
// inside its comment, so the walk doesn't enter it.
function commentRanges(source: ts.SourceFile): ts.CommentRange[] {
  const text = source.text;
  const found = new Map<number, ts.CommentRange>();

  function visit(node: ts.Node): void {
    const children = node.getChildren(source);

    if (children.length === 0) {
      const trailing = ts.getTrailingCommentRanges(text, node.pos) ?? [];
      const leading = ts.getLeadingCommentRanges(text, node.pos) ?? [];

      for (const range of [...trailing, ...leading]) {
        found.set(range.pos, range);
      }

      return;
    }

    for (const child of children) {
      if (!ts.isJSDoc(child)) {
        visit(child);
      }
    }
  }

  visit(source);

  return [...found.values()];
}

/**
 * The removals of the `@ts-expect-error` and `@ts-ignore` comments whose target line a copy's
 * edits leave without code. TypeScript would apply such a directive to a later line instead,
 * and an expect-error with nothing to suppress fails the copy (TS2578). A directive whose target
 * line keeps any code, or that has no target line, stays and applies to the same line as in the
 * declaration. A block comment goes whole, with any other text it holds.
 */
function unboundDirectives(
  source: ts.SourceFile,
  comments: readonly ts.CommentRange[],
  edits: readonly Edit[],
): Edit[] {
  const text = source.text;
  const starts = source.getLineStarts();
  const removals: Edit[] = [];

  function lineText(line: number): string {
    return text.slice(starts[line], starts[line + 1] ?? text.length);
  }

  // Whether the copy's line still holds a token: replacement text placed on it, or an authored
  // character outside every edited span and every comment.
  function keepsCode(line: number): boolean {
    for (const edit of edits) {
      if (edit.text !== "" && source.getLineAndCharacterOfPosition(edit.start).line === line) {
        return true;
      }
    }

    const end = starts[line + 1] ?? text.length;

    for (let position = starts[line]; position < end; position += 1) {
      if (/\s/.test(text[position])) {
        continue;
      }

      const edited = edits.some((edit) => position >= edit.start && position < edit.end);
      const commented = comments.some((range) => position >= range.pos && position < range.end);

      if (!edited && !commented) {
        return true;
      }
    }

    return false;
  }

  for (const comment of comments) {
    // A comment an edit touches is already gone.
    if (edits.some((edit) => comment.pos < edit.end && edit.start < comment.end)) {
      continue;
    }

    const body = text.slice(comment.pos, comment.end);
    let directive: boolean;

    if (comment.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      directive = lineDirective.test(body);
    } else {
      const lastLine = body.slice(Math.max(body.lastIndexOf("\n"), body.lastIndexOf("\r")) + 1);

      directive = blockDirective.test(lastLine.trimStart());
    }

    if (!directive) {
      continue;
    }

    let target = source.getLineAndCharacterOfPosition(comment.end).line + 1;

    while (target < starts.length && skippedLine.test(lineText(target).trim())) {
      target += 1;
    }

    if (target < starts.length && !keepsCode(target)) {
      removals.push({ start: comment.pos, end: comment.end, text: "" });
    }
  }

  return removals;
}

// Applies span edits to the declaration's text, keeping every line break, so line k stays
// line k; a touched line left with only whitespace becomes empty. Lines are written with LF.
function render(source: ts.SourceFile, edits: Edit[], tail: readonly string[]): string {
  const text = source.text;
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const touched = new Set<number>();
  let output = "";
  let at = 0;

  for (const edit of ordered) {
    if (edit.start < at) {
      throw new Error(`Overlapping generated copy edits in ${source.fileName}`);
    }

    output += text.slice(at, edit.start) + edit.text;

    for (const character of text.slice(edit.start, edit.end)) {
      if (character === "\n") {
        output += "\n";
      }
    }

    const first = source.getLineAndCharacterOfPosition(edit.start).line;
    const last = source.getLineAndCharacterOfPosition(edit.end).line;

    for (let line = first; line <= last; line += 1) {
      touched.add(line);
    }

    at = edit.end;
  }

  output += text.slice(at);

  const lines = output.split(/\r?\n/);

  // The tail starts after the last authored line; a final line break ends a line, it doesn't
  // start one.
  if (/\r?\n$/.test(text)) {
    lines.pop();
  }

  for (const line of touched) {
    if (line < lines.length && lines[line].trim() === "") {
      lines[line] = "";
    }
  }

  return `${[...lines, ...tail].join("\n")}\n`;
}
