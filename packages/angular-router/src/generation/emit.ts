import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { markers } from "./files.js";
import { resolveModule, type Declaration, type Sources } from "./sources.js";
import { authoredPath } from "./validate.js";
import { relativeSelections } from "./selectors.js";

export function specifier(from: string, file: string): string {
  let name = relative(dirname(from), file).split(sep).join("/").replace(/\.ts$/, ".js");

  if (!name.startsWith(".")) {
    name = `./${name}`;
  }

  return name;
}

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
  const declarations = sources.declarations.filter(
    (declaration) => declaration.retained || declaration.target,
  );

  if (declarations.length === 0) {
    return desired;
  }

  const routesFile = resolve(sources.output, "routes.generated.ts");
  const sharedFile = resolve(sources.output, "destinations.generated.ts");
  const names = new Map<Declaration, string>();

  for (let index = 0; index < declarations.length; index += 1) {
    names.set(declarations[index], `definition${index}`);
  }

  const routes: string[] = [
    markers["routes.generated.ts"],
    "import type { Routes } from '@angular/router';",
  ];
  let needsNative = false;
  let needsCallbacks = false;
  let needsRedirect = false;

  // Options Angular takes as they are, read from the definition itself.
  function usesNative(declaration: Declaration): boolean {
    return ["providers", "data", "canDeactivate", "runGuardsAndResolvers"].some((key) =>
      declaration.config.has(key),
    );
  }

  // Parsed-input callbacks, adapted through the route set; a redirect record never activates.
  // Local path params always get the generated canMatch that parses them.
  function usesCallbacks(declaration: Declaration): boolean {
    return (
      !declaration.target &&
      (declaration.segments.some((segment) => segment.kind !== "static") ||
        ["canActivate", "canActivateChild", "canMatch", "resolve", "title"].some((key) =>
          declaration.config.has(key),
        ))
    );
  }

  for (const declaration of declarations) {
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

  const helpers: string[] = [];

  if (needsNative) {
    helpers.push("nativeOptions");
  }

  if (needsCallbacks) {
    helpers.push("callbacks");
    routes.push(`import { getRouteSet } from './destinations.generated.js';`);
  }

  if (needsRedirect) {
    helpers.push("redirect");
  }

  if (helpers.length > 0) {
    routes.push(`import { ${helpers.join(", ")} } from '@loozo/angular-router/_generated';`);
  }

  for (const declaration of declarations) {
    if (usesNative(declaration) || declaration.target) {
      routes.push(
        `import ${names.get(declaration)} from ${JSON.stringify(specifier(routesFile, declaration.file))};`,
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
    const name = names.get(declaration)!;

    if (usesNative(declaration)) {
      parts.push(`...nativeOptions(${name})`);
    }

    parts.push(`path: ${JSON.stringify(nativePath(declaration, !!declaration.target))}`);

    if (declaration.full || declaration.target) {
      parts.push("pathMatch: 'full'");
    }

    let data = "";

    if (declaration.config.has("data")) {
      data = `...nativeOptions(${name}).data as object, `;
    }

    parts.push(`data: { ${data}__loozoAngularRouterRouteId: ${JSON.stringify(declaration.id)} }`);

    if (declaration.target) {
      parts.push(`redirectTo: redirect(() => ${name})`);
    } else {
      if (usesCallbacks(declaration)) {
        parts.push(`...callbacks(getRouteSet(), ${JSON.stringify(declaration.id)})`);
      }

      if (declaration.page) {
        parts.push(
          `loadComponent: () => import(${JSON.stringify(lazySpecifier(routesFile, declaration.page, sources.parsed.options))})`,
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

  for (const declaration of declarations) {
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
  desired.set(routesFile, routes.join("\n"));

  const retained = declarations.filter((declaration) => declaration.retained);

  if (retained.length === 0) {
    return desired;
  }

  const shared: string[] = [
    markers["destinations.generated.ts"],
    "import type { RouteSet, Handle as GeneratedHandle, Destination as GeneratedDestination } from '@loozo/angular-router/_generated';",
  ];

  for (const declaration of declarations) {
    shared.push(
      `import ${names.get(declaration)} from ${JSON.stringify(specifier(sharedFile, declaration.file))};`,
    );
  }

  shared.push("\nexport type Definitions = {");

  for (const declaration of declarations) {
    shared.push(`${JSON.stringify(declaration.id)}: typeof ${names.get(declaration)};`);
  }

  shared.push("};\ndeclare const setIdentity: unique symbol;");
  shared.push("export type AbsoluteTargets = {");

  for (const [path, declaration] of selected) {
    shared.push(`${JSON.stringify(path)}: ${JSON.stringify(declaration.id)};`);
  }

  const relativeTargets = relativeSelections(sources, selected);

  shared.push("};\nexport type RelativeTargets = {");

  for (const [id, expressions] of relativeTargets) {
    shared.push(`${JSON.stringify(id)}: {`);

    for (const [expression, target] of expressions) {
      shared.push(`${JSON.stringify(expression)}: ${JSON.stringify(target)};`);
    }

    shared.push("};");
  }

  shared.push(
    `};
export type Selected<Id extends keyof RelativeTargets> = {
  readonly [Expression in keyof AbsoluteTargets | keyof RelativeTargets[Id]]:
    Definitions[(Expression extends keyof AbsoluteTargets ? AbsoluteTargets[Expression] :
      Expression extends keyof RelativeTargets[Id] ? RelativeTargets[Id][Expression] : never) & keyof Definitions];
};
/** A declaration-bound handle; obtain it through its colocated injectRoute facade. */
export type Handle<Id extends keyof RelativeTargets> = GeneratedHandle<Definitions[Id], Selected<Id>, typeof setIdentity, Pick<Definitions, keyof RelativeTargets>>;
/** A same-set nominal reference; use the destination exported by a colocated facade. */
export type Destination<Id extends keyof RelativeTargets> = GeneratedDestination<Definitions[Id], typeof setIdentity, Id>;
const routeSet: RouteSet = { records: {`,
  );

  for (const declaration of retained) {
    const owners: string[] = [];
    let current: Declaration | undefined = declaration;

    while (current) {
      owners.unshift(current.id);
      current = current.parent;
    }

    shared.push(
      `${JSON.stringify(declaration.id)}: { definition: () => ${names.get(declaration)}, owners: ${JSON.stringify(owners)} },`,
    );
  }

  shared.push("}, destinations: {");

  for (const declaration of declarations) {
    shared.push(`${JSON.stringify(declaration.id)}: () => ${names.get(declaration)},`);
  }

  const absoluteSelectors: Record<string, string> = Object.create(null);
  const relativeSelectors: Record<string, Record<string, string>> = Object.create(null);

  for (const [path, declaration] of selected) {
    absoluteSelectors[path] = declaration.id;
  }

  for (const [id, expressions] of relativeTargets) {
    relativeSelectors[id] = Object.fromEntries(expressions);
  }

  shared.push(
    `}, absolute: ${JSON.stringify(absoluteSelectors)}, relative: ${JSON.stringify(relativeSelectors)} };\nexport function getRouteSet(): RouteSet { return routeSet; }\n`,
  );
  desired.set(sharedFile, shared.join("\n"));

  for (const declaration of retained) {
    const facade = resolve(dirname(declaration.file), "route.generated.ts");
    const body = [
      markers["route.generated.ts"],
      "import { createDestination, injectGeneratedRoute } from '@loozo/angular-router/_generated';",
      `import { getRouteSet, type Destination, type Handle } from ${JSON.stringify(specifier(facade, sharedFile))};`,
      "export { defineRoute } from '@loozo/angular-router';",
      `/**
 * Inert reference to this exact declaration for same-set handle link/navigate calls.
 * No injection context is required; copies and foreign-set references are invalid.
 * This is not an authored route and cannot be passed to the root createUrl function.
 */`,
      `export const destination: Destination<${JSON.stringify(declaration.id)}> = createDestination(() => getRouteSet(), ${JSON.stringify(declaration.id)});`,
      `/**
 * Injects a typed handle bound to this exact generated activated route record.
 *
 * @remarks
 * Call in an Angular injection context. The handle exposes readonly native
 * params/search/data Resources and destination-typed link/navigate methods.
 * Data includes local resolver results only, not static or inherited data.
 * All navigation values are explicit; current inputs are never reused implicitly.
 *
 * @returns A noncallable handle for this declaration.
 * @throws A synchronous wiring error outside an injection context or when the
 * activated record does not carry this declaration's own generated identity.
 */`,
      `export function injectRoute(): Handle<${JSON.stringify(declaration.id)}> { return injectGeneratedRoute(getRouteSet(), ${JSON.stringify(declaration.id)}); }`,
      "",
    ];

    desired.set(facade, body.join("\n"));
  }

  return desired;
}
