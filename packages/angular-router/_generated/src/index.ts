export { callbacks, redirect } from "./callbacks.js";
export { assertIdentity, parseInputs } from "./inputs.js";
export type { RecordBinding, RouteSet } from "./inputs.js";

import { inject, type Resource } from "@angular/core";
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

export declare class Destination<
  Target extends AnyRoute,
  Set = unknown,
  Id extends string = string,
> {
  // Type-only identity, intentionally not read; object spreads must lose this member.
  // oxlint-disable-next-line no-unused-private-class-members
  readonly #nominal: void;
  readonly [destinationBrand]: { readonly target: Target; readonly set: Set; readonly id: Id };
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

export interface Handle<
  Target extends AnyRoute,
  Selected extends Record<string, AnyRoute> = {},
  Set = unknown,
  References extends Record<string, AnyRoute> = {},
> {
  readonly params: Resource<Readonly<ParamsOf<Target>> | undefined>;
  readonly search: Resource<Readonly<SearchOf<Target>> | undefined>;
  readonly data: Resource<DataOf<Target> | undefined>;
  link<Keys extends keyof SearchOf<Target> = never>(values: UrlValues<Target, Keys>): UrlTree;
  link<Keys extends keyof SearchOf<Target> = never>(
    selector: ".",
    values: UrlValues<Target, Keys>,
  ): UrlTree;
  link<
    const Selector extends keyof Selected & string,
    Keys extends keyof SearchOf<NoInfer<Selected[Selector]>> = never,
  >(
    selector: Selector & (IsUnion<Selector> extends true ? never : unknown),
    values: UrlValues<NoInfer<Selected[Selector]>, Keys>,
  ): UrlTree;
  link<
    const Id extends keyof References & string,
    Keys extends keyof SearchOf<NoInfer<References[Id]>> = never,
  >(
    selector: Destination<NoInfer<References[Id]>, Set, Id> &
      (IsUnion<Id> extends true ? never : unknown),
    values: UrlValues<NoInfer<References[Id]>, Keys>,
  ): UrlTree;
  navigate<Keys extends keyof SearchOf<Target> = never>(
    values: UrlValues<Target, Keys>,
  ): Promise<boolean>;
  navigate<Keys extends keyof SearchOf<Target> = never>(
    selector: ".",
    values: UrlValues<Target, Keys>,
  ): Promise<boolean>;
  navigate<
    const Selector extends keyof Selected & string,
    Keys extends keyof SearchOf<NoInfer<Selected[Selector]>> = never,
  >(
    selector: Selector & (IsUnion<Selector> extends true ? never : unknown),
    values: UrlValues<NoInfer<Selected[Selector]>, Keys>,
  ): Promise<boolean>;
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

  for (const key of ["providers", "title", "data", "canDeactivate", "runGuardsAndResolvers"]) {
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
    params: view.params,
    search: view.search,
    data: view.data as Resource<DataOf<Target> | undefined>,
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
