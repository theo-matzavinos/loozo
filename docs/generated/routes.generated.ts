// @loozo/angular-router routegen: owned routes.generated.ts
import type { Routes } from '@angular/router';
import { callbacks } from '@loozo/angular-router/_generated';
import { route as route_$package_api_$symbol_route } from "../src/routes/$package/api/$symbol/route.generated.js";
import { route as route_$package_generated_api_route } from "../src/routes/$package/generated-api/route.generated.js";
import { route as route_$package_guide_$guide_route } from "../src/routes/$package/guide/$guide/route.generated.js";
import { route as route_$package_route } from "../src/routes/$package/route.generated.js";
import { route as route_$segments___route } from "../src/routes/$segments[]/route.generated.js";
import { route as route__home_route } from "../src/routes/+home/route.generated.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/+home/route.ts" },
...callbacks(route__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/+home/page") },
{ path: ":package",
data: { __loozoAngularRouterRouteId: "src/routes/$package/route.ts" },
...callbacks(route_$package_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$package/page"),
children: [{ path: "",
pathMatch: 'full',
data: { __loozoAngularRouterRouteId: "src/routes/$package/+overview/route.ts" },
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$package/+overview/page") },
{ path: "api/:symbol",
data: { __loozoAngularRouterRouteId: "src/routes/$package/api/$symbol/route.ts" },
...callbacks(route_$package_api_$symbol_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$package/api/$symbol/page") },
{ path: "generated-api",
data: { __loozoAngularRouterRouteId: "src/routes/$package/generated-api/route.ts" },
...callbacks(route_$package_generated_api_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$package/generated-api/page") },
{ path: "guide/:guide",
data: { __loozoAngularRouterRouteId: "src/routes/$package/guide/$guide/route.ts" },
...callbacks(route_$package_guide_$guide_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$package/guide/$guide/page") }] },
{ path: "**",
data: { __loozoAngularRouterRouteId: "src/routes/$segments[]/route.ts" },
...callbacks(route_$segments___route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$segments[]/page") }];
