// @loozo/angular-router routegen: owned routes.generated.ts
import type { Signal } from '@angular/core';
import type { Routes } from '@angular/router';
import { record, callbacks, injectGeneratedActiveRoute, type RouteSchema, type ActiveRoute as GeneratedActiveRoute, type ActiveHandle as GeneratedActiveHandle } from '@loozo/angular-router/_generated';
import { route as route_$package_route } from "../src/routes/$package/route.generated.js";
import { route as route_$segments___route } from "../src/routes/$segments[]/route.generated.js";
import { route as route__home_route } from "../src/routes/+home/route.generated.js";
import type { route as route_$package__overview_route } from "../src/routes/$package/+overview/route.generated.js";
import type { route as route_$package_api_$symbol_route } from "../src/routes/$package/api/$symbol/route.generated.js";
import type { route as route_$package_generated_api_route } from "../src/routes/$package/generated-api/route.generated.js";
import type { route as route_$package_guide_$guide_route } from "../src/routes/$package/guide/$guide/route.generated.js";
import { destination as destination__home_route } from "../src/routes/+home/destination.generated.js";
import type { destination as destination_$package__overview_route } from "../src/routes/$package/+overview/destination.generated.js";
import { destination as destination_$package_route } from "../src/routes/$package/destination.generated.js";
import { destination as destination_$segments___route } from "../src/routes/$segments[]/destination.generated.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "",
pathMatch: 'full',
...record(destination__home_route),
...callbacks(route__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/+home/page") },
{ path: ":package",
...record(destination_$package_route, destination__home_route),
...callbacks(route_$package_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$package/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/$package/children.generated.js").then((m) => m.routes) },
{ path: "**",
...record(destination_$segments___route, destination__home_route),
...callbacks(route_$segments___route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$segments[]/page") }];

/** Each generated primary-outlet route's types by id: its schema and, when it has one, its `..` destination. */
export type RouteTypes = {
"src/routes/+home/route.ts": { schema: RouteSchema<typeof route__home_route> };
"src/routes/$package/+overview/route.ts": { schema: RouteSchema<typeof route_$package__overview_route>; up: typeof destination__home_route };
"src/routes/$package/api/$symbol/route.ts": { schema: RouteSchema<typeof route_$package_api_$symbol_route>; up: typeof destination_$package__overview_route };
"src/routes/$package/generated-api/route.ts": { schema: RouteSchema<typeof route_$package_generated_api_route>; up: typeof destination_$package__overview_route };
"src/routes/$package/guide/$guide/route.ts": { schema: RouteSchema<typeof route_$package_guide_$guide_route>; up: typeof destination_$package__overview_route };
"src/routes/$package/route.ts": { schema: RouteSchema<typeof route_$package_route>; up: typeof destination__home_route };
"src/routes/$segments[]/route.ts": { schema: RouteSchema<typeof route_$segments___route>; up: typeof destination__home_route };
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
