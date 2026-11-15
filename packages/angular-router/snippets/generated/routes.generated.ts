// @loozo/angular-router routegen: owned routes.generated.ts
import type { Routes } from '@angular/router';
import { nativeOptions, callbacks, redirect } from '@loozo/angular-router/_generated';
import { route as route_products_$productId_route } from "../src/routes/products/$productId/route.generated.js";
import { route as route_reports_$reportId_route } from "../src/routes/reports/$reportId/route.generated.js";
import { route as route_teams_$teamId_items_$id_route } from "../src/routes/teams/$teamId/items/$id/route.generated.js";
import { route as route_teams_$teamId_members_$memberId_route } from "../src/routes/teams/$teamId/members/$memberId/route.generated.js";
import { route as route_teams_$teamId_old_items_$id_route } from "../src/routes/teams/$teamId/old-items/$id/route.generated.js";
import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "teams/:teamId/old-items/:id",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/teams/$teamId/old-items/$id/route.ts" },
redirectTo: redirect(route_teams_$teamId_old_items_$id_route) },
{ path: "products/:productId",
data: { __loozoAngularRouterRouteId: "src/routes/products/$productId/route.ts" },
...callbacks(route_products_$productId_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/products/$productId/page") },
{ path: "reports/:reportId",
data: { __loozoAngularRouterRouteId: "src/routes/reports/$reportId/route.ts" },
...callbacks(route_reports_$reportId_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/reports/$reportId/page") },
{ path: "teams/:teamId",
data: { __loozoAngularRouterRouteId: "src/routes/teams/$teamId/route.ts" },
...callbacks(route_teams_$teamId_route),
children: [{ ...nativeOptions(route_teams_$teamId_items_$id_route),
path: "items/:id",
data: { __loozoAngularRouterRouteId: "src/routes/teams/$teamId/items/$id/route.ts" },
...callbacks(route_teams_$teamId_items_$id_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/teams/$teamId/items/$id/page") },
{ path: "members/:memberId",
data: { __loozoAngularRouterRouteId: "src/routes/teams/$teamId/members/$memberId/route.ts" },
...callbacks(route_teams_$teamId_members_$memberId_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/teams/$teamId/members/$memberId/page") }] }];
