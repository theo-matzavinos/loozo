import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const dist = new URL("../dist/", import.meta.url).pathname;

// "_" entries couple generated code to this package; they're not public API.
const entries = [];

for (const [entry, target] of Object.entries(manifest.exports)) {
  if (entry === "./package.json" || entry.startsWith("./_")) {
    continue;
  }

  entries.push(new URL(`../${target.types}`, import.meta.url).pathname);
}

const namedTypes =
  ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Class | ts.SymbolFlags.Enum;

function referencedName(node) {
  if (ts.isTypeReferenceNode(node)) {
    return node.typeName;
  }

  if (ts.isExpressionWithTypeArguments(node)) {
    return node.expression;
  }

  if (ts.isTypeQueryNode(node)) {
    return node.exprName;
  }

  if (ts.isImportTypeNode(node)) {
    return node.qualifier;
  }

  return undefined;
}

function location(root, node) {
  const source = node.getSourceFile();
  const { line } = ts.getLineAndCharacterOfPosition(source, node.getStart());
  let statement = node;

  while (!ts.isSourceFile(statement.parent)) {
    statement = statement.parent;
  }

  const owner = statement.name?.getText() ?? ts.SyntaxKind[statement.kind];

  return `${owner} at ${relative(root, source.fileName)}:${line + 1}`;
}

// An application's exported value whose inferred type mentions one of this package's types
// emits a reference to it. A type its module exports is then named by a deep path the exports
// map blocks (TS2883, or a non-portable import), so a public entry must export it. A module's
// unexported interface, class or enum can't be named at all (TS4058); only an unexported type
// alias is safe, because TypeScript writes out its definition instead. "Exports" means the
// module's export table, so `type X = …; export { X };` counts as exported.
//
// `problems` lists anything that would make that check pass without looking: compiler errors
// (such as a missing module), a public entry with no exports, and exports or references that
// don't resolve to a declaration.
function checkDeclarations(root, files) {
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const problems = [];

  for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(root)) {
      continue;
    }

    const diagnostics = [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ];

    for (const diagnostic of diagnostics) {
      const { line } = ts.getLineAndCharacterOfPosition(source, diagnostic.start);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");

      problems.push(
        `TS${diagnostic.code} at ${relative(root, source.fileName)}:${line + 1}: ${message}`,
      );
    }
  }

  function resolved(symbol) {
    if (symbol.flags & ts.SymbolFlags.Alias) {
      return checker.getAliasedSymbol(symbol);
    }

    return symbol;
  }

  const moduleExports = new Map();

  function exportsOf(source) {
    let symbols = moduleExports.get(source);

    if (symbols) {
      return symbols;
    }

    symbols = new Set();

    const module = checker.getSymbolAtLocation(source);

    if (module) {
      for (const symbol of checker.getExportsOfModule(module)) {
        symbols.add(resolved(symbol));
      }
    }

    moduleExports.set(source, symbols);

    return symbols;
  }

  const exported = new Set();
  const pending = [];

  for (const file of files) {
    const source = program.getSourceFile(file);

    assert.ok(source, `Published declarations must exist: ${file}`);

    const module = checker.getSymbolAtLocation(source);

    assert.ok(module, `Published declarations must be a module: ${file}`);

    const symbols = checker.getExportsOfModule(module);

    if (symbols.length === 0) {
      problems.push(`${relative(root, file)} exports nothing`);
    }

    for (const symbol of symbols) {
      const target = resolved(symbol);

      if (!target.declarations?.length) {
        problems.push(`${symbol.name} exported by ${relative(root, file)} doesn't resolve`);
      }

      for (const declaration of target.declarations ?? []) {
        exported.add(declaration);
        pending.push(declaration);
      }
    }
  }

  const visited = new Set();
  const unexported = new Map();

  function visit(node) {
    const name = referencedName(node);

    if (name) {
      let identifier = name;

      if (ts.isQualifiedName(name)) {
        identifier = name.right;
      }

      let symbol = checker.getSymbolAtLocation(identifier);

      if (symbol) {
        symbol = resolved(symbol);
      }

      if (!symbol?.declarations?.length) {
        problems.push(`${name.getText()} referenced by ${location(root, node)} doesn't resolve`);
      }

      const declarations = [];

      for (const declaration of symbol?.declarations ?? []) {
        if (declaration.getSourceFile().fileName.startsWith(root)) {
          declarations.push(declaration);
        }
      }

      if (declarations.length > 0 && symbol.flags & namedTypes) {
        let isPublic = false;
        let isInlined = (symbol.flags & ts.SymbolFlags.TypeAlias) !== 0;

        for (const declaration of declarations) {
          if (exported.has(declaration)) {
            isPublic = true;
          }

          if (exportsOf(declaration.getSourceFile()).has(symbol)) {
            isInlined = false;
          }
        }

        if (!isInlined && !isPublic) {
          const key = `${symbol.name} (${relative(root, declarations[0].getSourceFile().fileName)})`;
          const sites = unexported.get(key) ?? new Set();

          sites.add(location(root, node));
          unexported.set(key, sites);
        }
      }

      for (const declaration of declarations) {
        pending.push(declaration);
      }
    }

    ts.forEachChild(node, visit);
  }

  while (pending.length > 0) {
    const declaration = pending.pop();

    if (visited.has(declaration)) {
      continue;
    }

    visited.add(declaration);
    visit(declaration);
  }

  const offenders = [];

  for (const [type, sites] of unexported) {
    offenders.push(`${type} referenced by ${[...sites].join(", ")}`);
  }

  offenders.sort();

  return { problems, offenders };
}

await test("published declarations only reference types exported from public entries", () => {
  const { problems, offenders } = checkDeclarations(dist, entries);

  assert.deepEqual(problems, [], "Published declarations must resolve completely");
  assert.deepEqual(offenders, [], "Referenced types must be exported from a public entry");
});

await test("a type alias exported through an export list counts as exported", () => {
  const fixture = new URL("fixtures/export-list/", import.meta.url).pathname;
  const { problems, offenders } = checkDeclarations(fixture, [`${fixture}index.d.ts`]);

  assert.deepEqual(problems, []);
  assert.deepEqual(offenders, [
    "Status (definitions.d.ts) referenced by Definition at definitions.d.ts:4",
  ]);
});

// A consumer module type-checked against the built package and the real router, as an app's
// route.ts files are: the package resolves itself by name through its exports map.
const consumerDirectory = new URL("./.types/", import.meta.url).pathname;

function program(files, options = {}) {
  const compilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2024.d.ts", "lib.dom.d.ts"],
    types: [],
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    ...options,
  };
  const host = ts.createCompilerHost(compilerOptions);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const paths = new Map();

  for (const [name, text] of Object.entries(files)) {
    paths.set(`${consumerDirectory}${name}`, text);
  }

  host.readFile = (name) => paths.get(name) ?? readFile(name);
  host.fileExists = (name) => paths.has(name) || fileExists(name);
  // The consumer's files exist only in memory, so their directory does too.
  host.directoryExists = (name) =>
    `${name.replace(/\/$/, "")}/` === consumerDirectory || ts.sys.directoryExists(name);

  const emitted = {};

  host.writeFile = (name, text) => {
    emitted[relative(consumerDirectory, name)] = text;
  };

  const built = ts.createProgram([...paths.keys()], compilerOptions, host);
  const messages = [];
  const diagnostics = [...ts.getPreEmitDiagnostics(built)];

  // Declaration emit reports a type it can't name (TS4082 and the like) only while emitting.
  if (!compilerOptions.noEmit) {
    diagnostics.push(...built.emit().diagnostics);
  }

  for (const diagnostic of diagnostics) {
    const where = diagnostic.file
      ? `${relative(consumerDirectory, diagnostic.file.fileName)}:${
          ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start).line + 1
        } `
      : "";

    messages.push(
      `${where}TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
    );
  }

  return { built, messages, emitted };
}

const routeProof = `
import { defineRoute, type ContextOf, type RemoteOf } from "@loozo/angular-launch";
import {
  middleware,
  readCookies,
  redirect,
  type MiddlewareArgs,
  type Schema,
  type StageArgs,
} from "@loozo/angular-launch/server";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expect<T extends true>(): T | void {}

export interface User { id: string }

export const root = defineRoute("", {}).context(({ request }) => ({ request, user: null as User | null, depth: 0 }));

// A standalone stage takes and returns the whole context, and middleware declares what it
// needs.
export function signedIn({ context }: StageArgs<ContextOf<typeof root>>) {
  if (context.user === null) {
    throw redirect("/sign-in");
  }

  return { ...context, user: context.user };
}
export const audit = middleware<{ user: User }>(async ({ context, next }) => {
  void context.user.id;

  return next();
});
export const needsTeam = middleware<{ team: string }>(async ({ next }) => next());
export const needsInput = middleware(async ({ next }: MiddlewareArgs<{}, { id: string }>) => next());
export declare const titleSchema: Schema<string, { title: string }>;

export const auth = defineRoute("", { parent: root })
  .context(signedIn)
  // .use() is checked against the context including the route's own stage. A bare arrow
  // receives that context; middleware() names the keys it reads, or needs nothing and sees {}.
  .use(
    async ({ context, input, next }) => {
      expect<Equal<typeof context, Readonly<{ request: Request; depth: number; user: User }>>>();
      expect<Equal<typeof input, unknown>>();

      return next();
    },
    middleware<{ user: User }>(async ({ context, next }) => {
      const user: User = context.user;

      void user;

      return next();
    }),
    middleware(async ({ context, next }) => {
      expect<Equal<typeof context, Readonly<{}>>>();

      return next();
    }),
    audit,
  )
  .remote(({ query }) => ({
    session: { current: query({ handler: ({ context }) => ({ user: context.user.id }) }) },
  }));

expect<Equal<ContextOf<typeof auth>, { request: Request; depth: number; user: User }>>();

// @ts-expect-error audit needs a non-null user, which the root's context doesn't have
defineRoute("x", { parent: root }).use(audit);
// @ts-expect-error no stage adds a team
defineRoute("y", { parent: auth }).use(needsTeam);
// @ts-expect-error a route's middleware runs before validation and gets no input
defineRoute("z", { parent: auth }).use(needsInput);
// @ts-expect-error a bare arrow's context is the route's, which has no team
defineRoute("w", { parent: auth }).use(async ({ next }: MiddlewareArgs<{ team: string }>) => next());

// A procedure's bare arrow receives the route's context and the validated input.
export const titled = defineRoute("titled", { parent: auth }).remote(({ query, mutation }) => ({
  titled: {
    add: mutation({
      input: titleSchema,
      use: [
        async ({ context, input, next }) => {
          expect<Equal<typeof context, Readonly<{ request: Request; depth: number; user: User }>>>();
          expect<Equal<typeof input, { title: string }>>();

          return next();
        },
        audit,
      ],
      handler: ({ input }) => input.title,
    }),
    // @ts-expect-error the validated input has no id
    get: query({ input: titleSchema, use: [async ({ next }: MiddlewareArgs<{}, { id: string }>) => next()], handler: () => 1 }),
  },
}));

export const todos = defineRoute("todos", { parent: auth })
  .remote(({ query, mutation }) => ({
    todos: {
      list: query({ handler: ({ context }): { owner: string }[] => [{ owner: context.user.id }] }),
      add: mutation({
        input: undefined,
        handler: () => null,
      }),
    },
  }))
  .resolve({
    // Own and inherited namespaces, exactly typed, in a kept router callback.
    list: ({ remote }) => remote.todos.list(),
    session: ({ remote }) => {
      const current: Promise<{ user: string }> = remote.session.current();

      // @ts-expect-error no such namespace
      remote.missing;
      // @ts-expect-error a query without input takes options only
      remote.todos.list("input");

      return current;
    },
  });

expect<Equal<Awaited<ReturnType<RemoteOf<typeof todos>["todos"]["list"]>>, { owner: string }[]>>();
expect<Equal<Awaited<ReturnType<RemoteOf<typeof todos>["session"]["current"]>>, { user: string }>>();
expect<Equal<keyof RemoteOf<typeof auth>, "session">>();

// Seven stages deep, each spreading the context it receives, replacing depth and adding a key.
export const d1 = defineRoute("d1", { parent: auth }).context(({ context }) => ({ ...context, depth: 1 as const, l1: true as const }));
export const d2 = defineRoute("d2", { parent: d1 }).context(({ context }) => ({ ...context, depth: 2 as const, l2: context.l1 }));
export const d3 = defineRoute("d3", { parent: d2 }).context(({ context }) => ({ ...context, depth: 3 as const, l3: context.l2 }));
export const d4 = defineRoute("d4", { parent: d3 }).context(({ context }) => ({ ...context, depth: 4 as const, l4: context.l3 }));
export const d5 = defineRoute("d5", { parent: d4 }).context(({ context }) => ({ ...context, depth: 5 as const, l5: context.l4 }));
export const d6 = defineRoute("d6", { parent: d5 }).context(({ context }) => ({ ...context, depth: 6 as const, l6: context.l5 }));
export const d7 = defineRoute("d7", { parent: d6 })
  .context(async ({ context }) => ({ ...context, depth: 7 as const, l7: context.l6, user: { id: context.user.id, admin: true } }))
  .remote(({ query }) => ({ deep: { depth: query({ handler: ({ context }) => context.depth }) } }));

expect<
  Equal<
    ContextOf<typeof d7>,
    {
      request: Request;
      depth: 7;
      user: { id: string; admin: boolean };
      l1: true;
      l2: true;
      l3: true;
      l4: true;
      l5: true;
      l6: true;
      l7: true;
    }
  >
>();
expect<Equal<Awaited<ReturnType<RemoteOf<typeof d7>["deep"]["depth"]>>, 7>>();

// A stage's value is the context as it is: a class instance keeps its methods.
export class Session {
  user = "alice";

  signedIn(): boolean {
    return true;
  }
}
export const sessioned = defineRoute("sessioned", {})
  .context(() => new Session())
  .remote(({ query }) => ({ sessioned: { current: query({ handler: ({ context }) => context.signedIn() }) } }));

expect<Equal<ContextOf<typeof sessioned>, Session>>();
expect<Equal<Awaited<ReturnType<RemoteOf<typeof sessioned>["sessioned"]["current"]>>, boolean>>();

// A key the stage doesn't return is gone below it.
export const dropped = defineRoute("dropped", { parent: root })
  .context(({ context }) => ({ user: context.user }))
  .remote(({ query }) => ({
    dropped: {
      // @ts-expect-error the stage returned no depth
      depth: query({ handler: ({ context }) => context.depth }),
    },
  }));

expect<Equal<ContextOf<typeof dropped>, { user: User | null }>>();

// An index signature is the context as it is.
export const flagged = defineRoute("flagged", { parent: root }).context((): Record<string, string> => ({ locale: "en" }));

expect<Equal<ContextOf<typeof flagged>, Record<string, string>>>();

// A union context spreads per member, so it keeps its correlation under a later stage.
export const modes = defineRoute("modes", {}).context(
  (): { mode: "a"; a: number } | { mode: "b"; b: string } =>
    Math.random() > 0.5 ? { mode: "a", a: 1 } : { mode: "b", b: "b" },
);
export const moded = defineRoute("moded", { parent: modes }).context(({ context }) => ({ ...context, extra: true }));

expect<
  Equal<ContextOf<typeof moded>, { mode: "a"; a: number; extra: boolean } | { mode: "b"; b: string; extra: boolean }>
>();

// readCookies returns a read-only map whose get is typed for every name, Object member names
// included.
const cookies = readCookies(new Request("http://test/"));
const toStringCookie = cookies.get("toString");

expect<Equal<typeof cookies, ReadonlyMap<string, string>>>();
expect<Equal<typeof toStringCookie, string | undefined>>();
// @ts-expect-error the map is read-only to the caller
cookies.set("session", "x");

// @ts-expect-error steps come in order: no .context() after .remote()
defineRoute("late", {}).remote(() => ({})).context(() => ({}));
// @ts-expect-error each step at most once
defineRoute("twice", {}).context(() => ({})).context(() => ({}));
`;

await test("Launch routes type their stages, middleware and remote callbacks exactly, on the real router", () => {
  const { messages } = program({ "proof.ts": routeProof });

  assert.deepEqual(messages, []);
});

await test("a Launch route chain's declarations emit and recheck with skipLibCheck: false", () => {
  const { messages, emitted } = program(
    { "proof.ts": routeProof },
    {
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      rootDir: consumerDirectory,
      outDir: consumerDirectory,
    },
  );

  assert.deepEqual(messages, []);
  assert.ok(emitted["proof.d.ts"]?.includes("export declare const d7"), "proof.d.ts was emitted");

  const recheck = program({
    "emitted.d.ts": emitted["proof.d.ts"],
    "use.ts": `import { todos } from "./emitted.js";
import type { RemoteOf } from "@loozo/angular-launch";
const list: RemoteOf<typeof todos>["todos"]["list"] = null!;
const result: Promise<{ owner: string }[]> = list();
void result;`,
  });

  assert.deepEqual(recheck.messages, []);
});
