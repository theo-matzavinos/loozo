import { computed, signal, type Signal } from "@angular/core";
import type { ActivatedRoute, ActivatedRouteSnapshot, Router } from "@angular/router";
import { routeMetadata, type AnyRoute } from "@loozo/angular-router/_core";
import { merge } from "rxjs";
import { assertIdentity, owners, parseInputs, routeId } from "./inputs.js";

export interface RouteView {
  readonly params: Signal<Readonly<Record<string, unknown>>>;
  readonly search: Signal<Readonly<Record<string, unknown>>>;
  readonly data: Signal<Readonly<Record<PropertyKey, unknown>>>;
  readonly title: Signal<string | undefined>;
}

/**
 * Signals of the route's committed snapshot. Angular replaces ActivatedRoute.snapshot
 * only when a navigation activates, so a pending, cancelled or failed navigation
 * leaves the values alone; params, search, data and title change together, from one snapshot.
 * The caller owns the lifetime: `teardown` receives the function that stops following
 * the route, after which the signals keep their last values.
 */
export function observeRoute(
  route: AnyRoute,
  activated: ActivatedRoute,
  router: Router,
  teardown: (release: () => void) => void,
): RouteView {
  assertIdentity(activated.snapshot, routeId(route));

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
  const inputs = computed(() => parseInputs(route, snapshot()));

  return {
    params: computed(() => inputs().params),
    search: computed(() => inputs().search),
    data: computed(() => effectiveData(route, snapshot())),
    title: computed(() => effectiveTitle(route, snapshot())),
  };
}

/**
 * The resolver results of the route's whole chain. Each owner's keys come from its
 * own record of the snapshot, so the result doesn't depend on Angular's
 * paramsInheritanceStrategy; nearer owners overwrite outer ones.
 */
function effectiveData(
  route: AnyRoute,
  snapshot: ActivatedRouteSnapshot,
): Readonly<Record<PropertyKey, unknown>> {
  const data: Record<PropertyKey, unknown> = Object.create(null);

  for (const owner of owners(route, snapshot)) {
    const resolvers = routeMetadata(owner.route).config.resolve;

    if (!resolvers) {
      continue;
    }

    for (const key of Reflect.ownKeys(resolvers)) {
      if (Object.hasOwn(owner.snapshot.data, key)) {
        data[key] = owner.snapshot.data[key];
      }
    }
  }

  return Object.freeze(data);
}

/**
 * The resolved title of the nearest declaration in the route's chain that declares one,
 * read from that declaration's own record of the snapshot, so the result doesn't depend
 * on Angular's paramsInheritanceStrategy.
 */
function effectiveTitle(route: AnyRoute, snapshot: ActivatedRouteSnapshot): string | undefined {
  const chain = owners(route, snapshot);

  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const owner = chain[index];

    if (routeMetadata(owner.route).config.title === undefined) {
      continue;
    }

    return owner.snapshot.title;
  }

  return undefined;
}
