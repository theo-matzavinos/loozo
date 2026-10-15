import { DestroyRef, computed, inject, signal, type Signal } from "@angular/core";
import { ActivatedRoute, Router, type ActivatedRouteSnapshot } from "@angular/router";
import { routeMetadata } from "@loozo/angular-router/_core";
import { merge } from "rxjs";
import { assertIdentity, parseInputs, type RouteSet } from "./inputs.js";

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
  const resolvers = routeMetadata(set.records[id].definition()).config.resolve ?? {};

  return {
    params: computed(() => inputs().params),
    search: computed(() => inputs().search),
    data: computed(() => {
      const data = snapshot().data;
      const own: Record<PropertyKey, unknown> = Object.create(null);

      for (const key of Reflect.ownKeys(resolvers)) {
        if (Object.hasOwn(data, key)) {
          own[key] = data[key];
        }
      }

      return Object.freeze(own);
    }),
  };
}
