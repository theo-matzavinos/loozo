// @loozo/angular-router routegen: owned routes.generated.ts
import type { Routes } from '@angular/router';
import { getRouteSet } from './destinations.generated.js';
import { nativeOptions, callbacks, redirect } from '@loozo/angular-router/_generated';
import definition0 from "../src/routes/item/definition.js";
import definition2 from "../src/routes/old-item/definition.js";
import definition4 from "../src/routes/report/definition.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "teams/:teamId/old-items/:id",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/old-item/definition.ts" },
redirectTo: redirect(() => definition2) },
{ path: "products/:productId",
data: { __loozoAngularRouterRouteId: "src/routes/product/definition.ts" },
loadComponent: () => import("../src/routes/product/page") },
{ path: "reports/:reportId",
data: { __loozoAngularRouterRouteId: "src/routes/report/definition.ts" },
...callbacks(getRouteSet(), "src/routes/report/definition.ts"),
loadComponent: () => import("../src/routes/report/page") },
{ path: "teams/:teamId",
data: { __loozoAngularRouterRouteId: "src/routes/team/definition.ts" },
children: [{ ...nativeOptions(definition0),
path: "items/:id",
data: { __loozoAngularRouterRouteId: "src/routes/item/definition.ts" },
...callbacks(getRouteSet(), "src/routes/item/definition.ts"),
loadComponent: () => import("../src/routes/item/page") },
{ path: "members/:memberId",
data: { __loozoAngularRouterRouteId: "src/routes/member/definition.ts" },
loadComponent: () => import("../src/routes/member/page") }] }];
