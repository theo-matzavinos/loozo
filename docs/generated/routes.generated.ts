// @loozo/angular-router routegen: owned routes.generated.ts
import type { Routes } from '@angular/router';
import { getRouteSet } from './destinations.generated.js';
import { callbacks } from '@loozo/angular-router/_generated';
import definition3 from "../src/routes/package/definition.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/home/definition.ts" },
loadComponent: () => import("../src/routes/home/page") },
{ path: ":package",
data: { __loozoAngularRouterRouteId: "src/routes/package/definition.ts" },
...callbacks(getRouteSet(), "src/routes/package/definition.ts"),
loadComponent: () => import("../src/routes/package/page"),
children: [{ path: "",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/package/overview/definition.ts" },
loadComponent: () => import("../src/routes/package/overview/page") },
{ path: "api/:symbol",
data: { __loozoAngularRouterRouteId: "src/routes/package/api/definition.ts" },
loadComponent: () => import("../src/routes/package/api/page") },
{ path: "generated-api",
data: { __loozoAngularRouterRouteId: "src/routes/package/generated-api/definition.ts" },
loadComponent: () => import("../src/routes/package/generated-api/page") },
{ path: "guide/:guide",
data: { __loozoAngularRouterRouteId: "src/routes/package/guide/definition.ts" },
loadComponent: () => import("../src/routes/package/guide/page") }] },
{ path: "**",
data: { __loozoAngularRouterRouteId: "src/routes/not-found/definition.ts" },
loadComponent: () => import("../src/routes/not-found/page") }];
