export { callbacks, redirect } from "./callbacks.js";
export { assertIdentity, parseInputs } from "./inputs.js";
export type { RecordBinding, RouteSet } from "./inputs.js";

import { inject, type Signal } from "@angular/core";
import { Router, type UrlTree } from "@angular/router";
import {
  createUrl,
  routeMetadata,
  type AnyRoute,
  type ParamsOf,
  type SearchOf,
  type UrlValues,
} from "@loozo/angular-router/_core";
import { observeRoute } from "./handle.js";
import type { RouteSet } from "./inputs.js";

declare const destinationBrand: unique symbol;

/**
 * An inert nominal reference exported as `destination` by a route-local facade.
 *
 * @remarks
 * Use the exported object with a handle's link/navigate methods; no injection
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

type DataOf<Target> = Target extends { readonly __data?: infer Data } ? Readonly<Data> : never;
type IsUnion<Value, Whole = Value> = Value extends unknown
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

/**
 * The noncallable typed handle returned by a colocated `injectRoute()` facade.
 *
 * @remarks
 * Obtain it in an Angular injection context for the exact generated activated
 * record. Params, search and data are readonly Angular Signals of the route's
 * committed snapshot, with values from the first read. Data contains only local
 * resolver results, not static/ancestor data or title.
 *
 * While a navigation is pending, the signals keep the current snapshot's values;
 * when a navigation commits a new snapshot for this route, all three change
 * together. Cancellation, failure or a same-URL skip leaves them unchanged. For
 * pending-navigation UI, read Angular's `Router.currentNavigation()`. There is no
 * resolved-data cache. Reading params or search throws only when a path codec
 * rejects a value it accepted while matching, a programming error.
 *
 * Selectors are single known authored literals, not concrete URLs or string
 * unions. `.` is exact-current; other absolute/relative selections use generated
 * canonical targets. Relative climbs count URL-template segments, not parent
 * edges. Catchall origins permit exact-current, absolute and reference targets,
 * not depth-dependent relative traversal. Every call supplies all target values;
 * there is no current-value reuse, extras argument or implicit query merge.
 *
 * @typeParam Target - The bound declaration's schema.
 * @typeParam Selected - Statically admitted literal selectors and target schemas.
 * @typeParam Set - The generator's nominal route-set identity.
 * @typeParam References - Exact declarations addressable by same-set references.
 *
 * @example
 * ```ts
 * import { injectRoute } from "./route.generated.js";
 * import { destination as report } from "../report/route.generated.js";
 *
 * const route = injectRoute(); // Inside an Angular injection context.
 * const link = route.link(report, { params: { reportId: 42 } });
 * // Bind link to Angular RouterLink, or call route.navigate with the same values.
 * ```
 */
export interface Handle<
  Target extends AnyRoute,
  Selected extends Record<string, AnyRoute> = {},
  Set = unknown,
  References extends Record<string, AnyRoute> = {},
> {
  /** Effective positional params of the committed snapshot; kept while a navigation is pending. */
  readonly params: Signal<Readonly<ParamsOf<Target>>>;
  /** Effective declared search, from the same snapshot as params; absent keys have no value or fallback. */
  readonly search: Signal<Readonly<SearchOf<Target>>>;
  /** Own native resolver results only, from the same snapshot as params. */
  readonly data: Signal<DataOf<Target>>;
  /**
   * Creates a native UrlTree for this exact declaration without navigating.
   *
   * @param values - Explicit effective params/search and optional own fragment.
   * @returns Router.parseUrl's result, suitable for Angular RouterLink.
   * @throws Synchronous URL validation, encoding or stringifier failures before Angular.
   */
  link<Keys extends keyof SearchOf<Target> = never>(values: UrlValues<Target, Keys>): UrlTree;
  /**
   * Creates a UrlTree for the exact bound declaration, not its pathless winner.
   *
   * @param selector - The exact-current literal `.`.
   * @param values - Explicit values for this declaration, with no current-input reuse.
   * @returns Router.parseUrl's result without navigating.
   * @throws Synchronous URL validation, encoding or stringifier failures before Angular.
   */
  link<Keys extends keyof SearchOf<Target> = never>(
    selector: ".",
    values: UrlValues<Target, Keys>,
  ): UrlTree;
  /**
   * Creates a UrlTree for a statically admitted absolute/relative authored selector.
   *
   * @param selector - A single known template literal, never a concrete URL.
   * @param values - The selected target's complete explicit values.
   * @returns Router.parseUrl's result without navigating.
   * @throws Synchronously for unknown selectors or invalid URL values.
   */
  link<
    const Selector extends keyof Selected & string,
    Keys extends keyof SearchOf<NoInfer<Selected[Selector]>> = never,
  >(
    selector: Selector & (IsUnion<Selector> extends true ? never : unknown),
    values: UrlValues<NoInfer<Selected[Selector]>, Keys>,
  ): UrlTree;
  /**
   * Creates a UrlTree for a generated reference's own exact declaration.
   *
   * @param selector - A genuine destination exported by a facade in this route set.
   * @param values - The referenced declaration's complete explicit values.
   * @returns Router.parseUrl's result without navigating.
   * @throws Synchronously for foreign/fake references or invalid URL values.
   */
  link<
    const Id extends keyof References & string,
    Keys extends keyof SearchOf<NoInfer<References[Id]>> = never,
  >(
    selector: Destination<NoInfer<References[Id]>, Set, Id> &
      (IsUnion<Id> extends true ? never : unknown),
    values: UrlValues<NoInfer<References[Id]>, Keys>,
  ): UrlTree;
  /**
   * Navigates to this exact declaration via Router.navigateByUrl.
   *
   * @param values - Explicit effective params/search and optional own fragment.
   * @returns Angular's identical Promise; Angular owns skips, redirects and failures.
   * @throws Synchronous URL validation, encoding or stringifier failures before Angular.
   */
  navigate<Keys extends keyof SearchOf<Target> = never>(
    values: UrlValues<Target, Keys>,
  ): Promise<boolean>;
  /**
   * Navigates to the exact bound declaration, not its pathless winner.
   *
   * @param selector - The exact-current literal `.`.
   * @param values - Explicit values for this declaration, with no current-input reuse.
   * @returns Angular's identical Router.navigateByUrl Promise.
   * @throws Synchronous URL validation, encoding or stringifier failures before Angular.
   */
  navigate<Keys extends keyof SearchOf<Target> = never>(
    selector: ".",
    values: UrlValues<Target, Keys>,
  ): Promise<boolean>;
  /**
   * Navigates to a statically admitted absolute/relative authored selector.
   *
   * @param selector - A single known template literal, never a concrete URL.
   * @param values - The selected target's complete explicit values.
   * @returns Angular's identical Router.navigateByUrl Promise.
   * @throws Synchronously for unknown selectors or invalid URL values.
   */
  navigate<
    const Selector extends keyof Selected & string,
    Keys extends keyof SearchOf<NoInfer<Selected[Selector]>> = never,
  >(
    selector: Selector & (IsUnion<Selector> extends true ? never : unknown),
    values: UrlValues<NoInfer<Selected[Selector]>, Keys>,
  ): Promise<boolean>;
  /**
   * Navigates to a generated reference's own exact declaration.
   *
   * @param selector - A genuine destination exported by a facade in this route set.
   * @param values - The referenced declaration's complete explicit values.
   * @returns Angular's identical Router.navigateByUrl Promise.
   * @throws Synchronously for foreign/fake references or invalid URL values.
   */
  navigate<
    const Id extends keyof References & string,
    Keys extends keyof SearchOf<NoInfer<References[Id]>> = never,
  >(
    selector: Destination<NoInfer<References[Id]>, Set, Id> &
      (IsUnion<Id> extends true ? never : unknown),
    values: UrlValues<NoInfer<References[Id]>, Keys>,
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
  Selected extends Record<string, AnyRoute>,
  Set,
  References extends Record<string, AnyRoute>,
>(set: RouteSet, id: string): Handle<Target, Selected, Set, References> {
  const router = inject(Router);
  const view = observeRoute(set, id);

  function url(args: readonly unknown[]): string {
    if (args.length !== 1 && args.length !== 2) {
      throw new TypeError("Expected values or a selected destination and values");
    }

    let target = id;
    let values = args[0];

    if (args.length === 2) {
      const selector = args[0];

      values = args[1];

      if (typeof selector === "string") {
        if (selector !== ".") {
          if (Object.hasOwn(set.absolute, selector)) {
            target = set.absolute[selector];
          } else if (Object.hasOwn(set.relative[id], selector)) {
            target = set.relative[id][selector];
          } else {
            throw new TypeError(`Unknown generated selector: ${selector}`);
          }
        }
      } else {
        if (typeof selector !== "object" || selector === null) {
          throw new TypeError("Expected a literal selector or genuine generated destination");
        }

        const destination = destinations.get(selector);

        if (
          !destination ||
          destination.getSet() !== set ||
          !Object.hasOwn(set.records, destination.id)
        ) {
          throw new TypeError("Expected a destination from the same generated set");
        }

        target = destination.id;
      }
    }

    return createUrl(set.destinations[target](), values as UrlValues<AnyRoute>);
  }

  return {
    params: view.params as Signal<Readonly<ParamsOf<Target>>>,
    search: view.search as Signal<Readonly<SearchOf<Target>>>,
    data: view.data as Signal<DataOf<Target>>,
    link: ((...args: unknown[]) => router.parseUrl(url(args))) as Handle<
      Target,
      Selected,
      Set,
      References
    >["link"],
    navigate: ((...args: unknown[]) => router.navigateByUrl(url(args))) as Handle<
      Target,
      Selected,
      Set,
      References
    >["navigate"],
  };
}
