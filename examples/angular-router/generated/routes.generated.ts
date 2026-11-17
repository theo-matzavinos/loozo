// @loozo/angular-router routegen: owned routes.generated.ts
import type { Signal } from '@angular/core';
import type { Routes } from '@angular/router';
import { record, injectGeneratedActiveRoute, type RouteSchema, type ActiveRoute as GeneratedActiveRoute, type ActiveHandle as GeneratedActiveHandle } from '@loozo/angular-router/_generated';
import type { route as route__home_route } from "../src/routes/+home/route.generated.js";
import { destination as destination__home_route } from "../src/routes/+home/destination.generated.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "",
pathMatch: 'full',
...record(destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/+home/page") }];

/** Each generated route's types by id: its schema and, when it has one, its `..` destination. */
export type RouteTypes = {
"src/routes/+home/route.ts": { schema: RouteSchema<typeof route__home_route> };
};
/** An active route narrowed by is(): that declaration's handle. */
export type ActiveHandle<Id extends keyof RouteTypes> = GeneratedActiveHandle<RouteTypes, Id>;
/** An active route before narrowing: params, search, data and title read as the union of the tree's values; link and navigate need is(). */
export type ActiveRoute = GeneratedActiveRoute<RouteTypes>;
/**
 * Injects a signal of the deepest active generated route in the primary outlet.
 *
 * @remarks
 * Call in an Angular injection context. The value changes only when a navigation
 * commits, and is undefined before the first one (on a server-rendered page with
 * provideActiveRouteHydration(), it reads the server's route until then) or when no
 * generated route is active. A route keeps its handle while it stays active; each call
 * is its own reader.
 */
export function injectActiveRoute(): Signal<ActiveRoute | undefined> {
  return injectGeneratedActiveRoute<RouteTypes>();
}
export { provideActiveRouteHydration } from '@loozo/angular-router/_generated';
