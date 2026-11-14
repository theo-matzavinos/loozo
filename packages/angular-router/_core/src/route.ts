import {
  codecFallback,
  isArrayCodec,
  validateCodec,
  type ParamCodec,
  type PathCodec,
} from "./codecs.js";
import { parsePath, type Segment, type ValidPath } from "./path.js";
import { checkKeys, has, ownRecord } from "./records.js";
import type {
  ContributionRecord,
  ExtensionSpec,
  NoExtension,
  ParentSchema,
  RouteBuilder,
  RouterStep,
  RuntimeExtension,
  UrlFacts,
} from "./fluent.js";
import type { AnyRoute, CodecMap } from "./types.js";

export interface RouteMetadata {
  readonly parent?: AnyRoute;
  readonly localSegments: readonly Segment[];
  readonly segments: readonly Segment[];
  readonly localParams: Readonly<Record<string, ParamCodec<any>>>;
  readonly localSearch: Readonly<Record<string, ParamCodec<any>>>;
  readonly params: Readonly<Record<string, ParamCodec<any>>>;
  readonly search: Readonly<Record<string, ParamCodec<any>>>;
  readonly fragments: readonly string[];
  /** URL facts and router steps: local codecs, parent, fragments and native behavior. */
  readonly config: Readonly<Record<string, unknown>>;
  /** Present once this route or an ancestor was made by an extension factory. Frozen. */
  readonly extension?: {
    readonly runtime: RuntimeExtension<ExtensionSpec>;
    /** Same-extension ancestors' own records, then this route's own (if any), root first. */
    readonly chain: readonly ContributionRecord[];
    /** True only when this route was made by that extension's factory. */
    readonly declared: boolean;
  };
}

const routes = new WeakMap<object, RouteMetadata>();
const factsKeys = new Set(["parent", "params", "search", "fragments"]);
const routerSteps: readonly RouterStep[] = [
  "canMatch",
  "canActivate",
  "canActivateChild",
  "canDeactivate",
  "resolve",
  "title",
  "providers",
  "data",
  "runGuardsAndResolvers",
  "onInvalidParams",
  "redirect",
];
// Any of these steps rules a redirect out.
const guardSteps = new Set<string>([
  "canMatch",
  "canActivate",
  "canActivateChild",
  "canDeactivate",
  "onInvalidParams",
]);
/**
 * Names a contributed step can't take: the router's steps, the route's own
 * property and witness names, `then`, which would make a route thenable, and
 * every Object.prototype member, which a route inherits whether or not it's offered.
 */
export const reservedStepNames: ReadonlySet<string> = new Set([
  ...routerSteps,
  "path",
  "then",
  "__params",
  "__search",
  "__data",
  "__title",
  "__contribution",
  ...Object.getOwnPropertyNames(Object.prototype),
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

    if (path && isArrayCodec(codec)) {
      throw new TypeError("arrayParam codecs are search-only");
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

    // A structural check only: it runs no codec.
    for (const key of Object.keys(values)) {
      if (
        isArrayCodec(target.search[key]) &&
        values[key] !== undefined &&
        !Array.isArray(values[key])
      ) {
        throw new TypeError(`Redirect search array requires an array: ${key}`);
      }
    }

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

// Path grammar, parent, local codecs and fragments: everything but behavior.
function facts(path: unknown, value: unknown): RouteMetadata {
  const supplied = ownRecord(value, "URL facts");

  checkKeys(supplied, factsKeys, "URL facts");

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

  Object.freeze(fragments);

  const config: Record<string, unknown> = { ...supplied };

  config.fragments = fragments;
  config.params = localParams;
  config.search = localSearch;

  return {
    parent,
    localSegments,
    segments: Object.freeze([...(inherited?.segments ?? []), ...localSegments]),
    localParams,
    localSearch,
    params: Object.freeze({ ...inherited?.params, ...localParams }),
    search: Object.freeze({ ...inherited?.search, ...localSearch }),
    fragments,
    config: Object.freeze(config),
  };
}

function callbackList(value: unknown, step: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${step} must be an array`);
  }

  for (const callback of value) {
    if (typeof callback !== "function") {
      throw new TypeError(`${step} entries must be callbacks`);
    }
  }

  return Object.freeze([...value]);
}

// One validator per router step. Each returns the value retained in the route's config.
const stepValues: Record<RouterStep, (value: unknown, route: RouteMetadata) => unknown> = {
  canMatch: (value) => callbackList(value, "canMatch"),
  canActivate: (value) => callbackList(value, "canActivate"),
  canActivateChild: (value) => callbackList(value, "canActivateChild"),
  canDeactivate(value) {
    if (!Array.isArray(value)) {
      throw new TypeError("canDeactivate must be an array");
    }

    for (const guard of value) {
      if (
        guard === null ||
        (typeof guard !== "function" && typeof guard !== "object" && typeof guard !== "string")
      ) {
        throw new TypeError("canDeactivate entries must be native callbacks or tokens");
      }
    }

    return Object.freeze([...value]);
  },
  resolve(value) {
    const resolve = ownRecord(value, "Resolvers", true) as Record<PropertyKey, unknown>;
    const copied: Record<PropertyKey, unknown> = Object.create(null);

    for (const key of Reflect.ownKeys(resolve)) {
      if (key === identityKey || typeof resolve[key] !== "function") {
        throw new TypeError(`Invalid resolver: ${String(key)}`);
      }

      copied[key] = resolve[key];
    }

    return Object.freeze(copied);
  },
  title(value) {
    if (typeof value !== "string" && typeof value !== "function") {
      throw new TypeError("Title must be a string or a callback");
    }

    return value;
  },
  providers(value) {
    if (!Array.isArray(value)) {
      throw new TypeError("providers must be an array");
    }

    return Object.freeze([...value]);
  },
  data(value) {
    const data = ownRecord(value, "Static data", true);

    if (has(data, identityKey)) {
      throw new TypeError("Static data cannot set generated identity");
    }

    return Object.freeze({ ...data });
  },
  runGuardsAndResolvers(value) {
    if (typeof value !== "function" && (typeof value !== "string" || !policies.has(value))) {
      throw new TypeError("Invalid native rerun policy");
    }

    return value;
  },
  onInvalidParams(value) {
    if (typeof value !== "function") {
      throw new TypeError("onInvalidParams must be a callback");
    }

    return value;
  },
  redirect: (value, route) => snapshotRedirect(value, route),
};

interface Stage {
  readonly path: string;
  readonly metadata: RouteMetadata;
  readonly used: ReadonlySet<string>;
  // Undefined for the router's own factory.
  readonly runtime?: RuntimeExtension<ExtensionSpec>;
  readonly ancestors: readonly ContributionRecord[];
  readonly own?: ContributionRecord;
  // The first manifest entry still offered.
  readonly next: number;
}

// A stage is a frozen { path } whose offered steps are non-enumerable own functions.
// Each step returns a new stage; earlier stages stay valid and unchanged.
function stage(state: Stage): AnyRoute {
  const route = { path: state.path };
  const steps = new Map<string, (...args: unknown[]) => AnyRoute>();

  if (!state.used.has("redirect")) {
    let guarded = false;

    for (const name of state.used) {
      if (guardSteps.has(name)) {
        guarded = true;
      }
    }

    for (const name of routerSteps) {
      const offered =
        !state.used.has(name) &&
        !(name === "redirect" && guarded) &&
        !(name === "onInvalidParams" && Object.keys(state.metadata.localParams).length === 0);

      if (!offered) {
        continue;
      }

      steps.set(name, (value: unknown) => {
        const retained = stepValues[name](value, state.metadata);
        const config = Object.freeze({ ...state.metadata.config, [name]: retained });

        return stage({
          ...state,
          metadata: { ...state.metadata, config },
          used: new Set([...state.used, name]),
        });
      });
    }
  }

  const runtime = state.runtime;

  if (runtime && state.used.size === 0) {
    for (let index = state.next; index < runtime.steps.length; index += 1) {
      const entry = runtime.steps[index];

      steps.set(entry.name, (...args: unknown[]) => {
        const { min, max } = entry.arity;

        if (args.length < min || (max !== null && args.length > max)) {
          if (max === null) {
            throw new TypeError(`Route step ${entry.name} takes at least ${min} arguments`);
          }

          throw new TypeError(`Route step ${entry.name} takes ${min}…${max} arguments`);
        }

        let value: unknown = Object.freeze([...args]);

        if (max === 1) {
          value = args[0];
        }

        const own = Object.freeze({ ...state.own, [entry.name]: value });
        const chain = Object.freeze([...state.ancestors, own]);

        return stage({
          ...state,
          metadata: {
            ...state.metadata,
            extension: Object.freeze({ runtime, chain, declared: true }),
          },
          own,
          next: index + 1,
        });
      });
    }
  }

  for (const [name, step] of steps) {
    Object.defineProperty(route, name, { value: step, enumerable: false });
  }

  routes.set(route, Object.freeze({ ...state.metadata }));

  return Object.freeze(route) as unknown as AnyRoute;
}

/** The fluent engine behind the router's `defineRoute` and every extension factory. */
export function declareRoute(
  runtime: RuntimeExtension<ExtensionSpec> | undefined,
  path: unknown,
  value: unknown,
): AnyRoute {
  const metadata = facts(path, value);
  const inherited = metadata.parent && routeMetadata(metadata.parent).extension;
  let extension: RouteMetadata["extension"];
  let ancestors: readonly ContributionRecord[] = Object.freeze([]);

  if (runtime) {
    if (inherited && inherited.runtime !== runtime) {
      throw new TypeError("Route ancestry mixes route extensions");
    }

    if (inherited) {
      ancestors = inherited.chain;
    }

    extension = Object.freeze({ runtime, chain: ancestors, declared: true });
  } else if (inherited) {
    // A router-made route forwards its parent's slot; its own callbacks get base inputs.
    extension = Object.freeze({
      runtime: inherited.runtime,
      chain: inherited.chain,
      declared: false,
    });
  }

  return stage({
    path: path as string,
    metadata: { ...metadata, extension },
    used: new Set(),
    runtime,
    ancestors,
    next: 0,
  });
}

/**
 * Declares a nominal typed route from its URL facts, without executing codecs or
 * native callbacks. Behavior follows as chained steps.
 *
 * @remarks
 * Paths are decoded authored text, not URLs: use `""` for root/pathless nodes,
 * `$name` for a scalar segment and terminal `$name[]` for a zero-or-more
 * catchall. Repeated local scalar names reuse one value. Leading/trailing or
 * repeated slashes, dot segments and Angular `:name`/wildcard notation are invalid.
 *
 * Parents compose effective params/search and resolver data transitively,
 * including through pathless nodes; a local resolver key hides an inherited
 * one. Children cannot redeclare ancestor-owned param or search keys or have a
 * catchall parent. Fragment names belong only to this declaration.
 *
 * Steps (`canMatch`, `canActivate`, `canActivateChild`, `canDeactivate`, `resolve`,
 * `title`, `providers`, `data`, `runGuardsAndResolvers`, `onInvalidParams`,
 * `redirect`) come in any order, each at most once; a used step is gone from the
 * returned value. `redirect` is terminal and isn't offered after a guard step or
 * `onInvalidParams`; `onInvalidParams` needs local path params. Each call returns a
 * new frozen route; application codecs, callbacks, providers and opaque values
 * retain identity and are not deep-frozen.
 *
 * For generation, author a direct default export of this call chain with a literal
 * path, inline URL facts and one argument per step. Parent and redirect targets must
 * be direct default imports of admitted declarations. Angular owns activation and
 * navigation; declaration alone does not register a route with Angular.
 *
 * @param path - The literal local path, relative to the authored parent.
 * @param facts - Local codecs, parent and fragments. Behavior goes in chained steps;
 * structural Angular options such as children, component and matcher are
 * generator-owned and cannot be set.
 * @returns A frozen route preserving inferred effective input types, offering its steps.
 * @throws TypeError for invalid paths or URL facts, missing or extra local codecs,
 * fallback or array codecs in path params, inherited key conflicts, and, from the
 * step that supplies them, invalid behavior values, nonarray redirect replacements
 * for array search keys, or nongenuine parent/redirect routes.
 *
 * @example
 * ```ts
 * const product = defineRoute("products/$productId", {
 *   params: { productId: numberParam },
 *   search: { tab: withFallback(enumParam(["details", "reviews"]), "details") },
 *   fragments: ["summary", "reviews"],
 * }).title(({ params }) => `Product ${params.productId}`);
 * ```
 */
export function defineRoute<
  const Path extends string,
  Parent extends AnyRoute | undefined = undefined,
  Params extends Record<string, PathCodec> = {},
  Search extends CodecMap = {},
  const Fragments extends readonly string[] = [],
>(
  path: Path & ValidPath<Path>,
  facts: UrlFacts<Path, Parent, Params, Search, Fragments>,
): RouteBuilder<
  Path,
  ParentSchema<Parent>,
  Params,
  Search,
  {},
  Fragments,
  unknown,
  never,
  NoExtension
>;

export function defineRoute(path: unknown, facts: unknown): AnyRoute {
  return declareRoute(undefined, path, facts);
}
