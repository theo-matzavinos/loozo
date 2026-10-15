// @loozo/angular-router routegen: owned routes.generated.ts
import type { Routes } from '@angular/router';
import { getRouteSet } from './destinations.generated.js';
import { callbacks } from '@loozo/angular-router/_generated';

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/+home/route.ts" },
...callbacks(getRouteSet(), "src/routes/+home/route.ts"),
loadComponent: () => import("../src/routes/+home/page") },
{ path: ":package",
data: { __loozoAngularRouterRouteId: "src/routes/$package/route.ts" },
...callbacks(getRouteSet(), "src/routes/$package/route.ts"),
loadComponent: () => import("../src/routes/$package/page"),
children: [{ path: "",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/$package/+overview/route.ts" },
loadComponent: () => import("../src/routes/$package/+overview/page") },
{ path: "api/:symbol",
data: { __loozoAngularRouterRouteId: "src/routes/$package/api/$symbol/route.ts" },
...callbacks(getRouteSet(), "src/routes/$package/api/$symbol/route.ts"),
loadComponent: () => import("../src/routes/$package/api/$symbol/page") },
{ path: "generated-api",
data: { __loozoAngularRouterRouteId: "src/routes/$package/generated-api/route.ts" },
...callbacks(getRouteSet(), "src/routes/$package/generated-api/route.ts"),
loadComponent: () => import("../src/routes/$package/generated-api/page") },
{ path: "guide/:guide",
data: { __loozoAngularRouterRouteId: "src/routes/$package/guide/$guide/route.ts" },
...callbacks(getRouteSet(), "src/routes/$package/guide/$guide/route.ts"),
loadComponent: () => import("../src/routes/$package/guide/$guide/page") }] },
{ path: "**",
data: { __loozoAngularRouterRouteId: "src/routes/$segments[]/route.ts" },
...callbacks(getRouteSet(), "src/routes/$segments[]/route.ts"),
loadComponent: () => import("../src/routes/$segments[]/page") }];
