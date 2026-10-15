import { inject } from "@angular/core";
import {
  Router,
  RedirectCommand,
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
} from "@angular/router";
import { from, isObservable, map, type ObservableInput } from "rxjs";
import { routeMetadata, type AnyRoute } from "@loozo/angular-router/_core";
import {
  hasIdentity,
  parseInputs,
  matchingInputs,
  pathInputs,
  runPathJobs,
  validateRaw,
  type Job,
  type RouteSet,
} from "./inputs.js";

// Parsing is synchronous, so every adapter calls its callback in the same call Angular
// made: Angular's injection context is still active and inject() works at entry.
export function callbacks(
  set: RouteSet,
  id: string,
): Pick<Route, "canActivate" | "canActivateChild" | "canMatch" | "resolve" | "title"> {
  const metadata = routeMetadata(set.records[id].definition());
  const config = metadata.config;
  const result: Pick<Route, "canActivate" | "canActivateChild" | "canMatch" | "resolve" | "title"> =
    {};
  const activate = config.canActivate as readonly ((...args: any[]) => any)[] | undefined;

  if (activate) {
    result.canActivate = activate.map(
      (callback): CanActivateFn =>
        (snapshot, state) =>
          callback(parseInputs(set, id, snapshot), snapshot, state),
    );
  }

  const children = config.canActivateChild as readonly ((...args: any[]) => any)[] | undefined;

  if (children) {
    result.canActivateChild = children.map(
      (callback): CanActivateChildFn =>
        (child, state) => {
          let parent: ActivatedRouteSnapshot | undefined;

          // The native ancestry includes child itself; only proper ancestors can declare this guard.
          for (let index = child.pathFromRoot.length - 2; index >= 0; index -= 1) {
            const ancestor = child.pathFromRoot[index];

            if (hasIdentity(ancestor, id)) {
              parent = ancestor;

              break;
            }
          }

          if (!parent) {
            throw new Error(`Generated guard ancestor missing: ${id}`);
          }

          return callback(parseInputs(set, id, parent), child, state);
        },
    );
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

    canMatch.push((route, segments, snapshot) => {
      const path = pathInputs(set, id, snapshot);

      if (!("error" in path)) {
        // Search never decides the match, but Angular runs this guard on every navigation,
        // query-only ones included, so a thenable search parse fails it here.
        matchingInputs(set, id, snapshot);

        return true;
      }

      if (!handler) {
        return false;
      }

      const decision = handler(path.error, route, segments, snapshot);

      if (isObservable(decision) || isPromiseResult(decision)) {
        return from(decision as ObservableInput<unknown>).pipe(map(invalidParamsResult));
      }

      return invalidParamsResult(decision);
    });
  }

  if (matching) {
    for (const callback of matching) {
      canMatch.push((route, segments, snapshot) => {
        const inputs = matchingInputs(set, id, snapshot);

        // Invalid path params: the generated guard ahead of this one decides.
        if (inputs === undefined) {
          return false;
        }

        return callback(inputs, route, segments, snapshot);
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

  if (resolvers) {
    const resolve: Record<PropertyKey, ResolveFn<unknown>> = Object.create(null);

    for (const key of Reflect.ownKeys(resolvers)) {
      resolve[key] = (snapshot, state) =>
        resolvers[key](parseInputs(set, id, snapshot), snapshot, state);
    }

    result.resolve = resolve;
  }

  const title = config.title as
    | string
    | ((inputs: unknown, snapshot: ActivatedRouteSnapshot, state: RouterStateSnapshot) => any)
    | undefined;

  // Angular runs a title callback as a resolver, so it's adapted like one.
  if (typeof title === "function") {
    result.title = (snapshot, state) => title(parseInputs(set, id, snapshot), snapshot, state);
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

export function redirect(definition: () => AnyRoute): RedirectFunction {
  return (snapshot) => {
    const router = inject(Router);
    const source = routeMetadata(definition());
    const config = source.config.redirect as {
      to: AnyRoute;
      params: Record<string, string>;
      search: { mode: string; values?: Record<string, unknown> };
      fragment: { mode: string; value?: string };
    };
    const target = routeMetadata(config.to);
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

    const path = createUrlForPath(config.to, params);
    const replacement: Record<string, string> = Object.create(null);

    if (config.search.mode === "replace") {
      const values = config.search.values!;

      for (const key of Object.keys(target.search).sort()) {
        if (!Object.hasOwn(values, key) || values[key] === undefined) {
          continue;
        }

        const raw = target.search[key].stringify(values[key]);

        if (typeof raw !== "string") {
          throw new TypeError(`Redirect search codec must stringify to a string: ${key}`);
        }

        replacement[key] = raw;
      }
    }

    // No native conversion before source codecs and destination stringification succeed.
    const tree = router.parseUrl(path);

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

function createUrlForPath(definition: AnyRoute, params: Record<string, unknown>): string {
  const metadata = routeMetadata(definition);
  const parts: string[] = [];

  function encode(raw: string): string {
    if (raw === "" || raw === "." || raw === "..") {
      throw new TypeError("Invalid redirect path value");
    }

    return encodeURIComponent(raw).replace(/\(/g, "%28").replace(/\)/g, "%29");
  }

  for (const segment of metadata.segments) {
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

  return `/${parts.join("/")}`;
}
