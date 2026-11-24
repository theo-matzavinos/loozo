import { EnvironmentInjector, inject, runInInjectionContext } from "@angular/core";
import {
  PRIMARY_OUTLET,
  Router,
  RedirectCommand,
  UrlSegmentGroup,
  UrlTree,
  type Route,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  type GuardResult,
  type CanActivateFn,
  type CanActivateChildFn,
  type CanMatchFn,
  type ResolveFn,
  type RedirectFunction,
  type Routes,
} from "@angular/router";
import { from, isObservable, map, type ObservableInput } from "rxjs";
import {
  branchPath,
  destinationRecord,
  isArrayCodec,
  routeMetadata,
  type AnyRoute,
  type DestinationRecord,
  type Segment,
} from "@loozo/angular-router/_core";
import {
  hasIdentity,
  callbackInputs,
  destinationOf,
  matchingCallbackInputs,
  matchingInputs,
  pathInputs,
  runPathJobs,
  validateRaw,
  type Job,
} from "./inputs.js";
import { resolverStamp } from "./record.js";
import { rememberedKeys } from "./remembered.js";
import { restoreGate } from "./restore.js";

// The gate's own resolve entry, on records under a remembered key: module-private, so no
// authored key collides with it, and never stamped, so handles and seeds don't read it.
const restoreKey = Symbol("@loozo/angular-router restore");

export type Callbacks = Pick<
  Route,
  "canActivate" | "canActivateChild" | "canMatch" | "resolve" | "title"
> &
  Partial<ReturnType<typeof resolverStamp>>;

/**
 * The native callbacks of a generated record, adapted from its route copy. A copy that
 * declares resolvers also stamps their authored keys onto the record, for handles to read:
 * Angular adds its own entries to the native resolve map.
 *
 * Parsing is synchronous, so every adapter calls its callback in the same call Angular
 * made: Angular's injection context is still active and inject() works at entry.
 *
 * With `onlyAtEnd`, generation's choice for an empty leaf at a named branch's anchor, which
 * matches by prefix so it renders beside the branch, each canMatch adapter refuses first
 * thing when primary segments remain: the leaf's matching callbacks and inputs run only
 * where the leaf ends the primary path.
 */
export function callbacks(
  route: AnyRoute,
  { onlyAtEnd = false }: { readonly onlyAtEnd?: boolean } = {},
): Callbacks {
  const own = destinationOf(route);
  const metadata = routeMetadata(route);
  const config = metadata.config;
  const result: Callbacks = {};
  const activate = config.canActivate as readonly ((...args: any[]) => any)[] | undefined;

  if (activate) {
    result.canActivate = activate.map(
      (callback): CanActivateFn =>
        (snapshot, state) =>
          callback(callbackInputs(route, snapshot), snapshot, state),
    );
  }

  const children = config.canActivateChild as readonly ((...args: any[]) => any)[] | undefined;

  if (children) {
    result.canActivateChild = children.map((callback): CanActivateChildFn => (child, state) => {
      let parent: ActivatedRouteSnapshot | undefined;

      // The native ancestry includes child itself; only proper ancestors can declare this guard.
      for (let index = child.pathFromRoot.length - 2; index >= 0; index -= 1) {
        const ancestor = child.pathFromRoot[index];

        if (hasIdentity(ancestor, own)) {
          parent = ancestor;

          break;
        }
      }

      if (!parent) {
        throw new Error(`Generated guard ancestor missing: ${destinationRecord(own).id}`);
      }

      return callback(callbackInputs(route, parent), child, state);
    });
  }

  const matching = config.canMatch as readonly ((...args: any[]) => any)[] | undefined;
  const canMatch: CanMatchFn[] = [];

  // Local path params decide whether this record matches. Angular runs every canMatch
  // guard concurrently and prefers the first non-true result in array order.
  if (
    metadata.localSegments.some((segment) => segment.kind !== "static") ||
    Object.keys(metadata.search).length > 0
  ) {
    const handler = config.onInvalidParams as ((...args: any[]) => unknown) | undefined;

    canMatch.push((native, segments, snapshot) => {
      if (onlyAtEnd && segments.length > 0) {
        return false;
      }

      const path = pathInputs(route, snapshot);

      if (!("error" in path)) {
        // Search never decides the match, but Angular runs this guard on every navigation,
        // query-only ones included, so a thenable search parse fails it here.
        matchingInputs(route, snapshot);

        return true;
      }

      if (!handler) {
        return false;
      }

      const decision = handler(path.error, native, segments, snapshot);

      if (isObservable(decision) || isPromiseResult(decision)) {
        return from(decision as ObservableInput<unknown>).pipe(map(invalidParamsResult));
      }

      return invalidParamsResult(decision);
    });
  }

  if (matching) {
    for (const callback of matching) {
      canMatch.push((native, segments, snapshot) => {
        if (onlyAtEnd && segments.length > 0) {
          return false;
        }

        const inputs = matchingCallbackInputs(route, snapshot);

        // Invalid path params: the generated guard ahead of this one decides.
        if (inputs === undefined) {
          return false;
        }

        return callback(inputs, native, segments, snapshot);
      });
    }
  }

  if (canMatch.length > 0) {
    result.canMatch = canMatch;
  }

  const resolvers = config.resolve as
    | Record<
        PropertyKey,
        (inputs: unknown, snapshot: ActivatedRouteSnapshot, state: RouterStateSnapshot) => any
      >
    | undefined;

  // A primary record's resolvers and dynamic title restore remembered keys before their
  // callback: whichever one Angular calls first in the resolve phase, after every guard.
  // A named-outlet record never resolves before the primary owner, so it isn't gated.
  const gated = metadata.branch === undefined;

  if (resolvers) {
    const resolve: Record<PropertyKey, ResolveFn<unknown>> = Object.create(null);
    const keys = Reflect.ownKeys(resolvers);

    for (const key of keys) {
      resolve[key] = (snapshot, state) => {
        if (gated) {
          const restore = restoreGate(state);

          if (restore !== true) {
            return restore;
          }
        }

        return resolvers[key](callbackInputs(route, snapshot), snapshot, state);
      };
    }

    result.resolve = resolve;
    // Beside the native map, never on it: Angular runs every own key of that map, symbols too.
    Object.assign(result, resolverStamp(keys));
  }

  // Angular schedules every record of an entered owner's subtree, so the gate always runs on
  // an entering navigation, even where no resolver or title is authored.
  if (gated && rememberedKeys(own).length > 0) {
    const gate: ResolveFn<unknown> = (_snapshot, state) => restoreGate(state);

    result.resolve = { ...result.resolve, [restoreKey]: gate };
  }

  const title = config.title as
    | string
    | ((inputs: unknown, snapshot: ActivatedRouteSnapshot, state: RouterStateSnapshot) => any)
    | undefined;

  // Angular runs a title callback as a resolver, so it's adapted like one.
  if (typeof title === "function") {
    result.title = (snapshot, state) => {
      if (gated) {
        const restore = restoreGate(state);

        if (restore !== true) {
          return restore;
        }
      }

      return title(callbackInputs(route, snapshot), snapshot, state);
    };
  } else if (title !== undefined) {
    result.title = title;
  }

  return result;
}

function isPromiseResult(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as PromiseLike<unknown>).then === "function";
}

// Invalid params can't match, so a handler may only refuse or redirect.
function invalidParamsResult(decision: unknown): GuardResult {
  if (decision === false || decision instanceof UrlTree || decision instanceof RedirectCommand) {
    return decision;
  }

  throw new TypeError("onInvalidParams must return false, a UrlTree or a RedirectCommand");
}

// Reads the source copy's snapshotted redirect when routes.generated.ts evaluates.
export function redirect(route: AnyRoute): (snapshot: Parameters<RedirectFunction>[0]) => UrlTree {
  const source = routeMetadata(route);
  const config = source.config.redirect as {
    to: unknown;
    params: Record<string, string>;
    search: { mode: string; values?: Record<string, unknown> };
    fragment: { mode: string; value?: string };
  };
  const destination = destinationRecord(config.to);
  const target = destination.url;
  const rootBranch = target.branch !== undefined && target.branch.anchor.length === 0;

  return (snapshot) => {
    const router = inject(Router);
    const raw = new Map<string, { values: string[]; array: boolean }>();

    for (let index = 0; index < source.segments.length; index += 1) {
      const segment = source.segments[index];

      if (segment.kind === "scalar") {
        raw.set(segment.name, {
          values: snapshot.url.slice(index, index + 1).map((value) => value.path),
          array: false,
        });
      } else if (segment.kind === "catchall") {
        raw.set(segment.name, {
          values: snapshot.url.slice(index).map((value) => value.path),
          array: true,
        });
      }
    }

    const jobs: Job[] = [];

    // Only mapped source params are parsed, each cardinality checked before any parser runs.
    for (const key of new Set(Object.values(config.params))) {
      const input = raw.get(key);
      const raws = input?.values ?? [];
      const array = input?.array ?? false;

      validateRaw(key, raws, array);
      jobs.push({ key, raws, array, codec: source.params[key] });
    }

    // A failure fails the navigation: a redirect record has no matching guard to fall through.
    const logical = runPathJobs(jobs);
    const params: Record<string, unknown> = Object.create(null);

    for (const [key, sourceKey] of Object.entries(config.params)) {
      params[key] = logical[sourceKey];
    }

    const path = createUrlForPath(destination, params);
    const replacement: Record<string, string | string[]> = Object.create(null);

    if (config.search.mode === "replace") {
      const values = config.search.values!;

      for (const key of Object.keys(target.search).sort()) {
        if (!Object.hasOwn(values, key) || values[key] === undefined) {
          continue;
        }

        const codec = target.search[key];

        if (!isArrayCodec(codec)) {
          replacement[key] = stringifySearch(codec, values[key], key);

          continue;
        }

        const raws: string[] = [];

        for (const value of values[key] as readonly unknown[]) {
          raws.push(stringifySearch(codec, value, key));
        }

        // Angular writes nothing for an empty array; leave the key out to match createUrl.
        if (raws.length > 0) {
          replacement[key] = raws;
        }
      }
    }

    // No native conversion before source codecs and destination stringification succeed.
    let tree = router.parseUrl(path);

    if (rootBranch) {
      tree = withEmptyPrimary(tree, router.config);
    }

    if (config.search.mode === "preserve") {
      tree.queryParams = { ...snapshot.queryParams };
    } else if (config.search.mode === "replace") {
      tree.queryParams = replacement;
    }

    if (config.fragment.mode === "preserve") {
      tree.fragment = snapshot.fragment;
    } else if (config.fragment.mode === "replace") {
      tree.fragment = config.fragment.value!;
    }

    return tree;
  };
}

/**
 * A fresh URL's recognition first splits the root, giving each empty-path route that can
 * match beside a named outlet an empty group of its own; Angular re-matches an absolute
 * redirect's tree as returned, without that split. So a redirect into a root-level branch
 * returns the empty primary group itself, when the root config has a route that the split
 * would give one (an empty path that matches by prefix), and renders what loading its URL does.
 */
function withEmptyPrimary(tree: UrlTree, config: Routes): UrlTree {
  let eligible = false;

  for (const route of config) {
    if (
      route.path === "" &&
      route.pathMatch !== "full" &&
      (route.outlet || PRIMARY_OUTLET) === PRIMARY_OUTLET
    ) {
      eligible = true;

      break;
    }
  }

  if (!eligible) {
    return tree;
  }

  const root = new UrlSegmentGroup([], {
    [PRIMARY_OUTLET]: new UrlSegmentGroup([], {}),
    ...tree.root.children,
  });

  return new UrlTree(root, tree.queryParams, tree.fragment);
}

/**
 * The redirect of a source with a parent: it loads the source copy on first use, then
 * redirects as {@link redirect} does. A failed load or parse fails the navigation.
 */
export function lazyRedirect(load: () => Promise<{ route: AnyRoute }>): RedirectFunction {
  return async (snapshot) => {
    // Angular calls a redirect function in an injection context; keep it across the await.
    const injector = inject(EnvironmentInjector);
    const module = await load();

    return runInInjectionContext(injector, () => redirect(module.route)(snapshot));
  };
}

function stringifySearch(
  codec: { stringify(value: unknown): unknown },
  value: unknown,
  key: string,
): string {
  const raw = codec.stringify(value);

  if (typeof raw !== "string") {
    throw new TypeError(`Redirect search codec must stringify to a string: ${key}`);
  }

  return raw;
}

// A redirect into a named outlet replaces the whole URL with that destination's own URL.
function createUrlForPath(destination: DestinationRecord, params: Record<string, unknown>): string {
  const metadata = destination.url;

  function encode(raw: string): string {
    if (raw === "" || raw === "." || raw === "..") {
      throw new TypeError("Invalid redirect path value");
    }

    return encodeURIComponent(raw).replace(/\(/g, "%28").replace(/\)/g, "%29");
  }

  function serialize(segments: readonly Segment[]): string[] {
    const parts: string[] = [];

    for (const segment of segments) {
      if (segment.kind === "static") {
        parts.push(encode(segment.text));
      } else if (segment.kind === "scalar") {
        const raw = metadata.params[segment.name].stringify(params[segment.name]);

        if (typeof raw !== "string") {
          throw new TypeError("Redirect codec must stringify to a string");
        }

        parts.push(encode(raw));
      } else {
        const values = params[segment.name];

        if (!Array.isArray(values)) {
          throw new TypeError("Redirect catchall requires an array");
        }

        for (const value of values) {
          const raw = metadata.params[segment.name].stringify(value);

          if (typeof raw !== "string") {
            throw new TypeError("Redirect codec must stringify to a string");
          }

          parts.push(encode(raw));
        }
      }
    }

    return parts;
  }

  const anchor = serialize(metadata.branch?.anchor ?? []);

  return branchPath(metadata.branch, anchor, serialize(metadata.segments), destination.id);
}
