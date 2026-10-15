import { codecFallback, validateCodec, type ParamCodec, type PathCodec } from "./codecs.js";
import { parsePath, type Segment, type ValidPath, type CatchallName } from "./path.js";
import { checkKeys, has, ownRecord } from "./records.js";
import type {
  AnyRoute,
  CodecMap,
  EffectiveParams,
  EffectiveSearch,
  Route,
  RouteConfig,
  SearchOf,
} from "./types.js";

export interface RouteMetadata {
  readonly parent?: AnyRoute;
  readonly localSegments: readonly Segment[];
  readonly segments: readonly Segment[];
  readonly localParams: Readonly<Record<string, ParamCodec<any>>>;
  readonly localSearch: Readonly<Record<string, ParamCodec<any>>>;
  readonly params: Readonly<Record<string, ParamCodec<any>>>;
  readonly search: Readonly<Record<string, ParamCodec<any>>>;
  readonly fragments: readonly string[];
  readonly config: Readonly<Record<string, unknown>>;
}

const routes = new WeakMap<object, RouteMetadata>();
const configKeys = new Set([
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
  "onInvalidParams",
  "canDeactivate",
  "providers",
  "title",
  "data",
]);
const policies = new Set([
  "pathParamsChange",
  "pathParamsOrQueryParamsChange",
  "paramsChange",
  "paramsOrQueryParamsChange",
  "always",
]);
const identityKey = "__loozoAngularRouterRouteId";

export function routeMetadata(route: unknown): RouteMetadata {
  if (route === null || typeof route !== "object" || !routes.has(route)) {
    throw new TypeError("Expected a genuine route from this package instance");
  }

  return routes.get(route)!;
}

function copyCodecs(value: unknown, path: boolean): Readonly<Record<string, ParamCodec<any>>> {
  const record = ownRecord(value, "Codec map");
  const result: Record<string, ParamCodec<any>> = Object.create(null);

  for (const key of Object.keys(record)) {
    const codec = record[key];

    validateCodec(codec);

    if (path && codecFallback(codec)) {
      throw new TypeError("withFallback codecs are search-only");
    }

    result[key] = codec;
  }

  return Object.freeze(result);
}

function snapshotRedirect(
  value: unknown,
  source: RouteMetadata,
): Readonly<Record<string, unknown>> {
  const redirect = ownRecord(value, "Redirect");

  checkKeys(redirect, new Set(["to", "params", "search", "fragment"]), "redirect");

  const target = routeMetadata(redirect.to);
  const mapping: Record<string, string> = Object.create(null);

  if (has(redirect, "params")) {
    const supplied = ownRecord(redirect.params, "Redirect params");

    checkKeys(supplied, new Set(Object.keys(target.params)), "redirect params");

    for (const key of Object.keys(target.params)) {
      const sourceKey = supplied[key];

      if (!has(supplied, key) || typeof sourceKey !== "string" || !has(source.params, sourceKey)) {
        throw new TypeError(`Missing or invalid redirect mapping: ${key}`);
      }

      mapping[key] = sourceKey;
    }
  } else {
    for (const key of Object.keys(target.params)) {
      if (!has(source.params, key)) {
        throw new TypeError(`Cannot forward redirect param: ${key}`);
      }

      mapping[key] = key;
    }
  }

  const search = ownRecord(redirect.search, "Redirect search");
  let searchSnapshot: Record<string, unknown>;

  if (search.mode === "replace") {
    checkKeys(search, new Set(["mode", "values"]), "redirect search");

    const values = ownRecord(search.values, "Redirect replacement");

    checkKeys(values, new Set(Object.keys(target.search)), "search values");
    searchSnapshot = { mode: "replace", values: Object.freeze({ ...values }) };
  } else if (search.mode === "preserve" || search.mode === "drop") {
    checkKeys(search, new Set(["mode"]), "redirect search");
    searchSnapshot = { mode: search.mode };
  } else {
    throw new TypeError("Invalid redirect search policy");
  }

  const fragment = ownRecord(redirect.fragment, "Redirect fragment");

  if (fragment.mode === "replace") {
    checkKeys(fragment, new Set(["mode", "value"]), "redirect fragment");

    if (typeof fragment.value !== "string" || !target.fragments.includes(fragment.value)) {
      throw new TypeError("Redirect fragment must belong to target declaration");
    }
  } else if (fragment.mode === "preserve" || fragment.mode === "drop") {
    checkKeys(fragment, new Set(["mode"]), "redirect fragment");
  } else {
    throw new TypeError("Invalid redirect fragment policy");
  }

  return Object.freeze({
    to: redirect.to,
    params: Object.freeze(mapping),
    search: Object.freeze(searchSnapshot),
    fragment: Object.freeze({ ...fragment }),
  });
}

/**
 * Declares a nominal typed route without executing codecs or native callbacks.
 *
 * @remarks
 * Paths are decoded authored text, not URLs: use `""` for root/pathless nodes,
 * `$name` for a scalar segment and terminal `$name[]` for a zero-or-more
 * catchall. Repeated local scalar names reuse one value. Leading/trailing or
 * repeated slashes, dot segments and Angular `:name`/wildcard notation are invalid.
 *
 * Parents compose effective params/search transitively, including through
 * pathless nodes. Children cannot redeclare ancestor-owned keys or have a
 * catchall parent. Fragment names belong only to this declaration.
 * The route and copied containers are shallow-frozen; application codecs,
 * callbacks, providers and opaque values retain identity and are not deep-frozen.
 *
 * For generation, author a direct default export of this call with a literal
 * path and inline config. Parent and redirect targets must be direct default
 * imports of admitted declarations. Angular owns activation and navigation;
 * declaration alone does not register a route with Angular.
 *
 * @param path - The literal local path, relative to the authored parent.
 * @param config - Local codecs, parent, fragments and supported native behavior.
 * Structural Angular options such as children, component and matcher are
 * generator-owned and cannot be overridden.
 * @returns A frozen route preserving inferred effective input and local data types.
 * @throws TypeError for invalid paths/configuration, missing or extra local
 * codecs, fallback codecs in path params, inherited key conflicts, or
 * nongenuine parent/redirect routes.
 *
 * @example
 * ```ts
 * const product = defineRoute("products/$productId", {
 *   params: { productId: numberParam },
 *   search: { tab: withFallback(enumParam(["details", "reviews"]), "details") },
 *   fragments: ["summary", "reviews"],
 * });
 * ```
 */
export function defineRoute<
  const Path extends string,
  Parent extends AnyRoute | undefined = undefined,
  Params extends Record<string, PathCodec> = {},
  Search extends CodecMap = {},
  Resolvers extends Record<string, (...args: any[]) => unknown> = {},
  const Fragments extends readonly string[] = [],
  Target extends AnyRoute | undefined = undefined,
  ReplacementKeys extends keyof SearchOf<NoInfer<Target>> = never,
>(
  path: Path & ValidPath<Path>,
  config: RouteConfig<Path, Parent, Params, Search, Resolvers, Fragments, Target, ReplacementKeys>,
): Route<
  Path,
  EffectiveParams<Path, Params, Parent>,
  EffectiveSearch<Search, Parent>,
  Resolvers,
  Fragments[number],
  CatchallName<Path> extends never ? false : true
>;

export function defineRoute(path: unknown, config: unknown): AnyRoute {
  const supplied = ownRecord(config, "Route config");

  checkKeys(supplied, configKeys, "route config");

  const localSegments = parsePath(path);
  let parent: AnyRoute | undefined;
  let inherited: RouteMetadata | undefined;

  if (has(supplied, "parent")) {
    inherited = routeMetadata(supplied.parent);
    parent = supplied.parent as AnyRoute;

    for (const segment of inherited.segments) {
      if (segment.kind === "catchall") {
        throw new TypeError("Catchall declarations cannot have children");
      }
    }
  }

  const localNames = new Set<string>();

  for (const segment of localSegments) {
    if (segment.kind !== "static") {
      localNames.add(segment.name);
    }
  }

  let localParams: Readonly<Record<string, ParamCodec<any>>> = Object.freeze(Object.create(null));

  if (localNames.size === 0) {
    if (has(supplied, "params")) {
      throw new TypeError("Static paths cannot declare params");
    }
  } else {
    localParams = copyCodecs(supplied.params, true);
    checkKeys(localParams, localNames, "local params");

    for (const key of localNames) {
      if (!has(localParams, key)) {
        throw new TypeError(`Missing local codec: ${key}`);
      }

      if (inherited && has(inherited.params, key)) {
        throw new TypeError(`Inherited param already owned: ${key}`);
      }
    }
  }

  let localSearch: Readonly<Record<string, ParamCodec<any>>> = Object.freeze(Object.create(null));

  if (has(supplied, "search")) {
    localSearch = copyCodecs(supplied.search, false);
  }

  for (const key of Object.keys(localSearch)) {
    if (inherited && has(inherited.search, key)) {
      throw new TypeError(`Inherited search already owned: ${key}`);
    }
  }

  const retained: Record<string, unknown> = { ...supplied };
  const result: {
    path: string;
    resolve?: Readonly<Record<PropertyKey, unknown>>;
    runGuardsAndResolvers?: unknown;
  } = { path: path as string };

  if (has(supplied, "resolve")) {
    const resolve = ownRecord(supplied.resolve, "Resolvers", true) as Record<PropertyKey, unknown>;
    const copied: Record<PropertyKey, unknown> = Object.create(null);

    for (const key of Reflect.ownKeys(resolve)) {
      if (key === identityKey || typeof resolve[key] !== "function") {
        throw new TypeError(`Invalid resolver: ${String(key)}`);
      }

      copied[key] = resolve[key];
    }

    result.resolve = Object.freeze(copied);
    retained.resolve = result.resolve;
  }

  if (has(supplied, "runGuardsAndResolvers")) {
    const policy = supplied.runGuardsAndResolvers;

    if (typeof policy !== "function" && (typeof policy !== "string" || !policies.has(policy))) {
      throw new TypeError("Invalid native rerun policy");
    }

    result.runGuardsAndResolvers = policy;
  }

  for (const key of ["canActivate", "canActivateChild", "canMatch", "canDeactivate", "providers"]) {
    if (!has(supplied, key)) {
      continue;
    }

    const list = supplied[key];

    if (!Array.isArray(list)) {
      throw new TypeError(`${key} must be an array`);
    }

    if (key === "canActivate" || key === "canActivateChild" || key === "canMatch") {
      for (const callback of list) {
        if (typeof callback !== "function") {
          throw new TypeError(`${key} entries must be callbacks`);
        }
      }
    } else if (key === "canDeactivate") {
      for (const guard of list) {
        if (
          guard === null ||
          (typeof guard !== "function" && typeof guard !== "object" && typeof guard !== "string")
        ) {
          throw new TypeError("canDeactivate entries must be native callbacks or tokens");
        }
      }
    }

    retained[key] = Object.freeze([...list]);
  }

  if (has(supplied, "onInvalidParams")) {
    if (typeof supplied.onInvalidParams !== "function") {
      throw new TypeError("onInvalidParams must be a callback");
    }

    if (localNames.size === 0) {
      throw new TypeError("onInvalidParams requires local path params");
    }
  }

  if (
    has(supplied, "title") &&
    typeof supplied.title !== "string" &&
    typeof supplied.title !== "function"
  ) {
    throw new TypeError("Title must be a string or a callback");
  }

  if (has(supplied, "data")) {
    const data = ownRecord(supplied.data, "Static data", true);

    if (has(data, identityKey)) {
      throw new TypeError("Static data cannot set generated identity");
    }

    retained.data = Object.freeze({ ...data });
  }

  const fragments: string[] = [];

  if (has(supplied, "fragments")) {
    if (!Array.isArray(supplied.fragments)) {
      throw new TypeError("Fragments must be a string list");
    }

    for (const name of supplied.fragments) {
      if (typeof name !== "string") {
        throw new TypeError("Fragment names must be strings");
      }

      fragments.push(name);
    }
  }

  retained.fragments = Object.freeze(fragments);
  retained.params = localParams;
  retained.search = localSearch;

  const metadata: RouteMetadata = {
    parent,
    localSegments,
    segments: Object.freeze([...(inherited?.segments ?? []), ...localSegments]),
    localParams,
    localSearch,
    params: Object.freeze({ ...inherited?.params, ...localParams }),
    search: Object.freeze({ ...inherited?.search, ...localSearch }),
    fragments: retained.fragments as readonly string[],
    config: retained,
  };

  if (has(supplied, "redirect")) {
    if (
      has(supplied, "canActivate") ||
      has(supplied, "canMatch") ||
      has(supplied, "onInvalidParams")
    ) {
      throw new TypeError("Redirect cannot declare own canActivate, canMatch or onInvalidParams");
    }

    retained.redirect = snapshotRedirect(supplied.redirect, metadata);
  }

  Object.freeze(retained);
  routes.set(result, Object.freeze(metadata));

  return Object.freeze(result) as AnyRoute;
}
