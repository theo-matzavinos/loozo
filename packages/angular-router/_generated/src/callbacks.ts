import { Injector, inject, runInInjectionContext } from "@angular/core";
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
import { Observable, from, isObservable, map, type ObservableInput } from "rxjs";
import { routeMetadata, codecPresence, type AnyRoute } from "@loozo/angular-router/_core";
import {
  assertIdentity,
  hasIdentity,
  parseInputs,
  matchingInputs,
  pathOperation,
  runJobs,
  validateRaw,
  type Job,
  type RouteSet,
} from "./inputs.js";

function isPromiseResult<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === "function";
}

function bridge<T>(
  inputs: () => Promise<unknown>,
  callback: (inputs: any) => T | ObservableInput<T>,
): Observable<T> {
  const injector = inject(Injector);

  return new Observable((subscriber) => {
    let subscription: { unsubscribe(): void } | undefined;

    inputs().then(
      (value) => {
        if (subscriber.closed) {
          return;
        }

        try {
          const result = runInInjectionContext(injector, () => callback(value));

          if (isObservable(result)) {
            subscription = result.subscribe(subscriber);
          } else if (isPromiseResult<T>(result)) {
            subscription = from(Promise.resolve(result)).subscribe(subscriber);
          } else {
            subscriber.next(result as T);
            subscriber.complete();
          }
        } catch (error) {
          subscriber.error(error);
        }
      },
      (error) => subscriber.error(error),
    );

    return () => subscription?.unsubscribe();
  });
}

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
        (snapshot, state) => {
          assertIdentity(snapshot, id);

          return bridge<GuardResult>(
            () => parseInputs(set, id, snapshot),
            (inputs) => callback(inputs, snapshot, state),
          );
        },
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

          assertIdentity(parent, id);

          return bridge<GuardResult>(
            () => parseInputs(set, id, parent),
            (inputs) => callback(inputs, child, state),
          );
        },
    );
  }

  const matching = config.canMatch as readonly ((...args: any[]) => any)[] | undefined;
  const canMatch: CanMatchFn[] = [];

  // Local path params decide whether this record matches. Angular runs every canMatch
  // guard concurrently and prefers the first non-true result in array order.
  if (metadata.localSegments.some((segment) => segment.kind !== "static")) {
    const handler = config.onInvalidParams as ((...args: any[]) => unknown) | undefined;

    canMatch.push((route, segments, snapshot) => {
      assertIdentity(snapshot, id);

      return bridge<GuardResult>(
        async () => {
          try {
            await pathOperation(set, id, snapshot).promise;
          } catch (error) {
            return error;
          }

          return undefined;
        },
        (error) => {
          if (error === undefined) {
            return true;
          }

          if (!handler) {
            return false;
          }

          const decision = handler(error, route, segments, snapshot);

          if (isObservable(decision) || isPromiseResult(decision)) {
            return from(decision as ObservableInput<unknown>).pipe(map(invalidParamsResult));
          }

          return invalidParamsResult(decision);
        },
      );
    });
  }

  if (matching) {
    for (const callback of matching) {
      canMatch.push((route, segments, snapshot) => {
        assertIdentity(snapshot, id);

        return bridge<GuardResult>(
          () => matchingInputs(set, id, snapshot),
          (inputs) => {
            // Invalid path params: the generated guard ahead of this one decides.
            if (inputs === undefined) {
              return false;
            }

            return callback(inputs, route, segments, snapshot);
          },
        );
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
      resolve[key] = (snapshot, state) => {
        assertIdentity(snapshot, id);

        return bridge(
          () => parseInputs(set, id, snapshot),
          (inputs) => resolvers[key](inputs, snapshot, state),
        );
      };
    }

    result.resolve = resolve;
  }

  const title = config.title as
    | string
    | ((inputs: unknown, snapshot: ActivatedRouteSnapshot, state: RouterStateSnapshot) => any)
    | undefined;

  // Angular runs a title callback as a resolver, so it's adapted like one.
  if (typeof title === "function") {
    result.title = (snapshot, state) => {
      assertIdentity(snapshot, id);

      return bridge<string>(
        () => parseInputs(set, id, snapshot),
        (inputs) => title(inputs, snapshot, state),
      );
    };
  } else if (title !== undefined) {
    result.title = title;
  }

  return result;
}

// Invalid params can't match, so a handler may only refuse or redirect.
function invalidParamsResult(decision: unknown): GuardResult {
  if (decision === false || decision instanceof UrlTree || decision instanceof RedirectCommand) {
    return decision;
  }

  throw new TypeError("onInvalidParams must return false, a UrlTree or a RedirectCommand");
}

export function redirect(definition: () => AnyRoute): RedirectFunction {
  return async (snapshot) => {
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

    for (const key of new Set(Object.values(config.params))) {
      const input = raw.get(key);
      const raws = input?.values ?? [];
      const array = input?.array ?? false;

      validateRaw("path", key, raws, array);
      jobs.push({ source: "path", key, raws, array, codec: source.params[key] });
    }

    if (config.search.mode === "preserve") {
      for (const key of Object.keys(target.search)) {
        const codec = target.search[key];
        const raws = snapshot.queryParamMap.getAll(key);

        // An optional destination key recovers any incoming value, so it has nothing to check.
        if (codecPresence(codec) === "optional") {
          continue;
        }

        validateRaw("search", key, raws, false);
        jobs.push({ source: "search", key, raws, array: false, codec });
      }
    }

    // Every demand is prechecked. Async wrappers observe even synchronous preserved-search
    // throws after earlier source jobs launch, without detaching those later rejections.
    const logical = await runJobs(jobs);
    const params: Record<string, unknown> = Object.create(null);

    for (const [key, sourceKey] of Object.entries(config.params)) {
      params[key] = logical.params[sourceKey];
    }

    const path = createUrlForPath(config.to, params);
    const replacement: Record<string, string> = Object.create(null);

    if (config.search.mode === "replace") {
      const values = config.search.values!;

      for (const key of Object.keys(target.search).sort()) {
        const codec = target.search[key];

        if (
          codecPresence(codec) === "optional" &&
          (!Object.hasOwn(values, key) || values[key] === undefined)
        ) {
          continue;
        }

        const raw = codec.stringify(values[key]);

        if (typeof raw !== "string") {
          throw new TypeError(`Redirect search codec must stringify to a string: ${key}`);
        }

        replacement[key] = raw;
      }
    }

    // No native conversion before demanded codecs and destination stringification succeed.
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
