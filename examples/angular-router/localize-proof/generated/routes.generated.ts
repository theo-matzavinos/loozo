// @loozo/angular-router routegen: owned routes.generated.ts
import type { Signal } from '@angular/core';
import type { Routes } from '@angular/router';
import { record, nativePath, effectivePath, callbacks, lazyRedirect, injectGeneratedActiveRoute, type RouteSchema, type ActiveRoute as GeneratedActiveRoute, type ActiveHandle as GeneratedActiveHandle } from '@loozo/angular-router/_generated';
import { route as route_$segments___route } from "../src/routes/$segments[]/route.generated.js";
import { route as route_products_$productId_route } from "../src/routes/products/$productId/route.generated.js";
import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";
import type { route as route__home_route } from "../src/routes/+home/route.generated.js";
import type { route as route_products__list_route } from "../src/routes/products/+list/route.generated.js";
import type { route as route_teams_$teamId__overview_route } from "../src/routes/teams/$teamId/+overview/route.generated.js";
import type { route as route_teams_$teamId_members_route } from "../src/routes/teams/$teamId/members/route.generated.js";
import { destination as destination__home_route } from "../src/routes/+home/destination.generated.js";
import { destination as destination_$segments___route } from "../src/routes/$segments[]/destination.generated.js";
import { destination as destination_old_products_$productId_route } from "../src/routes/old-products/$productId/destination.generated.js";
import { destination as destination_products__list_route } from "../src/routes/products/+list/destination.generated.js";
import { destination as destination_products_$productId_route } from "../src/routes/products/$productId/destination.generated.js";
import type { destination as destination_teams_$teamId__overview_route } from "../src/routes/teams/$teamId/+overview/destination.generated.js";
import { destination as destination_teams_$teamId_route } from "../src/routes/teams/$teamId/destination.generated.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: effectivePath(destination_old_products_$productId_route),
pathMatch: 'full',
...record(destination_old_products_$productId_route),
redirectTo: lazyRedirect(() => import("../src/routes/old-products/$productId/route.generated.js")) },
{ path: "",
pathMatch: 'full',
...record(destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/+home/page") },
{ path: nativePath(destination_products__list_route),
...record(destination_products__list_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/products/+list/page") },
{ path: nativePath(destination_products_$productId_route),
...record(destination_products_$productId_route, destination__home_route),
...callbacks(route_products_$productId_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/products/$productId/page") },
{ path: nativePath(destination_teams_$teamId_route),
...record(destination_teams_$teamId_route, destination__home_route),
...callbacks(route_teams_$teamId_route),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/teams/$teamId/children.generated.js").then((m) => m.routes) },
{ path: "**",
...record(destination_$segments___route, destination__home_route),
...callbacks(route_$segments___route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$segments[]/page") }];

/** Each generated route's types by id: its schema and, when it has one, its `..` destination. */
export type RouteTypes = {
"src/routes/+home/route.ts": { schema: RouteSchema<typeof route__home_route> };
"src/routes/$segments[]/route.ts": { schema: RouteSchema<typeof route_$segments___route>; up: typeof destination__home_route };
"src/routes/products/+list/route.ts": { schema: RouteSchema<typeof route_products__list_route>; up: typeof destination__home_route };
"src/routes/products/$productId/route.ts": { schema: RouteSchema<typeof route_products_$productId_route>; up: typeof destination__home_route };
"src/routes/teams/$teamId/+overview/route.ts": { schema: RouteSchema<typeof route_teams_$teamId__overview_route>; up: typeof destination__home_route };
"src/routes/teams/$teamId/members/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_members_route>; up: typeof destination_teams_$teamId__overview_route };
"src/routes/teams/$teamId/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_route>; up: typeof destination__home_route };
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
