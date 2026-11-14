// @loozo/angular-router routegen: owned destinations.generated.ts
import type { Signal } from '@angular/core';
import { injectGeneratedActiveRoute, type RouteSchema, type RouteSet, type Handle as GeneratedHandle, type Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition__home_route from "../src/routes/+home/route.js";
import definition_handle_only_$id_route from "../src/routes/handle-only/$id/route.js";
import definition_teams_$teamId_items_$id_route from "../src/routes/teams/$teamId/items/$id/route.js";
import definition_teams_$teamId_old_items_$id_route from "../src/routes/teams/$teamId/old-items/$id/route.js";
import definition_teams_$teamId_route from "../src/routes/teams/$teamId/route.js";

export type Definitions = {
"src/routes/+home/route.ts": RouteSchema<typeof definition__home_route>;
"src/routes/handle-only/$id/route.ts": RouteSchema<typeof definition_handle_only_$id_route>;
"src/routes/teams/$teamId/items/$id/route.ts": RouteSchema<typeof definition_teams_$teamId_items_$id_route>;
"src/routes/teams/$teamId/old-items/$id/route.ts": RouteSchema<typeof definition_teams_$teamId_old_items_$id_route>;
"src/routes/teams/$teamId/route.ts": RouteSchema<typeof definition_teams_$teamId_route>;
};
declare const setIdentity: unique symbol;
export type AbsoluteTargets = {
"/": "src/routes/+home/route.ts";
"/handle-only/$id": "src/routes/handle-only/$id/route.ts";
"/teams/$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts";
"/teams/$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts";
"/teams/$teamId": "src/routes/teams/$teamId/route.ts";
};
export type Parents = {
"src/routes/handle-only/$id/route.ts": "src/routes/+home/route.ts";
"src/routes/teams/$teamId/items/$id/route.ts": "src/routes/teams/$teamId/route.ts";
"src/routes/teams/$teamId/route.ts": "src/routes/+home/route.ts";
};
/** Declarations with a colocated facade. */
export type Retained =
| "src/routes/+home/route.ts"
| "src/routes/handle-only/$id/route.ts"
| "src/routes/teams/$teamId/items/$id/route.ts"
| "src/routes/teams/$teamId/route.ts"
;
export type AbsoluteSelected = {
  readonly [Expression in keyof AbsoluteTargets]: Definitions[AbsoluteTargets[Expression] & keyof Definitions];
};
type ParentOf<Id extends Retained> = Id extends keyof Parents ? Definitions[Parents[Id] & keyof Definitions] : never;
/** A declaration-bound handle; obtain it through its colocated injectRoute facade. */
export type Handle<Id extends Retained> = GeneratedHandle<Definitions[Id], AbsoluteSelected, ParentOf<Id>, typeof setIdentity, Pick<Definitions, Retained>>;
/** A same-set nominal reference; use the destination exported by a colocated facade. */
export type Destination<Id extends Retained> = GeneratedDestination<Definitions[Id], typeof setIdentity, Id>;
interface ActiveBase {
  /** Exactly this route, not an ancestor. Narrows to that route's handle. */
  is<Other extends Retained>(destination: Destination<Other>): this is ActiveHandle<Other>;
  /** This route or one of its active ancestors. */
  contains(destination: Destination<Retained>): boolean;
  /** Active generated routes, top-level first, ending with this one. */
  readonly chain: readonly ActiveRoute[];
}
/** An active route narrowed by is(): that declaration's handle. */
export interface ActiveHandle<Id extends Retained> extends Handle<Id>, ActiveBase {}
/** An active route before narrowing: params, search, data and title read as the union of the set's values; link and navigate need is(). */
export interface ActiveRoute extends Pick<Handle<Retained>, "params" | "search" | "data" | "title">, ActiveBase {}
/**
 * Injects a signal of the deepest active generated route in the primary outlet.
 *
 * @remarks
 * Call in an Angular injection context. The value changes only when a navigation
 * commits, and is undefined before the first one or when no route of this set is
 * active. A route keeps its handle while it stays active; each call is its own reader.
 */
export function injectActiveRoute(): Signal<ActiveRoute | undefined> {
  return injectGeneratedActiveRoute(getRouteSet());
}
const routeSet: RouteSet = { records: {
"src/routes/+home/route.ts": { definition: () => definition__home_route, owners: ["src/routes/+home/route.ts"] },
"src/routes/handle-only/$id/route.ts": { definition: () => definition_handle_only_$id_route, owners: ["src/routes/handle-only/$id/route.ts"] },
"src/routes/teams/$teamId/items/$id/route.ts": { definition: () => definition_teams_$teamId_items_$id_route, owners: ["src/routes/teams/$teamId/route.ts","src/routes/teams/$teamId/items/$id/route.ts"] },
"src/routes/teams/$teamId/route.ts": { definition: () => definition_teams_$teamId_route, owners: ["src/routes/teams/$teamId/route.ts"] },
}, destinations: {
"src/routes/+home/route.ts": () => definition__home_route,
"src/routes/handle-only/$id/route.ts": () => definition_handle_only_$id_route,
"src/routes/teams/$teamId/items/$id/route.ts": () => definition_teams_$teamId_items_$id_route,
"src/routes/teams/$teamId/old-items/$id/route.ts": () => definition_teams_$teamId_old_items_$id_route,
"src/routes/teams/$teamId/route.ts": () => definition_teams_$teamId_route,
}, absolute: {
"/": "src/routes/+home/route.ts",
"/handle-only/$id": "src/routes/handle-only/$id/route.ts",
"/teams/$teamId/items/$id": "src/routes/teams/$teamId/items/$id/route.ts",
"/teams/$teamId/old-items/$id": "src/routes/teams/$teamId/old-items/$id/route.ts",
"/teams/$teamId": "src/routes/teams/$teamId/route.ts",
}, parents: {
"src/routes/handle-only/$id/route.ts": "src/routes/+home/route.ts",
"src/routes/teams/$teamId/items/$id/route.ts": "src/routes/teams/$teamId/route.ts",
"src/routes/teams/$teamId/route.ts": "src/routes/+home/route.ts",
} };
export function getRouteSet(): RouteSet { return routeSet; }
