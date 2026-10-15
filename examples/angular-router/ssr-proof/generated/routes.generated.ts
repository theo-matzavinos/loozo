// @loozo/angular-router routegen: owned routes.generated.ts
import type { Routes } from '@angular/router';
import { getRouteSet } from './destinations.generated.js';
import { nativeOptions, callbacks, redirect } from '@loozo/angular-router/_generated';
import definition0 from "../src/routes/alias/definition.js";
import definition3 from "../src/routes/item/definition.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "teams/:teamId/old-items/:id",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/alias/definition.ts" },
redirectTo: redirect(() => definition0) },
{ path: "",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/home/definition.ts" },
loadComponent: () => import("../src/routes/home/page") },
{ path: "handle-only/:id",
data: { __loozoAngularRouterRouteId: "src/routes/handle-only/definition.ts" },
...callbacks(getRouteSet(), "src/routes/handle-only/definition.ts"),
loadComponent: () => import("../src/routes/handle-only/page") },
{ path: "teams/:teamId",
data: { __loozoAngularRouterRouteId: "src/routes/team/definition.ts" },
...callbacks(getRouteSet(), "src/routes/team/definition.ts"),
children: [{ ...nativeOptions(definition3),
path: "items/:id",
data: { __loozoAngularRouterRouteId: "src/routes/item/definition.ts" },
...callbacks(getRouteSet(), "src/routes/item/definition.ts"),
loadComponent: () => import("../src/routes/item/page") }] }];
