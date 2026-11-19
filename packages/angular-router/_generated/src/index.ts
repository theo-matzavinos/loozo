export { callbacks, lazyRedirect, redirect } from "./callbacks.js";
export { owned } from "./owned.js";
export { effectivePath, nativePath } from "./native-path.js";
export { injectGeneratedActiveRoute } from "./active.js";
export { provideActiveRouteHydration } from "./hydration.js";
export { injectNavigationBase } from "./base.js";
export { compose } from "./compose.js";
export type { Composition } from "./compose.js";
export type { ActiveHandle, ActiveRoute, RouteTypeEntry, RouteTypeMap } from "./active.js";
export { extension, record, recordExtension, recordFacts, resolverKeys } from "./record.js";
export { authoredRouteOf, defineDestination, routeOf } from "@loozo/angular-router/_core";
export type { Destination, RouteSchema } from "@loozo/angular-router/_core";

import { DestroyRef, Injector, inject, type Signal } from "@angular/core";
import {
  ActivatedRoute,
  Router,
  type NavigationBehaviorOptions,
  type UrlTree,
} from "@angular/router";
import {
  createUrl,
  destinationRecord,
  routeMetadata,
  type AnyRoute,
  type Branch,
  type OutletOf,
  type ContributionRecord,
  type ExtensionSpec,
  type RuntimeExtension,
  type Destination,
  type ParamsOf,
  type SearchOf,
  type UrlValues,
  type PathlessUrlValues,
  type PathUrlValues,
  type SearchFieldOf,
  type FragmentsOf,
  type TitleOf,
} from "@loozo/angular-router/_core";
import { injectNavigationBase } from "./base.js";
import { compose, type Composition } from "./compose.js";
import { observeRecord, type RouteView } from "./handle.js";
import { destinationOf } from "./inputs.js";

type DataOf<Target> = Target extends { readonly __data?: infer Data } ? Readonly<Data> : never;
type IsUnion<Value, Whole = Value> = Value extends unknown
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

// Own-route records are single object types, not intersections, so a bare
// string cannot match through String's own `search` method (see UrlValues).
interface PathlessOwnLink<Search, Fragment> extends PathlessUrlValues<Search, Fragment> {
  /** Omitted: this exact declaration, not its pathless winner. */
  readonly to?: undefined;
}
interface PathOwnLink<Params, Search, Fragment> extends PathUrlValues<Params, Search, Fragment> {
  /** Omitted: this exact declaration, not its pathless winner. */
  readonly to?: undefined;
}
interface PathlessOwnNavigation<Search, Fragment>
  extends PathlessOwnLink<Search, Fragment>, NavigationBehaviorOptions {}
interface PathOwnNavigation<Params, Search, Fragment>
  extends PathOwnLink<Params, Search, Fragment>, NavigationBehaviorOptions {}
type OwnLink<
  Target extends AnyRoute,
  Keys extends keyof SearchOf<Target>,
> = keyof ParamsOf<Target> extends never
  ? PathlessOwnLink<SearchFieldOf<Target, Keys>, FragmentsOf<Target>>
  : PathOwnLink<ParamsOf<Target>, SearchFieldOf<Target, Keys>, FragmentsOf<Target>>;
// The `..` target's URL schema, unwrapped from its destination. A conditional infer, not
// `TargetOf<P> & AnyRoute`: AnyRoute's `any` members would widen the inferred params.
type Up<Parent> = Parent extends Destination<infer Target, any> ? Target : never;
type OwnNavigation<
  Target extends AnyRoute,
  Keys extends keyof SearchOf<Target>,
> = keyof ParamsOf<Target> extends never
  ? PathlessOwnNavigation<SearchFieldOf<Target, Keys>, FragmentsOf<Target>>
  : PathOwnNavigation<ParamsOf<Target>, SearchFieldOf<Target, Keys>, FragmentsOf<Target>>;
interface CloseValues {
  /** Closes the whole named-outlet branch: no URL values. */
  readonly close: true;
  /** Forbidden: a close takes no URL values. */
  readonly params?: never;
  /** Forbidden: a close takes no URL values. */
  readonly search?: never;
  /** Forbidden: a close takes no URL values. */
  readonly fragment?: never;
}
interface OwnClose extends CloseValues {
  /** Omitted: the branch this declaration renders in. */
  readonly to?: undefined;
}
interface OwnCloseNavigation extends OwnClose, NavigationBehaviorOptions {}
// Only a declaration in a named outlet closes its own branch.
type OwnCloseOf<Target, Close> = OutletOf<Target> extends string ? Close : never;
type BranchDestination<To extends AnyRoute, Id extends string> = Destination<To, Id> &
  (IsUnion<Id> extends true ? never : unknown) &
  (OutletOf<To> extends string ? unknown : never);

/**
 * Link and navigate to a destination imported from any `destination.generated.ts`, or close
 * a destination's named-outlet branch: what every route handle offers, the active route
 * before narrowing too.
 */
export interface DestinationNavigation {
  /**
   * Creates a UrlTree for a destination, composed with the current URL, without navigating.
   *
   * @param target - `to`, a genuine destination imported from a `destination.generated.ts`, and the referenced declaration's complete explicit values: params only in a named outlet.
   * @returns A UrlTree for Angular RouterLink.
   * @throws Synchronously for fake destinations, invalid URL values or a behavior option.
   */
  link<
    To extends AnyRoute,
    const Id extends string,
    Keys extends keyof SearchOf<NoInfer<To>> = never,
  >(
    target: {
      /** A genuine destination imported from a `destination.generated.ts`. */
      readonly to: Destination<To, Id> & (IsUnion<Id> extends true ? never : unknown);
    } & UrlValues<NoInfer<To>, Keys>,
  ): UrlTree;
  /**
   * Creates a UrlTree of the current URL without the destination's named outlet at its anchor,
   * whatever that outlet shows.
   *
   * @param target - `to`, a genuine destination in a named outlet, and `close: true`; no URL values.
   * @returns A UrlTree equal to the current URL when the outlet isn't open there.
   * @throws Synchronously for fake or primary destinations, URL values or a behavior option.
   */
  link<To extends AnyRoute, const Id extends string>(
    target: CloseValues & {
      /** A genuine destination in a named outlet. */
      readonly to: BranchDestination<To, Id>;
    },
  ): UrlTree;
  /**
   * Navigates to a destination, composed with the current URL.
   *
   * @param target - `to`, a genuine destination imported from a `destination.generated.ts`; the referenced declaration's complete explicit values (params only in a named outlet); and Angular's navigation behavior options.
   * @returns Angular's identical Router.navigateByUrl Promise.
   * @throws Synchronously for fake destinations or invalid URL values.
   */
  navigate<
    To extends AnyRoute,
    const Id extends string,
    Keys extends keyof SearchOf<NoInfer<To>> = never,
  >(
    target: {
      /** A genuine destination imported from a `destination.generated.ts`. */
      readonly to: Destination<To, Id> & (IsUnion<Id> extends true ? never : unknown);
    } & UrlValues<NoInfer<To>, Keys> &
      NavigationBehaviorOptions,
  ): Promise<boolean>;
  /**
   * Closes the destination's named outlet at its anchor, whatever it shows.
   *
   * @param target - `to`, a genuine destination in a named outlet, `close: true` and Angular's navigation behavior options; no URL values.
   * @returns Angular's identical Router.navigateByUrl Promise. With the outlet not open there the
   * URL is unchanged, and Angular's `onSameUrlNavigation` decides: `false` under its default "ignore".
   * @throws Synchronously for fake or primary destinations or URL values.
   */
  navigate<To extends AnyRoute, const Id extends string>(
    target: CloseValues & {
      /** A genuine destination in a named outlet. */
      readonly to: BranchDestination<To, Id>;
    } & NavigationBehaviorOptions,
  ): Promise<boolean>;
}

/**
 * The noncallable typed handle returned by a colocated `injectRoute()` facade.
 *
 * @remarks
 * Obtain it in an Angular injection context for the exact generated activated
 * record. Params, search and data are readonly Angular Signals of the route's
 * committed snapshot, with values from the first read. Data holds the resolver
 * results of the route's whole chain, ancestors first, a nearer key hiding an
 * ancestor's key of the same name; native static data and the title stay out.
 * Title is the resolved title of the nearest route in the chain that declares
 * one: `string` when the route or an ancestor declares it, else `undefined`.
 *
 * While a navigation is pending, the signals keep the current snapshot's values;
 * when a navigation commits a new snapshot for this route, they change
 * together. Cancellation, failure or a same-URL skip leaves them unchanged. For
 * pending-navigation UI, read Angular's `Router.currentNavigation()`. There is no
 * resolved-data cache. Reading params or search throws only when a path codec
 * rejects a value it accepted while matching, a programming error.
 *
 * `link` and `navigate` take one target record. Its `to` selects the
 * destination: omitted for this exact declaration, not its pathless winner;
 * `..` for the parent route, the nearest ancestor with a shorter path or the
 * root for a top-level route (inside a named outlet, the nearest such ancestor
 * in the branch; a branch root has none), as generation resolved it; or a genuine
 * destination imported from any `destination.generated.ts`, never a string path.
 * `params`, `search` and `fragment` are the destination's complete explicit
 * values; a destination in a named outlet takes params only, and its query and
 * fragment stay the page's. `close: true`, with no values, closes the named-outlet
 * branch of this declaration or of the `to` destination.
 *
 * The URL is composed with the current one: navigating the primary path keeps each
 * open named-outlet branch whose anchor is still on the new path, and opening or
 * replacing a branch keeps the rest of the URL. Call `link` where it renders (a
 * template or a `computed`), so it follows commits; a link stored once keeps the
 * branches open when it ran. `createUrl` builds the exact URL instead. For
 * `navigate`, the record's other keys are Angular's `NavigationBehaviorOptions`,
 * passed to `Router.navigateByUrl` as given; `link` takes none, so set them on
 * RouterLink.
 *
 * @typeParam Target - The bound declaration's schema.
 * @typeParam Parent - The `..` target's destination, or never when there is none.
 *
 * @example
 * ```ts
 * import { injectRoute } from "./route.generated.js";
 * import { destination as report } from "../report/destination.generated.js";
 *
 * const route = injectRoute(); // Inside an Angular injection context.
 * readonly link = computed(() => route.link({ to: report, params: { reportId: 42 } }));
 * // Bind link() to Angular RouterLink, or navigate with the same record and behavior options:
 * void route.navigate({ to: report, params: { reportId: 42 }, replaceUrl: true });
 * ```
 */
export type Handle<
  Target extends AnyRoute,
  Parent extends Destination<AnyRoute> = never,
> = RouteHandle<Target, Parent> & DestinationNavigation;

/** A handle's signals and its own, `..` and own-close forms. */
export interface RouteHandle<
  Target extends AnyRoute,
  Parent extends Destination<AnyRoute> = never,
> {
  /** Effective positional params of the committed snapshot; kept while a navigation is pending. */
  readonly params: Signal<Readonly<ParamsOf<Target>>>;
  /** Effective declared search, from the same snapshot as params; absent keys have no value or fallback. */
  readonly search: Signal<Readonly<SearchOf<Target>>>;
  /** Effective resolver results of the route and its ancestors, from the same snapshot as params. */
  readonly data: Signal<DataOf<Target>>;
  /** Resolved title of the nearest route in the chain that declares one, from the same snapshot as params. */
  readonly title: Signal<TitleOf<Target>>;
  /**
   * Creates a UrlTree for this exact declaration, not its pathless winner, composed with the current URL, without navigating.
   *
   * @param target - No `to`, and this declaration's explicit params/search and optional own fragment; params only in a named outlet.
   * @returns A UrlTree for Angular RouterLink.
   * @throws Synchronous URL validation, encoding or stringifier failures, or a behavior option, before Angular.
   */
  link<Keys extends keyof SearchOf<Target> = never>(target: OwnLink<Target, Keys>): UrlTree;
  /**
   * Creates a UrlTree for the parent route, when the bound declaration has one, composed with the current URL.
   *
   * @param target - `to: ".."` and the parent route's complete explicit values.
   * @returns A UrlTree for Angular RouterLink, without navigating.
   * @throws Synchronously for invalid URL values or a behavior option.
   */
  link<Keys extends keyof SearchOf<Up<Parent>> = never>(
    target: {
      /** The parent route: the nearest ancestor with a shorter path, or the root. */
      readonly to: [Parent] extends [never] ? never : "..";
    } & UrlValues<Up<Parent>, Keys>,
  ): UrlTree;
  /**
   * Creates a UrlTree of the current URL without the named-outlet branch this declaration renders in.
   *
   * @param target - `close: true` and no URL values; only in a named outlet.
   * @returns A UrlTree equal to the current URL when the branch isn't open.
   * @throws Synchronously for URL values or a behavior option.
   */
  link(target: OwnCloseOf<Target, OwnClose>): UrlTree;
  /**
   * Navigates to this exact declaration, not its pathless winner, composed with the current URL, via Router.navigateByUrl.
   *
   * @param target - No `to`; this declaration's explicit params/search and optional own fragment (params only in a named outlet); and Angular's navigation behavior options.
   * @returns Angular's identical Promise; Angular owns skips, redirects and failures.
   * @throws Synchronous URL validation, encoding or stringifier failures before Angular.
   */
  navigate<Keys extends keyof SearchOf<Target> = never>(
    target: OwnNavigation<Target, Keys>,
  ): Promise<boolean>;
  /**
   * Navigates to the parent route, when the bound declaration has one, composed with the current URL.
   *
   * @param target - `to: ".."`, the parent route's complete explicit values and Angular's navigation behavior options.
   * @returns Angular's identical Router.navigateByUrl Promise.
   * @throws Synchronously for invalid URL values.
   */
  navigate<Keys extends keyof SearchOf<Up<Parent>> = never>(
    target: {
      /** The parent route: the nearest ancestor with a shorter path, or the root. */
      readonly to: [Parent] extends [never] ? never : "..";
    } & UrlValues<Up<Parent>, Keys> &
      NavigationBehaviorOptions,
  ): Promise<boolean>;
  /**
   * Closes the whole named-outlet branch this declaration renders in.
   *
   * @param target - `close: true`, no URL values, and Angular's navigation behavior options; only in a named outlet.
   * @returns Angular's identical Router.navigateByUrl Promise. With the branch not open the URL is
   * unchanged, and Angular's `onSameUrlNavigation` decides: `false` under its default "ignore".
   * @throws Synchronously for URL values.
   */
  navigate(target: OwnCloseOf<Target, OwnCloseNavigation>): Promise<boolean>;
}

export function nativeOptions(route: AnyRoute): Record<string, unknown> {
  const config = routeMetadata(route).config;
  const options: Record<string, unknown> = {};

  for (const key of ["providers", "data", "canDeactivate", "runGuardsAndResolvers"]) {
    if (Object.hasOwn(config, key)) {
      options[key] = config[key];
    }
  }

  return options;
}

/**
 * The typed handle of a route copy's activated record. `up` is the destination of
 * the copy's `..` target, as generation resolved it; omitted when there is none.
 * `Members` is what generation says the route's extension adds; for a route an
 * extension's factory made, the handle gets them from the extension's `handle`.
 */
export function injectGeneratedRoute<
  Target extends AnyRoute,
  Parent extends Destination<AnyRoute> = never,
  Members extends object = {},
>(route: Target, up?: Parent): Handle<Target, Parent> & Members {
  const router = inject(Router);
  const destroy = inject(DestroyRef);
  const base = injectNavigationBase();
  const own = destinationOf(route);
  const view = observeRecord(own, inject(ActivatedRoute), router, (release) => {
    destroy.onDestroy(release);
  });
  const handle = createDestinationHandle(own, up, router, view, base);
  const slot = routeMetadata(route).extension;

  if (slot?.declared) {
    addMembers(handle, slot.runtime, slot.chain, inject(Injector));
  }

  return handle as Handle<Target, Parent> & Members;
}

/**
 * Defines the extension's members on a handle by their own property descriptors, so a
 * getter runs at its first read, not here.
 */
export function addMembers(
  handle: object,
  runtime: RuntimeExtension<ExtensionSpec>,
  chain: readonly ContributionRecord[],
  injector: Injector,
): void {
  Object.defineProperties(
    handle,
    Object.getOwnPropertyDescriptors(runtime.handle(chain, injector)),
  );
}

/**
 * The handle of the declaration whose destination is `own`, over the signals of one
 * activated record. `up` is the destination of its `..` target, when it has one. `base`
 * returns the URL link and navigate compose with; it injects nothing, so the handle works
 * outside an injection context.
 */
export function createDestinationHandle<
  Target extends AnyRoute,
  Parent extends Destination<AnyRoute>,
>(
  own: Destination<AnyRoute>,
  up: Parent | undefined,
  router: Router,
  view: RouteView,
  base: () => UrlTree,
): Handle<Target, Parent> {
  // Splits the one target record into the destination's URL, or the branch it closes, and
  // behavior options. Validates everything before Angular is called.
  function resolve(args: readonly unknown[]): {
    target: { readonly url: string } | { readonly close: Branch };
    options: Record<string, unknown>;
  } {
    const record = args[0];

    if (
      args.length !== 1 ||
      typeof record !== "object" ||
      record === null ||
      Array.isArray(record)
    ) {
      throw new TypeError("Expected one navigation target record");
    }

    const values: Record<string, unknown> = {};
    const rest: [string, unknown][] = [];
    let to: unknown;
    let close = false;

    for (const [key, value] of Object.entries(record)) {
      if (key === "to") {
        to = value;
      } else if (key === "close") {
        if (value !== true) {
          throw new TypeError("close must be true");
        }

        close = true;
      } else if (key === "params" || key === "search" || key === "fragment") {
        values[key] = value;
      } else {
        rest.push([key, value]);
      }
    }

    // fromEntries defines own properties, so an own `__proto__` key stays a key, not a prototype.
    const options: Record<string, unknown> = Object.fromEntries(rest);

    let target: Destination<AnyRoute> = own;

    if (typeof to === "string") {
      if (to !== ".." || up === undefined) {
        throw new TypeError(`Unknown generated selector: ${to}`);
      }

      target = up;
    } else if (to !== undefined) {
      destinationRecord(to);
      target = to as Destination<AnyRoute>;
    }

    if (!close) {
      return {
        target: { url: createUrl(target, values as unknown as UrlValues<AnyRoute>) },
        options,
      };
    }

    if (Object.keys(values).length > 0) {
      throw new TypeError("close takes no URL values");
    }

    const { id, url } = destinationRecord(target);

    if (!url.branch) {
      throw new TypeError(`close needs a destination in a named outlet: ${id}`);
    }

    return { target: { close: url.branch }, options };
  }

  function composed(target: { readonly url: string } | { readonly close: Branch }): UrlTree {
    let input: Composition;

    if ("close" in target) {
      input = target;
    } else {
      input = { open: router.parseUrl(target.url) };
    }

    return compose(base(), input);
  }

  return {
    params: view.params as Signal<Readonly<ParamsOf<Target>>>,
    search: view.search as Signal<Readonly<SearchOf<Target>>>,
    data: view.data as Signal<DataOf<Target>>,
    title: view.title as Signal<TitleOf<Target>>,
    link: ((...args: unknown[]) => {
      const { target, options } = resolve(args);
      const behavior = Object.keys(options);

      if (behavior.length > 0) {
        throw new TypeError(
          `link takes no navigation behavior options (${behavior.join(", ")}); set them on RouterLink`,
        );
      }

      return composed(target);
    }) as Handle<Target, Parent>["link"],
    navigate: ((...args: unknown[]) => {
      const { target, options } = resolve(args);

      // No same-URL check: Angular's onSameUrlNavigation decides an unchanged URL.
      return router.navigateByUrl(composed(target), options);
    }) as Handle<Target, Parent>["navigate"],
  };
}
