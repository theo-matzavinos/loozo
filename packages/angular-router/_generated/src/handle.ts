import { DestroyRef, computed, inject, signal, type Signal } from "@angular/core";
import { ActivatedRoute, Router, type ActivatedRouteSnapshot } from "@angular/router";
import { routeMetadata } from "@loozo/angular-router/_core";
import { merge } from "rxjs";
import { assertIdentity, hasIdentity, parseInputs, type RouteSet } from "./inputs.js";

/**
 * Signals of the route's committed snapshot. Angular replaces ActivatedRoute.snapshot
 * only when a navigation activates, so a pending, cancelled or failed navigation
 * leaves the values alone; params, search and data change together, from one snapshot.
 */
export function observeRoute(
  set: RouteSet,
  id: string,
): {
  params: Signal<Readonly<Record<string, unknown>>>;
  search: Signal<Readonly<Record<string, unknown>>>;
  data: Signal<Readonly<Record<PropertyKey, unknown>>>;
} {
  const activated = inject(ActivatedRoute);
  const router = inject(Router);

  assertIdentity(activated.snapshot, id);

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

  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

  // Shares the parse of guards and resolvers for the same snapshot. An error here
  // means a codec rejected a value it accepted while matching, and reading rethrows it.
  const inputs = computed(() => parseInputs(set, id, snapshot()));

  return {
    params: computed(() => inputs().params),
    search: computed(() => inputs().search),
    data: computed(() => effectiveData(set, id, snapshot())),
  };
}

/**
 * The resolver results of the route's whole chain. Each owner's keys come from its
 * own record of the snapshot, so the result doesn't depend on Angular's
 * paramsInheritanceStrategy; nearer owners overwrite outer ones.
 */
function effectiveData(
  set: RouteSet,
  id: string,
  snapshot: ActivatedRouteSnapshot,
): Readonly<Record<PropertyKey, unknown>> {
  const data: Record<PropertyKey, unknown> = Object.create(null);

  for (const ownerId of set.records[id].owners) {
    const resolvers = routeMetadata(set.records[ownerId].definition()).config.resolve;

    if (!resolvers) {
      continue;
    }

    const owner = snapshot.pathFromRoot.findLast((record) => hasIdentity(record, ownerId));

    if (!owner) {
      throw new Error(`Generated route ancestor missing: ${ownerId}`);
    }

    for (const key of Reflect.ownKeys(resolvers)) {
      if (Object.hasOwn(owner.data, key)) {
        data[key] = owner.data[key];
      }
    }
  }

  return Object.freeze(data);
}
