// @loozo/angular-router routegen: owned routes.generated.ts
import type { Signal } from '@angular/core';
import type { Routes } from '@angular/router';
import { record, callbacks, redirect, injectGeneratedActiveRoute, type RouteSchema, type ActiveRoute as GeneratedActiveRoute, type ActiveHandle as GeneratedActiveHandle } from '@loozo/angular-router/_generated';
import { route as route_$segments___route } from "../src/routes/$segments[]/route.generated.js";
import { route as route__home_route } from "../src/routes/+home/route.generated.js";
import { route as route_chat_$id_route } from "../src/routes/chat/$id/route.generated.js";
import { route as route_chat_$rest___route } from "../src/routes/chat/$rest[]/route.generated.js";
import { route as route_old_chat_kept_$id_route } from "../src/routes/old-chat-kept/$id/route.generated.js";
import { route as route_old_chat_$id_route } from "../src/routes/old-chat/$id/route.generated.js";
import { route as route_old_item_$id_route } from "../src/routes/old-item/$id/route.generated.js";
import { route as route_products_route } from "../src/routes/products/route.generated.js";
import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";
import type { route as route_account__layout_help_route } from "../src/routes/account/+layout/help/route.generated.js";
import type { route as route_account__layout_profile_route } from "../src/routes/account/+layout/profile/route.generated.js";
import type { route as route_account__layout_route } from "../src/routes/account/+layout/route.generated.js";
import type { route as route_account_route } from "../src/routes/account/route.generated.js";
import type { route as route_chat_$id_settings_route } from "../src/routes/chat/$id/settings/route.generated.js";
import type { route as route_files_$rest___route } from "../src/routes/files/$rest[]/route.generated.js";
import type { route as route_files_route } from "../src/routes/files/route.generated.js";
import type { route as route_literal_child_route } from "../src/routes/literal/child/route.generated.js";
import type { route as route_literal_route } from "../src/routes/literal/route.generated.js";
import type { route as route_login_route } from "../src/routes/login/route.generated.js";
import type { route as route_plain_route } from "../src/routes/plain/route.generated.js";
import type { route as route_products__overview_route } from "../src/routes/products/+overview/route.generated.js";
import type { route as route_products_item_static_route } from "../src/routes/products/item-static/route.generated.js";
import type { route as route_products_item_$id_route } from "../src/routes/products/item/$id/route.generated.js";
import type { route as route_products_list_route } from "../src/routes/products/list/route.generated.js";
import type { route as route_teams_$teamId_item_$id_route } from "../src/routes/teams/$teamId/item/$id/route.generated.js";
import type { route as route_teams_$teamId_list_route } from "../src/routes/teams/$teamId/list/route.generated.js";
import { destination as destination__home_route } from "../src/routes/+home/destination.generated.js";
import { destination as destination_$segments___route } from "../src/routes/$segments[]/destination.generated.js";
import { destination as destination_account_route } from "../src/routes/account/destination.generated.js";
import { destination as destination_chat_$id_route } from "../src/routes/chat/$id/destination.generated.js";
import { destination as destination_chat_$rest___route } from "../src/routes/chat/$rest[]/destination.generated.js";
import { destination as destination_files_route } from "../src/routes/files/destination.generated.js";
import { destination as destination_literal_route } from "../src/routes/literal/destination.generated.js";
import { destination as destination_login_route } from "../src/routes/login/destination.generated.js";
import { destination as destination_old_chat_kept_$id_route } from "../src/routes/old-chat-kept/$id/destination.generated.js";
import { destination as destination_old_chat_$id_route } from "../src/routes/old-chat/$id/destination.generated.js";
import { destination as destination_old_item_$id_route } from "../src/routes/old-item/$id/destination.generated.js";
import { destination as destination_plain_route } from "../src/routes/plain/destination.generated.js";
import type { destination as destination_products__overview_route } from "../src/routes/products/+overview/destination.generated.js";
import { destination as destination_products_route } from "../src/routes/products/destination.generated.js";
import { destination as destination_teams_$teamId_route } from "../src/routes/teams/$teamId/destination.generated.js";

/**
 * Generated native Angular route configuration; install with provideRouter(routes).
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "old-chat-kept/:id",
pathMatch: 'full',
...record(destination_old_chat_kept_$id_route),
redirectTo: redirect(route_old_chat_kept_$id_route) },
{ path: "old-chat/:id",
pathMatch: 'full',
...record(destination_old_chat_$id_route),
redirectTo: redirect(route_old_chat_$id_route) },
{ path: "old-item/:id",
pathMatch: 'full',
...record(destination_old_item_$id_route),
redirectTo: redirect(route_old_item_$id_route) },
{ path: "",
...record(destination__home_route),
...callbacks(route__home_route, { onlyAtEnd: true }),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/+home/page") },
{ path: "chat/:id",
outlet: "chat",
...record(destination_chat_$id_route),
...callbacks(route_chat_$id_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/chat/$id/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/chat/$id/children.generated.js").then((m) => m.routes) },
{ path: "files",
outlet: "chat",
...record(destination_files_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/files/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/files/children.generated.js").then((m) => m.routes) },
{ path: "account",
...record(destination_account_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/account/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/account/children.generated.js").then((m) => m.routes) },
{ path: "login",
...record(destination_login_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/login/page") },
{ path: "plain",
...record(destination_plain_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/plain/page") },
{ path: "products",
...record(destination_products_route, destination__home_route),
...callbacks(route_products_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/products/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/products/children.generated.js").then((m) => m.routes) },
{ path: "products/(detail:item)",
...record(destination_literal_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/literal/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/literal/children.generated.js").then((m) => m.routes) },
{ path: "teams/:teamId",
...record(destination_teams_$teamId_route, destination__home_route),
...callbacks(route_teams_$teamId_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/teams/$teamId/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("../src/routes/teams/$teamId/children.generated.js").then((m) => m.routes) },
{ path: "**",
outlet: "chat",
...record(destination_chat_$rest___route),
...callbacks(route_chat_$rest___route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/chat/$rest[]/page") },
{ path: "**",
...record(destination_$segments___route, destination__home_route),
...callbacks(route_$segments___route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("../src/routes/$segments[]/page") }];

/** Each generated primary-outlet route's types by id: its schema and, when it has one, its `..` destination. */
export type RouteTypes = {
"src/routes/+home/route.ts": { schema: RouteSchema<typeof route__home_route> };
"src/routes/$segments[]/route.ts": { schema: RouteSchema<typeof route_$segments___route>; up: typeof destination__home_route };
"src/routes/account/+layout/profile/route.ts": { schema: RouteSchema<typeof route_account__layout_profile_route> };
"src/routes/account/+layout/route.ts": { schema: RouteSchema<typeof route_account__layout_route>; up: typeof destination__home_route };
"src/routes/account/route.ts": { schema: RouteSchema<typeof route_account_route>; up: typeof destination__home_route };
"src/routes/literal/child/route.ts": { schema: RouteSchema<typeof route_literal_child_route>; up: typeof destination_literal_route };
"src/routes/literal/route.ts": { schema: RouteSchema<typeof route_literal_route>; up: typeof destination__home_route };
"src/routes/login/route.ts": { schema: RouteSchema<typeof route_login_route>; up: typeof destination__home_route };
"src/routes/plain/route.ts": { schema: RouteSchema<typeof route_plain_route>; up: typeof destination__home_route };
"src/routes/products/+overview/route.ts": { schema: RouteSchema<typeof route_products__overview_route>; up: typeof destination__home_route };
"src/routes/products/list/route.ts": { schema: RouteSchema<typeof route_products_list_route>; up: typeof destination_products__overview_route };
"src/routes/products/route.ts": { schema: RouteSchema<typeof route_products_route>; up: typeof destination__home_route };
"src/routes/teams/$teamId/list/route.ts": { schema: RouteSchema<typeof route_teams_$teamId_list_route>; up: typeof destination_teams_$teamId_route };
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
