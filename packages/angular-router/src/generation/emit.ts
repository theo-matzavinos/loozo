import { dirname, extname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { markers, specifier } from "./files.js";
import { groupClaims, resolveModule, type Declaration, type Sources } from "./sources.js";
import { segmentMessage } from "./localization.js";
import { childTable, rootTable } from "./validate.js";
import { parentTargets } from "./selectors.js";
import { copies, typeImports, type LaunchCopies } from "./copies.js";

function lazySpecifier(from: string, file: string, options: ts.CompilerOptions): string {
  const emitted = specifier(from, file);
  const extensionless = emitted.slice(0, -3);
  const ordinary = resolveModule(extensionless, from, {
    ...options,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });

  if (ordinary === file) {
    return extensionless;
  }

  const fallback = resolveModule(emitted, from, {
    ...options,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });

  if (fallback !== file) {
    throw new Error(`Cannot emit an identity-preserving lazy page import: ${file}`);
  }

  return emitted;
}

/**
 * Every generated file's text by path. `launch`, from a route extension's generation, adds
 * its data, type exports and handle members to its routes' copies and `RouteTypes`.
 */
export function emit(
  sources: Sources,
  selected: ReadonlyMap<string, Declaration>,
  launch?: LaunchCopies,
  { translateSegments = false }: { translateSegments?: boolean } = {},
): Map<string, string> {
  const desired = new Map<string, string>();
  // Every admitted declaration gets its pair. Ancestors pruned by redirect hoisting have no
  // record, but the redirect sources below them still need their destination and copy.
  const declarations = sources.declarations;

  if (declarations.length === 0) {
    return desired;
  }

  const routesFile = resolve(sources.output, "routes.generated.ts");
  const names = new Map<Declaration, string>();
  const taken = new Set<string>();
  const byId = [...declarations].sort((a, b) => a.id.localeCompare(b.id, "en"));

  // Path-derived bindings, so adding or removing a declaration doesn't rename the others.
  // Sanitized paths that collide take numeric suffixes in id order.
  for (const declaration of byId) {
    const local = relative(sources.roots[0], declaration.file).split(sep).join("/");
    const stem = local.slice(0, local.length - extname(local).length);
    const base = stem.replace(/[^A-Za-z0-9_$]/g, "_");
    let name = base;

    for (let suffix = 2; taken.has(name); suffix += 1) {
      name = `${base}_${suffix}`;
    }

    taken.add(name);
    names.set(declaration, name);
  }

  const byIdentity = new Map(declarations.map((declaration) => [declaration.id, declaration]));
  const winners = new Map<Declaration, Declaration>();

  for (const [origin, target] of parentTargets(sources, selected)) {
    winners.set(byIdentity.get(origin)!, byIdentity.get(target)!);
  }

  function destinationFile(declaration: Declaration): string {
    return resolve(dirname(declaration.file), "destination.generated.ts");
  }

  function routeFile(declaration: Declaration): string {
    return resolve(dirname(declaration.file), "route.generated.ts");
  }

  const checker = sources.program.getTypeChecker();

  for (const declaration of declarations) {
    const own = routeFile(declaration);
    let parent: { destination: string; route: string } | undefined;
    let up: string | undefined;

    if (declaration.parent) {
      parent = {
        destination: specifier(own, destinationFile(declaration.parent)),
        route: specifier(own, routeFile(declaration.parent)),
      };
    }

    const winner = winners.get(declaration);

    if (winner) {
      up = specifier(own, destinationFile(winner));
    }

    let extension: Parameters<typeof copies>[2]["launch"];

    if (launch && declaration.extension) {
      extension = {
        data: launch.data.get(declaration),
        types: launch.types,
        members: launch.members,
      };
    }

    const pair = copies(declaration, checker, {
      parent,
      up,
      activates: declaration.retained,
      launch: extension,
      translate: translateSegments,
    });

    desired.set(destinationFile(declaration), pair.destination);
    desired.set(own, pair.route);
  }

  const records = declarations.filter((declaration) => declaration.retained || declaration.target);

  if (records.length === 0) {
    return desired;
  }

  // Options Angular takes as they are, read from the route copy itself.
  function usesNative(declaration: Declaration): boolean {
    return ["providers", "data", "canDeactivate", "runGuardsAndResolvers", "errorComponent"].some(
      (key) => declaration.config.has(key),
    );
  }

  // Parsed-input callbacks, adapted from the route copy; a redirect record never activates.
  // Local path params and effective search always get the generated canMatch that parses them.
  function usesCallbacks(declaration: Declaration): boolean {
    if (declaration.target) {
      return false;
    }

    if (declaration.segments.some((segment) => segment.kind !== "static")) {
      return true;
    }

    for (let owner: Declaration | undefined = declaration; owner; owner = owner.parent) {
      if (owner.config.has("search")) {
        return true;
      }
    }

    return ["canActivate", "canActivateChild", "canMatch", "resolve", "title"].some((key) =>
      declaration.config.has(key),
    );
  }

  // The extension's factory made the route, so its active handle gets the extension's
  // members from the record; a redirect record never activates.
  function stampsExtension(declaration: Declaration): boolean {
    return !!declaration.extension && !declaration.target;
  }

  // A redirect source with a parent reads its copy only when it first redirects, through an
  // import(), so its copy and its ancestors' copies stay out of the eager table.
  function lazyRedirect(declaration: Declaration): boolean {
    return !!declaration.target && !!declaration.parent;
  }

  // A copy is imported at runtime only where a record reads it at evaluation; RouteTypes
  // reads the other retained copies' types alone.
  function readsCopy(declaration: Declaration): boolean {
    if (lazyRedirect(declaration)) {
      return false;
    }

    return (
      usesNative(declaration) ||
      usesCallbacks(declaration) ||
      !!declaration.target ||
      stampsExtension(declaration)
    );
  }

  // Every route with a retained child loads their records lazily from its colocated
  // children.generated.ts.
  function childrenFile(declaration: Declaration): string {
    return resolve(dirname(declaration.file), "children.generated.ts");
  }

  function nativePath(declaration: Declaration, effective: boolean): string {
    const parts: string[] = [];
    let segments = declaration.segments;

    if (effective) {
      segments = declaration.effective;
    }

    for (const segment of segments) {
      if (segment.kind === "static") {
        parts.push(segment.text);
      } else if (segment.kind === "catchall") {
        parts.push("**");
      } else {
        parts.push(`:${segment.name}`);
      }
    }

    return parts.join("/");
  }

  // With translated segments, a record whose Angular path holds static text reads that text from
  // its destination, so matching uses the build's words: a hoisted redirect its effective path,
  // any other record its local one.
  function pathHelper(declaration: Declaration): "nativePath" | "effectivePath" | undefined {
    if (!translateSegments) {
      return undefined;
    }

    let segments = declaration.segments;

    if (declaration.target) {
      segments = declaration.effective;
    }

    if (!segments.some((segment) => segment.kind === "static")) {
      return undefined;
    }

    if (declaration.target) {
      return "effectivePath";
    }

    return "nativePath";
  }

  // A group's claims as `owned` reads them, relative to the group, deduplicated and sorted by
  // their source text so the bytes are deterministic. Translated words are inlined per build.
  function claims(group: Declaration): string {
    const patterns = new Map<string, string>();

    for (const claim of groupClaims(group)) {
      const tokens: string[] = [];
      const texts: string[] = [];

      for (const segment of claim.effective.slice(group.effective.length)) {
        if (segment.kind === "catchall") {
          tokens.push("**");
          texts.push('"**"');
        } else if (segment.kind !== "static") {
          tokens.push(":");
          texts.push('":"');
        } else {
          tokens.push(segment.text);

          if (translateSegments) {
            texts.push(segmentMessage(segment.text));
          } else {
            texts.push(JSON.stringify(segment.text));
          }
        }
      }

      patterns.set(JSON.stringify(tokens), `[${texts.join(", ")}]`);
    }

    const keys = [...patterns.keys()].sort();
    const texts: string[] = [];

    for (const key of keys) {
      texts.push(patterns.get(key)!);
    }

    return `[${texts.join(", ")}]`;
  }

  // One record as written into `file`, the table that holds it.
  function record(declaration: Declaration, file: string): string {
    const parts: string[] = [];
    const name = `route_${names.get(declaration)!}`;

    if (usesNative(declaration) && !lazyRedirect(declaration)) {
      parts.push(`...nativeOptions(${name})`);
    }

    const helper = pathHelper(declaration);

    if (helper) {
      parts.push(`path: ${helper}(destination_${names.get(declaration)!})`);
    } else {
      parts.push(`path: ${JSON.stringify(nativePath(declaration, !!declaration.target))}`);
    }

    // A branch root names its outlet; its descendants are primary children in its own table.
    if (declaration.outlet !== undefined) {
      parts.push(`outlet: ${JSON.stringify(declaration.outlet)}`);
    }

    if (declaration.full || declaration.target) {
      parts.push("pathMatch: 'full'");
    }

    const facts = [`destination_${names.get(declaration)!}`];
    const winner = winners.get(declaration);

    if (winner) {
      facts.push(`destination_${names.get(winner)!}`);
    }

    parts.push(`...record(${facts.join(", ")})`);

    if (lazyRedirect(declaration)) {
      parts.push(
        `redirectTo: lazyRedirect(() => import(${JSON.stringify(specifier(file, routeFile(declaration)))}))`,
      );
    } else if (declaration.target) {
      parts.push(`redirectTo: redirect(${name})`);
    } else {
      if (stampsExtension(declaration)) {
        parts.push(`...extension(${name})`);
      }

      if (declaration.group && usesCallbacks(declaration)) {
        parts.push(`...owned(${claims(declaration)}, callbacks(${name}))`);
      } else if (declaration.group) {
        parts.push(`...owned(${claims(declaration)})`);
      } else if (usesCallbacks(declaration) && declaration.anchorLeaf) {
        parts.push(`...callbacks(${name}, { onlyAtEnd: true })`);
      } else if (usesCallbacks(declaration)) {
        parts.push(`...callbacks(${name})`);
      }

      if (declaration.page) {
        // Keep route-array subtype reduction from comparing page classes and their handles.
        // The annotation still checks each imported module against Angular's loader contract.
        parts.push(
          `loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import(${JSON.stringify(lazySpecifier(file, declaration.page, sources.parsed.options))})`,
        );
      }

      if (childTable(declaration).length > 0) {
        parts.push(
          `loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import(${JSON.stringify(specifier(file, childrenFile(declaration)))}).then((m) => m.routes)`,
        );
      }
    }

    return `{ ${parts.join(",\n")} }`;
  }

  // The helper import and the value imports a table's own records read, in today's order:
  // copies in declaration order, then destinations (each record's own and its `..` winner's)
  // in id order.
  function imports(list: readonly Declaration[]) {
    const members = new Set(list);
    const helpers = ["record"];

    for (const helper of ["nativePath", "effectivePath"] as const) {
      if (list.some((declaration) => pathHelper(declaration) === helper)) {
        helpers.push(helper);
      }
    }

    if (list.some((declaration) => usesNative(declaration) && !lazyRedirect(declaration))) {
      helpers.push("nativeOptions");
    }

    if (list.some(usesCallbacks)) {
      helpers.push("callbacks");
    }

    if (list.some((declaration) => declaration.group)) {
      helpers.push("owned");
    }

    if (list.some((declaration) => declaration.target && !lazyRedirect(declaration))) {
      helpers.push("redirect");
    }

    if (list.some(lazyRedirect)) {
      helpers.push("lazyRedirect");
    }

    if (list.some(stampsExtension)) {
      helpers.push("extension");
    }

    const read: Declaration[] = [];

    for (const declaration of records) {
      if (members.has(declaration) && readsCopy(declaration)) {
        read.push(declaration);
      }
    }

    const destinations = new Set<Declaration>(list);

    for (const declaration of list) {
      const winner = winners.get(declaration);

      if (winner) {
        destinations.add(winner);
      }
    }

    return { helpers, read, destinations };
  }

  function copyImport(file: string, declaration: Declaration, type: boolean): string {
    let keyword = "import";

    if (type) {
      keyword = "import type";
    }

    return `${keyword} { route as route_${names.get(declaration)} } from ${JSON.stringify(specifier(file, routeFile(declaration)))};`;
  }

  function destinationImport(file: string, declaration: Declaration, type: boolean): string {
    let keyword = "import";

    if (type) {
      keyword = "import type";
    }

    return `${keyword} { destination as destination_${names.get(declaration)} } from ${JSON.stringify(specifier(file, destinationFile(declaration)))};`;
  }

  // Each children table, outermost first; a nested root's record sits in its parent's table.
  const pending = records.filter((declaration) => !declaration.parent && !declaration.target);

  while (pending.length > 0) {
    const root = pending.shift()!;
    const children = childTable(root);

    if (children.length === 0) {
      continue;
    }

    const file = childrenFile(root);
    const { helpers, read, destinations } = imports(children);
    const lines: string[] = [
      markers["children.generated.ts"],
      "import type { Routes } from '@angular/router';",
      `import { ${helpers.join(", ")} } from '@loozo/angular-router/_generated';`,
    ];

    for (const declaration of read) {
      lines.push(copyImport(file, declaration, false));
    }

    for (const declaration of byId) {
      if (destinations.has(declaration)) {
        lines.push(destinationImport(file, declaration, false));
      }
    }

    lines.push(`
/**
 * The generated records of the children of ${root.id}, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [${children.map((child) => record(child, file)).join(",\n")}];
`);
    desired.set(file, lines.join("\n"));
    pending.push(...children);
  }

  const top = rootTable(records);
  const { helpers, read, destinations } = imports(top);
  const retained = byId.filter((declaration) => declaration.retained);
  // The active route reads the primary chain only.
  const primary = retained.filter((declaration) => !declaration.branch);
  const routes: string[] = [
    markers["routes.generated.ts"],
    "import type { Signal } from '@angular/core';",
    "import type { Routes } from '@angular/router';",
  ];

  helpers.push(
    "injectGeneratedActiveRoute",
    "type RouteSchema",
    "type ActiveRoute as GeneratedActiveRoute",
    "type ActiveHandle as GeneratedActiveHandle",
  );
  routes.push(`import { ${helpers.join(", ")} } from '@loozo/angular-router/_generated';`);

  // RouteTypes members name the extension's types over each route copy.
  const memberTypes = new Map<string, string>();

  if (launch && launch.members.length > 0 && primary.some((declaration) => declaration.extension)) {
    const types = typeImports(launch.types);

    for (const member of launch.members) {
      const local = types.locals.get(member.type);

      if (!local) {
        throw new Error(`Route copy member type is not a type export: ${member.type}`);
      }

      memberTypes.set(member.member, local);
    }

    routes.push(...types.lines);
  }

  for (const declaration of read) {
    routes.push(copyImport(routesFile, declaration, false));
  }

  const valueCopies = new Set(read);

  for (const declaration of retained) {
    if (!valueCopies.has(declaration)) {
      routes.push(copyImport(routesFile, declaration, true));
    }
  }

  // A `..` winner that only RouteTypes names, because its origin's record lives in a children
  // table, is a type import here.
  const named = new Set<Declaration>();

  for (const declaration of primary) {
    const winner = winners.get(declaration);

    if (winner && !destinations.has(winner)) {
      named.add(winner);
    }
  }

  for (const declaration of byId) {
    if (destinations.has(declaration)) {
      routes.push(destinationImport(routesFile, declaration, false));
    } else if (named.has(declaration)) {
      routes.push(destinationImport(routesFile, declaration, true));
    }
  }

  routes.push(
    `
/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [${top.map((declaration) => record(declaration, routesFile)).join(",\n")}];\n`,
  );
  routes.push(
    "/** Each generated primary-outlet route's types by id: its schema and, when it has one, its `..` destination. */",
  );
  routes.push("export type RouteTypes = {");

  // One entry per line, so adding or removing a route changes only its own lines.
  for (const declaration of primary) {
    const entry = [`schema: RouteSchema<typeof route_${names.get(declaration)}>`];
    const winner = winners.get(declaration);

    if (winner) {
      entry.push(`up: typeof destination_${names.get(winner)}`);
    }

    if (declaration.extension && memberTypes.size > 0) {
      const members: string[] = [];

      for (const [member, local] of memberTypes) {
        members.push(`readonly ${member}: ${local}<typeof route_${names.get(declaration)}>`);
      }

      entry.push(`members: { ${members.join("; ")} }`);
    }

    routes.push(`${JSON.stringify(declaration.id)}: { ${entry.join("; ")} };`);
  }

  routes.push(`};
/** An active route narrowed by is(): that declaration's handle. */
export type ActiveHandle<Id extends keyof RouteTypes> = GeneratedActiveHandle<RouteTypes, Id>;
/** An active route before narrowing: params, search, data and title read as the union of the tree's values; link and navigate take a destination, and their own and \`..\` forms need is(). */
export type ActiveRoute = GeneratedActiveRoute<RouteTypes>;
/**
 * Injects a signal of the deepest active generated route in the primary outlet.
 *
 * @remarks
 * Call in an Angular injection context. The value changes only when a navigation
 * commits, and is undefined before the first one (on a server-rendered page with
 * provideActiveRouteHydration(), it reads the server's route until then) or when no
 * generated route is active. It never selects a named-outlet route. A route keeps its
 * handle while it stays active; each call is its own reader.
 */
export function injectActiveRoute(): Signal<ActiveRoute | undefined> {
  return injectGeneratedActiveRoute<RouteTypes>();
}
export { provideActiveRouteHydration } from '@loozo/angular-router/_generated';
`);
  desired.set(routesFile, routes.join("\n"));

  return desired;
}
