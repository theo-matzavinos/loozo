// @loozo/angular-router routegen: owned routes.generated.ts
import type { Signal } from '@angular/core';
import type { Routes } from '@angular/router';
import { record, callbacks, lazyRedirect, injectGeneratedActiveRoute, type RouteSchema, type ActiveRoute as GeneratedActiveRoute, type ActiveHandle as GeneratedActiveHandle } from '@loozo/angular-router/_generated';
import { route as route_products_$productId_route } from "../src/routes/products/$productId/route.generated.js";
import { route as route_reports_$reportId_route } from "../src/routes/reports/$reportId/route.generated.js";
import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";
import type { route as route_teams_$teamId_items_$id_route } from "../src/routes/teams/$teamId/items/$id/route.generated.js";
import type { route as route_teams_$teamId_members_$memberId_route } from "../src/routes/teams/$teamId/members/$memberId/route.generated.js";
import { destination as destination_products_$productId_route } from "../src/routes/products/$productId/destination.generated.js";
import { destination as destination_reports_$reportId_route } from "../src/routes/reports/$reportId/destination.generated.js";
import { destination as destination_teams_$teamId_old_items_$id_route } from "../src/routes/teams/$teamId/old-items/$id/destination.generated.js";
import { destination as destination_teams_$teamId_route } from "../src/routes/teams/$teamId/destination.generated.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "teams/:teamId/old-items/:id",
pathMatch: 'full',
...record(destination_teams_$teamId_old_items_$id_route),
redirectTo: lazyRedirect(() => import("../src/routes/teams/$teamId/old-items/$id/route.generated.js")) },
{ path: "products/:productId",
...record(destination_products_$productId_route),
...callbacks(route_products_$productId_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/products/$productId/page") },
{ path: "reports/:reportId",
...record(destination_reports_$reportId_route),
...callbacks(route_reports_$reportId_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/reports/$reportId/page") },
{ path: "teams/:teamId",
...record(destination_teams_$teamId_route),
...callbacks(route_teams_$teamId_route),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/teams/$teamId/children.generated.js").then((m) => m.routes) }];

/** Each generated route's types by id: its schema and, when it has one, its `..` destination. */
export type RouteTypes = {
"src/routes/products/$productId/route.ts": { schema: RouteSchema<typeof route_products_$productId_route> };
"src/routes/reports/$reportId/route.ts": { schema: RouteSchema<typeof route_reports_$reportId_route> };
"src/routes/teams/$teamId/items/$id/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_items_$id_route>; up: typeof destination_teams_$teamId_route };
"src/routes/teams/$teamId/members/$memberId/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_members_$memberId_route>; up: typeof destination_teams_$teamId_route };
"src/routes/teams/$teamId/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_route> };
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
 * commits, and is undefined before the first one or when no generated route is
 * active. A route keeps its handle while it stays active; each call is its own reader.
 */
export function injectActiveRoute(): Signal<ActiveRoute | undefined> {
  return injectGeneratedActiveRoute<RouteTypes>();
}
