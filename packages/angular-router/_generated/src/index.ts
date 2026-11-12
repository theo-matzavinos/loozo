export { callbacks, redirect } from "./callbacks.js";
export { assertIdentity, parseInputs } from "./inputs.js";
export type { RecordBinding, RouteSet } from "./inputs.js";
export { injectGeneratedActiveRoute } from "./active.js";

import { DestroyRef, inject, type Signal } from "@angular/core";
import {
  ActivatedRoute,
  Router,
  type NavigationBehaviorOptions,
  type UrlTree,
} from "@angular/router";
import {
  createUrl,
  routeMetadata,
  type AnyRoute,
  type ParamsOf,
  type SearchOf,
  type UrlValues,
  type PathlessUrlValues,
  type PathUrlValues,
  type SearchFieldOf,
  type FragmentsOf,
  type TitleOf,
} from "@loozo/angular-router/_core";
import { observeRoute, type RouteView } from "./handle.js";
import type { RouteSet } from "./inputs.js";

declare const destinationBrand: unique symbol;

/**
 * An inert nominal reference exported as `destination` by a route-local facade.
 *
 * @remarks
 * Pass the exported object as `to` in a handle's link/navigate record; no injection
 * context or target activation is needed. It selects its exact declaration,
 * not a canonical pathless winner. Only references from the caller's generated
 * set are accepted. Copies, spreads, fakes and authored routes are not references.
 * Do not construct this type or pass it to the root createUrl function.
 *
 * @typeParam Target - The referenced route's input and fragment schema.
 * @typeParam Set - The generator's nominal route-set identity.
 * @typeParam Id - The exact generated declaration identity.
 */
export declare class Destination<
  Target extends AnyRoute,
  Set = unknown,
  Id extends string = string,
> {
  // Type-only identity, intentionally not read; object spreads must lose this member.
  // oxlint-disable-next-line no-unused-private-class-members
  readonly #nominal: void;
  /** Type-only nominal brand carrying the reference's identity; not populated at runtime. */
  readonly [destinationBrand]: {
    /** Type-only: the referenced route's input and fragment schema. */
    readonly target: Target;
    /** Type-only: the generator's nominal route-set identity. */
    readonly set: Set;
    /** Type-only: the exact generated declaration identity. */
    readonly id: Id;
  };
}

const destinations = new WeakMap<object, { getSet: () => RouteSet; id: string }>();

export function createDestination<Target extends AnyRoute, Set, Id extends string>(
  getSet: () => RouteSet,
  id: Id,
): Destination<Target, Set, Id> {
  const destination = Object.freeze({});

  destinations.set(destination, { getSet, id });

  return destination as Destination<Target, Set, Id>;
}

/** The declaration a genuine destination of this set references. */
export function destinationId(set: RouteSet, destination: unknown): string {
  let identity;

  if (typeof destination === "object" && destination !== null) {
    identity = destinations.get(destination);
  }

  if (!identity || identity.getSet() !== set || !Object.hasOwn(set.records, identity.id)) {
    throw new TypeError("Expected a destination from the same generated set");
  }

  return identity.id;
}

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
type OwnNavigation<
  Target extends AnyRoute,
  Keys extends keyof SearchOf<Target>,
> = keyof ParamsOf<Target> extends never
  ? PathlessOwnNavigation<SearchFieldOf<Target, Keys>, FragmentsOf<Target>>
  : PathOwnNavigation<ParamsOf<Target>, SearchFieldOf<Target, Keys>, FragmentsOf<Target>>;

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
 * destination: omitted for this exact declaration, not its pathless winner; a
 * single known absolute authored literal, never a concrete URL or string union;
 * `..` for the parent route, the nearest ancestor with a shorter path or the
 * root for a top-level route; or a same-set generated destination. Literal and
 * `..` selectors use generated canonical targets. `params`, `search` and
 * `fragment` are the destination's complete explicit values; there is no
 * current-value reuse or implicit query merge. For `navigate`, the record's
 * other keys are Angular's `NavigationBehaviorOptions`, passed to
 * `Router.navigateByUrl` as given; `link` takes none, so set them on RouterLink.
 *
 * @typeParam Target - The bound declaration's schema.
 * @typeParam Absolute - Absolute literal selectors and their target schemas.
 * @typeParam Parent - The `..` target's schema, or never when there is none.
 * @typeParam Set - The generator's nominal route-set identity.
 * @typeParam References - Exact declarations addressable by same-set references.
 *
 * @example
 * ```ts
 * import { injectRoute } from "./route.generated.js";
 * import { destination as report } from "../report/route.generated.js";
 *
 * const route = injectRoute(); // Inside an Angular injection context.
 * const link = route.link({ to: report, params: { reportId: 42 } });
 * // Bind link to Angular RouterLink, or navigate with the same record and behavior options:
 * void route.navigate({ to: report, params: { reportId: 42 }, replaceUrl: true });
 * ```
 */
export interface Handle<
  Target extends AnyRoute,
  Absolute extends Record<string, AnyRoute> = {},
  Parent extends AnyRoute = never,
  Set = unknown,
  References extends Record<string, AnyRoute> = {},
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
   * Creates a native UrlTree for this exact declaration, not its pathless winner, without navigating.
   *
   * @param target - No `to`, and this declaration's explicit params/search and optional own fragment.
   * @returns Router.parseUrl's result, suitable for Angular RouterLink.
   * @throws Synchronous URL validation, encoding or stringifier failures, or a behavior option, before Angular.
   */
  link<Keys extends keyof SearchOf<Target> = never>(target: OwnLink<Target, Keys>): UrlTree;
  /**
   * Creates a UrlTree for a statically admitted absolute authored selector.
   *
   * @param target - `to`, a single known template literal, never a concrete URL, and the selected target's complete explicit values.
   * @returns Router.parseUrl's result without navigating.
   * @throws Synchronously for unknown selectors, invalid URL values or a behavior option.
   */
  link<
    const Selector extends keyof Absolute & string,
    Keys extends keyof SearchOf<NoInfer<Absolute[Selector]>> = never,
  >(
    target: {
      /** A single known absolute authored selector, never a concrete URL. */
      readonly to: Selector & (IsUnion<Selector> extends true ? never : unknown);
    } & UrlValues<NoInfer<Absolute[Selector]>, Keys>,
  ): UrlTree;
  /**
   * Creates a UrlTree for the parent route, when the bound declaration has one.
   *
   * @param target - `to: ".."` and the parent route's complete explicit values.
   * @returns Router.parseUrl's result without navigating.
   * @throws Synchronously for invalid URL values or a behavior option.
   */
  link<Keys extends keyof SearchOf<Parent> = never>(
    target: {
      /** The parent route: the nearest ancestor with a shorter path, or the root. */
      readonly to: [Parent] extends [never] ? never : "..";
    } & UrlValues<Parent, Keys>,
  ): UrlTree;
  /**
   * Creates a UrlTree for a generated reference's own exact declaration.
   *
   * @param target - `to`, a genuine destination exported by a facade in this route set, and the referenced declaration's complete explicit values.
   * @returns Router.parseUrl's result without navigating.
   * @throws Synchronously for foreign/fake references, invalid URL values or a behavior option.
   */
  link<
    const Id extends keyof References & string,
    Keys extends keyof SearchOf<NoInfer<References[Id]>> = never,
  >(
    target: {
      /** A genuine destination exported by a facade in this route set. */
      readonly to: Destination<NoInfer<References[Id]>, Set, Id> &
        (IsUnion<Id> extends true ? never : unknown);
    } & UrlValues<NoInfer<References[Id]>, Keys>,
  ): UrlTree;
  /**
   * Navigates to this exact declaration, not its pathless winner, via Router.navigateByUrl.
   *
   * @param target - No `to`; this declaration's explicit params/search and optional own fragment; and Angular's navigation behavior options.
   * @returns Angular's identical Promise; Angular owns skips, redirects and failures.
   * @throws Synchronous URL validation, encoding or stringifier failures before Angular.
   */
  navigate<Keys extends keyof SearchOf<Target> = never>(
    target: OwnNavigation<Target, Keys>,
  ): Promise<boolean>;
  /**
   * Navigates to a statically admitted absolute authored selector.
   *
   * @param target - `to`, a single known template literal, never a concrete URL; the selected target's complete explicit values; and Angular's navigation behavior options.
   * @returns Angular's identical Router.navigateByUrl Promise.
   * @throws Synchronously for unknown selectors or invalid URL values.
   */
  navigate<
    const Selector extends keyof Absolute & string,
    Keys extends keyof SearchOf<NoInfer<Absolute[Selector]>> = never,
  >(
    target: {
      /** A single known absolute authored selector, never a concrete URL. */
      readonly to: Selector & (IsUnion<Selector> extends true ? never : unknown);
    } & UrlValues<NoInfer<Absolute[Selector]>, Keys> &
      NavigationBehaviorOptions,
  ): Promise<boolean>;
  /**
   * Navigates to the parent route, when the bound declaration has one.
   *
   * @param target - `to: ".."`, the parent route's complete explicit values and Angular's navigation behavior options.
   * @returns Angular's identical Router.navigateByUrl Promise.
   * @throws Synchronously for invalid URL values.
   */
  navigate<Keys extends keyof SearchOf<Parent> = never>(
    target: {
      /** The parent route: the nearest ancestor with a shorter path, or the root. */
      readonly to: [Parent] extends [never] ? never : "..";
    } & UrlValues<Parent, Keys> &
      NavigationBehaviorOptions,
  ): Promise<boolean>;
  /**
   * Navigates to a generated reference's own exact declaration.
   *
   * @param target - `to`, a genuine destination exported by a facade in this route set; the referenced declaration's complete explicit values; and Angular's navigation behavior options.
   * @returns Angular's identical Router.navigateByUrl Promise.
   * @throws Synchronously for foreign/fake references or invalid URL values.
   */
  navigate<
    const Id extends keyof References & string,
    Keys extends keyof SearchOf<NoInfer<References[Id]>> = never,
  >(
    target: {
      /** A genuine destination exported by a facade in this route set. */
      readonly to: Destination<NoInfer<References[Id]>, Set, Id> &
        (IsUnion<Id> extends true ? never : unknown);
    } & UrlValues<NoInfer<References[Id]>, Keys> &
      NavigationBehaviorOptions,
  ): Promise<boolean>;
}

export function nativeOptions(definition: AnyRoute): Record<string, unknown> {
  const config = routeMetadata(definition).config;
  const options: Record<string, unknown> = {};

  for (const key of ["providers", "data", "canDeactivate", "runGuardsAndResolvers"]) {
    if (Object.hasOwn(config, key)) {
      options[key] = config[key];
    }
  }

  return options;
}

export function injectGeneratedRoute<
  Target extends AnyRoute,
  Absolute extends Record<string, AnyRoute>,
  Parent extends AnyRoute,
  Set,
  References extends Record<string, AnyRoute>,
>(set: RouteSet, id: string): Handle<Target, Absolute, Parent, Set, References> {
  const router = inject(Router);
  const destroy = inject(DestroyRef);
  const view = observeRoute(set, id, inject(ActivatedRoute), router, (release) => {
    destroy.onDestroy(release);
  });

  return createHandle(set, id, router, view);
}

/** A declaration's handle over the signals of one activated record. */
export function createHandle<
  Target extends AnyRoute,
  Absolute extends Record<string, AnyRoute>,
  Parent extends AnyRoute,
  Set,
  References extends Record<string, AnyRoute>,
>(
  set: RouteSet,
  id: string,
  router: Router,
  view: RouteView,
): Handle<Target, Absolute, Parent, Set, References> {
  // Splits the one target record into its destination, URL values and behavior options.
  function resolve(args: readonly unknown[]): { url: string; options: Record<string, unknown> } {
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

    for (const [key, value] of Object.entries(record)) {
      if (key === "to") {
        to = value;
      } else if (key === "params" || key === "search" || key === "fragment") {
        values[key] = value;
      } else {
        rest.push([key, value]);
      }
    }

    // fromEntries defines own properties, so an own `__proto__` key stays a key, not a prototype.
    const options: Record<string, unknown> = Object.fromEntries(rest);

    let target = id;

    if (typeof to === "string") {
      if (Object.hasOwn(set.absolute, to)) {
        target = set.absolute[to];
      } else if (to === ".." && Object.hasOwn(set.parents, id)) {
        target = set.parents[id];
      } else {
        throw new TypeError(`Unknown generated selector: ${to}`);
      }
    } else if (to !== undefined) {
      target = destinationId(set, to);
    }

    return {
      url: createUrl(set.destinations[target](), values as unknown as UrlValues<AnyRoute>),
      options,
    };
  }

  return {
    params: view.params as Signal<Readonly<ParamsOf<Target>>>,
    search: view.search as Signal<Readonly<SearchOf<Target>>>,
    data: view.data as Signal<DataOf<Target>>,
    title: view.title as Signal<TitleOf<Target>>,
    link: ((...args: unknown[]) => {
      const { url, options } = resolve(args);
      const behavior = Object.keys(options);

      if (behavior.length > 0) {
        throw new TypeError(
          `link takes no navigation behavior options (${behavior.join(", ")}); set them on RouterLink`,
        );
      }

      return router.parseUrl(url);
    }) as Handle<Target, Absolute, Parent, Set, References>["link"],
    navigate: ((...args: unknown[]) => {
      const { url, options } = resolve(args);

      return router.navigateByUrl(url, options);
    }) as Handle<Target, Absolute, Parent, Set, References>["navigate"],
  };
}
