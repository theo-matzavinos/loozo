import { Injector, inject, runInInjectionContext } from "@angular/core";
import {
  Router,
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
import { Observable, from, isObservable, type ObservableInput } from "rxjs";
import { routeMetadata, codecPresence, type AnyRoute } from "@loozo/angular-router/_core";
import {
  assertIdentity,
  hasIdentity,
  parseInputs,
  matchingInputs,
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
): Pick<Route, "canActivate" | "canActivateChild" | "canMatch" | "resolve"> {
  const config = routeMetadata(set.records[id].definition()).config;
  const result: Pick<Route, "canActivate" | "canActivateChild" | "canMatch" | "resolve"> = {};
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

  if (matching) {
    result.canMatch = matching.map(
      (callback): CanMatchFn =>
        (route, segments, snapshot) => {
          assertIdentity(snapshot, id);

          return bridge<GuardResult>(
            () => matchingInputs(set, id, snapshot),
            (inputs) => callback(inputs, route, segments, snapshot),
          );
        },
    );
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

  return result;
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

        if (raws.length === 0 && codecPresence(codec) === "optional") {
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
