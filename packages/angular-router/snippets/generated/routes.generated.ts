// @loozo/angular-router routegen: owned routes.generated.ts
import type { Routes } from '@angular/router';
import { getRouteSet } from './destinations.generated.js';
import { nativeOptions, callbacks, redirect } from '@loozo/angular-router/_generated';
import definition_teams_$teamId_items_$id_route from "../src/routes/teams/$teamId/items/$id/route.js";
import definition_teams_$teamId_old_items_$id_route from "../src/routes/teams/$teamId/old-items/$id/route.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "teams/:teamId/old-items/:id",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/teams/$teamId/old-items/$id/route.ts" },
redirectTo: redirect(() => definition_teams_$teamId_old_items_$id_route) },
{ path: "products/:productId",
data: { __loozoAngularRouterRouteId: "src/routes/products/$productId/route.ts" },
...callbacks(getRouteSet(), "src/routes/products/$productId/route.ts"),
loadComponent: () => import("../src/routes/products/$productId/page") },
{ path: "reports/:reportId",
data: { __loozoAngularRouterRouteId: "src/routes/reports/$reportId/route.ts" },
...callbacks(getRouteSet(), "src/routes/reports/$reportId/route.ts"),
loadComponent: () => import("../src/routes/reports/$reportId/page") },
{ path: "teams/:teamId",
data: { __loozoAngularRouterRouteId: "src/routes/teams/$teamId/route.ts" },
...callbacks(getRouteSet(), "src/routes/teams/$teamId/route.ts"),
children: [{ ...nativeOptions(definition_teams_$teamId_items_$id_route),
path: "items/:id",
data: { __loozoAngularRouterRouteId: "src/routes/teams/$teamId/items/$id/route.ts" },
...callbacks(getRouteSet(), "src/routes/teams/$teamId/items/$id/route.ts"),
loadComponent: () => import("../src/routes/teams/$teamId/items/$id/page") },
{ path: "members/:memberId",
data: { __loozoAngularRouterRouteId: "src/routes/teams/$teamId/members/$memberId/route.ts" },
...callbacks(getRouteSet(), "src/routes/teams/$teamId/members/$memberId/route.ts"),
loadComponent: () => import("../src/routes/teams/$teamId/members/$memberId/page") }] }];
