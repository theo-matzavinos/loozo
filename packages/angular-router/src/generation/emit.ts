import { dirname, extname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { markers, specifier } from "./files.js";
import { resolveModule, type Declaration, type Sources } from "./sources.js";
import { authoredPath } from "./validate.js";
import { parentTargets } from "./selectors.js";
import { copies } from "./copies.js";

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

export function emit(
  sources: Sources,
  selected: ReadonlyMap<string, Declaration>,
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

    const pair = copies(declaration, checker, { parent, up, activates: declaration.retained });

    desired.set(destinationFile(declaration), pair.destination);
    desired.set(own, pair.route);
  }

  const records = declarations.filter((declaration) => declaration.retained || declaration.target);

  if (records.length === 0) {
    return desired;
  }

  const routes: string[] = [
    markers["routes.generated.ts"],
    "import type { Signal } from '@angular/core';",
    "import type { Routes } from '@angular/router';",
  ];
  let needsNative = false;
  let needsCallbacks = false;
  let needsRedirect = false;

  // Options Angular takes as they are, read from the route copy itself.
  function usesNative(declaration: Declaration): boolean {
    return ["providers", "data", "canDeactivate", "runGuardsAndResolvers"].some((key) =>
      declaration.config.has(key),
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

  for (const declaration of records) {
    if (usesNative(declaration)) {
      needsNative = true;
    }

    if (usesCallbacks(declaration)) {
      needsCallbacks = true;
    }

    if (declaration.target) {
      needsRedirect = true;
    }
  }

  const helpers = ["record"];

  if (needsNative) {
    helpers.push("nativeOptions");
  }

  if (needsCallbacks) {
    helpers.push("callbacks");
  }

  if (needsRedirect) {
    helpers.push("redirect");
  }

  helpers.push(
    "injectGeneratedActiveRoute",
    "type RouteSchema",
    "type ActiveRoute as GeneratedActiveRoute",
    "type ActiveHandle as GeneratedActiveHandle",
  );
  routes.push(`import { ${helpers.join(", ")} } from '@loozo/angular-router/_generated';`);

  // A copy is imported at runtime only where a record reads it; RouteTypes reads the other
  // retained copies' types alone.
  function readsCopy(declaration: Declaration): boolean {
    return usesNative(declaration) || usesCallbacks(declaration) || !!declaration.target;
  }

  const retained = byId.filter((declaration) => declaration.retained);

  for (const declaration of records) {
    if (readsCopy(declaration)) {
      routes.push(
        `import { route as route_${names.get(declaration)} } from ${JSON.stringify(specifier(routesFile, routeFile(declaration)))};`,
      );
    }
  }

  for (const declaration of retained) {
    if (!readsCopy(declaration)) {
      routes.push(
        `import type { route as route_${names.get(declaration)} } from ${JSON.stringify(specifier(routesFile, routeFile(declaration)))};`,
      );
    }
  }

  // Each record's own destination and each distinct ".." winner's, once, in id order. A
  // winner pruned from the records still has its destination file.
  const imported = new Set<Declaration>(records);

  for (const declaration of retained) {
    const winner = winners.get(declaration);

    if (winner) {
      imported.add(winner);
    }
  }

  for (const declaration of byId) {
    if (imported.has(declaration)) {
      routes.push(
        `import { destination as destination_${names.get(declaration)} } from ${JSON.stringify(specifier(routesFile, destinationFile(declaration)))};`,
      );
    }
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

  function record(declaration: Declaration): string {
    const parts: string[] = [];
    const name = `route_${names.get(declaration)!}`;

    if (usesNative(declaration)) {
      parts.push(`...nativeOptions(${name})`);
    }

    parts.push(`path: ${JSON.stringify(nativePath(declaration, !!declaration.target))}`);

    if (declaration.full || declaration.target) {
      parts.push("pathMatch: 'full'");
    }

    const facts = [`destination_${names.get(declaration)!}`];
    const winner = winners.get(declaration);

    if (winner) {
      facts.push(`destination_${names.get(winner)!}`);
    }

    parts.push(`...record(${facts.join(", ")})`);

    if (declaration.target) {
      parts.push(`redirectTo: redirect(${name})`);
    } else {
      if (usesCallbacks(declaration)) {
        parts.push(`...callbacks(${name})`);
      }

      if (declaration.page) {
        // Keep route-array subtype reduction from comparing page classes and their handles.
        // The annotation still checks each imported module against Angular's loader contract.
        parts.push(
          `loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import(${JSON.stringify(lazySpecifier(routesFile, declaration.page, sources.parsed.options))})`,
        );
      }

      const children = declaration.children.filter((child) => child.retained);

      children.sort(order);

      if (children.length > 0) {
        parts.push(`children: [${children.map(record).join(",\n")}]`);
      }
    }

    return `{ ${parts.join(",\n")} }`;
  }

  function order(a: Declaration, b: Declaration): number {
    const catchA = a.segments.at(-1)?.kind === "catchall";
    const catchB = b.segments.at(-1)?.kind === "catchall";

    if (catchA !== catchB) {
      if (catchA) {
        return 1;
      }

      return -1;
    }

    return authoredPath(a).localeCompare(authoredPath(b), "en") || a.id.localeCompare(b.id, "en");
  }

  const before: Declaration[] = [];
  const ordinary: Declaration[] = [];
  const after: Declaration[] = [];

  for (const declaration of records) {
    if (declaration.target) {
      if (declaration.effective.at(-1)?.kind === "catchall") {
        after.push(declaration);
      } else {
        before.push(declaration);
      }
    } else if (!declaration.parent) {
      ordinary.push(declaration);
    }
  }

  for (const group of [before, ordinary, after]) {
    group.sort(order);
  }

  routes.push(
    `
/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [${[...before, ...ordinary, ...after].map(record).join(",\n")}];\n`,
  );
  routes.push(
    "/** Each generated route's types by id: its schema and, when it has one, its `..` destination. */",
  );
  routes.push("export type RouteTypes = {");

  // One entry per line, so adding or removing a route changes only its own lines.
  for (const declaration of retained) {
    const entry = [`schema: RouteSchema<typeof route_${names.get(declaration)}>`];
    const winner = winners.get(declaration);

    if (winner) {
      entry.push(`up: typeof destination_${names.get(winner)}`);
    }

    routes.push(`${JSON.stringify(declaration.id)}: { ${entry.join("; ")} };`);
  }

  routes.push(`};
/** An active route narrowed by is(): that declaration's handle. */
export type ActiveHandle<Id extends keyof RouteTypes> = GeneratedActiveHandle<RouteTypes, Id>;
/** An active route before narrowing: params, search, data and title read as the union of the tree's values; link and navigate need is(). */
export type ActiveRoute = GeneratedActiveRoute<RouteTypes>;
/**
 * Injects a signal of the deepest active generated route in the primary outlet.
 *
 * @remarks
 * Call in an Angular injection context. The value changes only when a navigation
 * commits, and is undefined before the first one or when no generated route is
 * active. A route keeps its handle while it stays active; each call is its own reader.
 */
export function injectActiveRoute(): Signal<ActiveRoute | undefined> {
  return injectGeneratedActiveRoute<RouteTypes>();
}
`);
  desired.set(routesFile, routes.join("\n"));

  return desired;
}
