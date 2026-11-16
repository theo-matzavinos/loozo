import { computed, signal, type Signal } from "@angular/core";
import type { ActivatedRoute, ActivatedRouteSnapshot, Router } from "@angular/router";
import type { AnyRoute, Destination } from "@loozo/angular-router/_core";
import { merge } from "rxjs";
import { assertIdentity, destinationOwners, parseInputs } from "./inputs.js";
import { resolverKeys } from "./record.js";

export interface RouteView {
  readonly params: Signal<Readonly<Record<string, unknown>>>;
  readonly search: Signal<Readonly<Record<string, unknown>>>;
  readonly data: Signal<Readonly<Record<PropertyKey, unknown>>>;
  readonly title: Signal<string | undefined>;
}

/**
 * Signals of the committed snapshot of the generated record that carries `destination`.
 * Angular replaces ActivatedRoute.snapshot only when a navigation activates, so a pending,
 * cancelled or failed navigation leaves the values alone; params, search, data and title
 * change together, from one snapshot. Every value comes from the snapshot's generated
 * records alone. The caller owns the lifetime: `teardown` receives the function that stops
 * following the route, after which the signals keep their last values.
 */
export function observeRecord(
  destination: Destination<AnyRoute>,
  activated: ActivatedRoute,
  router: Router,
  teardown: (release: () => void) => void,
): RouteView {
  assertIdentity(activated.snapshot, destination);

  const snapshot = signal<ActivatedRouteSnapshot>(activated.snapshot);
  // Activation replaces the snapshot, then emits the route's changed observables, then
  // ActivationEnd. Following both keeps reads current inside subscribers registered after
  // the handle; router events cover a new snapshot whose values are all equal.
  const subscription = merge(
    activated.queryParams,
    activated.fragment,
    activated.params,
    activated.url,
    activated.data,
    router.events,
  ).subscribe(() => {
    snapshot.set(activated.snapshot);
  });

  teardown(() => subscription.unsubscribe());

  // Shares the parse of guards and resolvers for the same snapshot. An error here
  // means a codec rejected a value it accepted while matching, and reading rethrows it.
  const inputs = computed(() => parseInputs(destination, snapshot()));

  return {
    params: computed(() => inputs().params),
    search: computed(() => inputs().search),
    data: computed(() => effectiveData(destination, snapshot())),
    title: computed(() => effectiveTitle(destination, snapshot())),
  };
}

/**
 * The resolver results of the destination's whole chain. Each owner's keys are the
 * authored ones its generated record carries, never Angular's resolve map, which Angular
 * extends during resolution; their values come from the owner's own record of the
 * snapshot, so the result doesn't depend on Angular's paramsInheritanceStrategy. Nearer
 * owners overwrite outer ones.
 */
function effectiveData(
  destination: Destination<AnyRoute>,
  snapshot: ActivatedRouteSnapshot,
): Readonly<Record<PropertyKey, unknown>> {
  const data: Record<PropertyKey, unknown> = Object.create(null);

  for (const owner of destinationOwners(destination, snapshot)) {
    for (const key of resolverKeys(owner.snapshot.routeConfig)) {
      if (Object.hasOwn(owner.snapshot.data, key)) {
        data[key] = owner.snapshot.data[key];
      }
    }
  }

  return Object.freeze(data);
}

/**
 * The resolved title of the nearest declaration in the chain that declares one, read from
 * that declaration's own record of the snapshot, so the result doesn't depend on Angular's
 * paramsInheritanceStrategy. Only generated callbacks set a record's title, so its
 * presence is the declaration's.
 */
function effectiveTitle(
  destination: Destination<AnyRoute>,
  snapshot: ActivatedRouteSnapshot,
): string | undefined {
  const chain = destinationOwners(destination, snapshot);

  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const owner = chain[index];

    if (owner.snapshot.routeConfig?.title === undefined) {
      continue;
    }

    return owner.snapshot.title;
  }

  return undefined;
}
