// @loozo/angular-router routegen: owned routes.generated.ts
import type { Signal } from '@angular/core';
import type { Routes } from '@angular/router';
import { record, callbacks, owned, redirect, lazyRedirect, injectGeneratedActiveRoute, type RouteSchema, type ActiveRoute as GeneratedActiveRoute, type ActiveHandle as GeneratedActiveHandle } from '@loozo/angular-router/_generated';
import { route as route__workspace_route } from "../src/routes/+workspace/route.generated.js";
import { route as route_handle_only_$id_route } from "../src/routes/handle-only/$id/route.generated.js";
import { route as route_old_order_$id_route } from "../src/routes/old-order/$id/route.generated.js";
import { route as route_old_orders_route } from "../src/routes/old-orders/route.generated.js";
import { route as route_other_route } from "../src/routes/other/route.generated.js";
import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";
import type { route as route__home_route } from "../src/routes/+home/route.generated.js";
import type { route as route__workspace_orders_$id_route } from "../src/routes/+workspace/orders/$id/route.generated.js";
import type { route as route__workspace_orders_route } from "../src/routes/+workspace/orders/route.generated.js";
import type { route as route_login_route } from "../src/routes/login/route.generated.js";
import type { route as route_not_found_route } from "../src/routes/not-found/route.generated.js";
import type { route as route_other_child_route } from "../src/routes/other/child/route.generated.js";
import type { route as route_teams_$teamId_items_$id_route } from "../src/routes/teams/$teamId/items/$id/route.generated.js";
import { destination as destination__home_route } from "../src/routes/+home/destination.generated.js";
import type { destination as destination__workspace_orders_route } from "../src/routes/+workspace/orders/destination.generated.js";
import { destination as destination__workspace_route } from "../src/routes/+workspace/destination.generated.js";
import { destination as destination_handle_only_$id_route } from "../src/routes/handle-only/$id/destination.generated.js";
import { destination as destination_login_route } from "../src/routes/login/destination.generated.js";
import { destination as destination_not_found_route } from "../src/routes/not-found/destination.generated.js";
import { destination as destination_old_order_$id_route } from "../src/routes/old-order/$id/destination.generated.js";
import { destination as destination_old_orders_route } from "../src/routes/old-orders/destination.generated.js";
import { destination as destination_other_route } from "../src/routes/other/destination.generated.js";
import { destination as destination_teams_$teamId_items_$id_legacy_route } from "../src/routes/teams/$teamId/items/$id/legacy/destination.generated.js";
import { destination as destination_teams_$teamId_old_items_$id_route } from "../src/routes/teams/$teamId/old-items/$id/destination.generated.js";
import { destination as destination_teams_$teamId_route } from "../src/routes/teams/$teamId/destination.generated.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "old-order/:id",
pathMatch: 'full',
...record(destination_old_order_$id_route),
redirectTo: redirect(route_old_order_$id_route) },
{ path: "old-orders",
pathMatch: 'full',
...record(destination_old_orders_route),
redirectTo: redirect(route_old_orders_route) },
{ path: "teams/:teamId/items/:id/legacy",
pathMatch: 'full',
...record(destination_teams_$teamId_items_$id_legacy_route),
redirectTo: lazyRedirect(() => import("../src/routes/teams/$teamId/items/$id/legacy/route.generated.js")) },
{ path: "teams/:teamId/old-items/:id",
pathMatch: 'full',
...record(destination_teams_$teamId_old_items_$id_route),
redirectTo: lazyRedirect(() => import("../src/routes/teams/$teamId/old-items/$id/route.generated.js")) },
{ path: "",
pathMatch: 'full',
...record(destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/+home/page") },
{ path: "",
...record(destination__workspace_route),
...owned([["orders", ":"], ["orders"]], callbacks(route__workspace_route)),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/+workspace/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/+workspace/children.generated.js").then((m) => m.routes) },
{ path: "handle-only/:id",
...record(destination_handle_only_$id_route, destination__home_route),
...callbacks(route_handle_only_$id_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/handle-only/$id/page") },
{ path: "login",
...record(destination_login_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/login/page") },
{ path: "not-found",
...record(destination_not_found_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/not-found/page") },
{ path: "other",
...record(destination_other_route, destination__home_route),
...callbacks(route_other_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/other/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/other/children.generated.js").then((m) => m.routes) },
{ path: "teams/:teamId",
...record(destination_teams_$teamId_route, destination__home_route),
...callbacks(route_teams_$teamId_route),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/teams/$teamId/children.generated.js").then((m) => m.routes) }];

/** Each generated primary-outlet route's types by id: its schema and, when it has one, its `..` destination. */
export type RouteTypes = {
"src/routes/+home/route.ts": { schema: RouteSchema<typeof route__home_route> };
"src/routes/+workspace/orders/$id/route.ts": { schema: RouteSchema<typeof route__workspace_orders_$id_route>; up: typeof destination__workspace_orders_route };
"src/routes/+workspace/orders/route.ts": { schema: RouteSchema<typeof route__workspace_orders_route>; up: typeof destination__home_route };
"src/routes/+workspace/route.ts": { schema: RouteSchema<typeof route__workspace_route> };
"src/routes/handle-only/$id/route.ts": { schema: RouteSchema<typeof route_handle_only_$id_route>; up: typeof destination__home_route };
"src/routes/login/route.ts": { schema: RouteSchema<typeof route_login_route>; up: typeof destination__home_route };
"src/routes/not-found/route.ts": { schema: RouteSchema<typeof route_not_found_route>; up: typeof destination__home_route };
"src/routes/other/child/route.ts": { schema: RouteSchema<typeof route_other_child_route>; up: typeof destination_other_route };
"src/routes/other/route.ts": { schema: RouteSchema<typeof route_other_route>; up: typeof destination__home_route };
"src/routes/teams/$teamId/items/$id/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_items_$id_route>; up: typeof destination_teams_$teamId_route };
"src/routes/teams/$teamId/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_route>; up: typeof destination__home_route };
};
/** An active route narrowed by is(): that declaration's handle. */
export type ActiveHandle<Id extends keyof RouteTypes> = GeneratedActiveHandle<RouteTypes, Id>;
/** An active route before narrowing: params, search, data and title read as the union of the tree's values; link and navigate take a destination, and their own and `..` forms need is(). */
export type ActiveRoute = GeneratedActiveRoute<RouteTypes>;
/**
 * Injects a signal of the deepest active generated route in the primary outlet.
 *
 * @remarks
 * Call in an Angular injection context. The value changes only when a navigation
 * commits, and is undefined before the first one (on a server-rendered page with
 * provideActiveRouteHydration(), it reads the server's route until then) or when no
 * generated route is active. It never selects a named-outlet route. A route keeps its
 * handle while it stays active; each call is its own reader.
 */
export function injectActiveRoute(): Signal<ActiveRoute | undefined> {
  return injectGeneratedActiveRoute<RouteTypes>();
}
export { provideActiveRouteHydration } from '@loozo/angular-router/_generated';
export { currentSearchRestore, provideSearchStorage } from '@loozo/angular-router/_generated';
