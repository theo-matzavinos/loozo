// @loozo/angular-router routegen: owned destinations.generated.ts
import type { Signal } from '@angular/core';
import { injectGeneratedActiveRoute, type RouteSchema, type Handle as GeneratedHandle, type Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import { route as route_products_$productId_route } from "../src/routes/products/$productId/route.generated.js";
import { route as route_reports_$reportId_route } from "../src/routes/reports/$reportId/route.generated.js";
import { route as route_teams_$teamId_items_$id_route } from "../src/routes/teams/$teamId/items/$id/route.generated.js";
import { route as route_teams_$teamId_members_$memberId_route } from "../src/routes/teams/$teamId/members/$memberId/route.generated.js";
import { route as route_teams_$teamId_route } from "../src/routes/teams/$teamId/route.generated.js";
import { destination as up_teams_$teamId_route } from "../src/routes/teams/$teamId/destination.generated.js";

export type Definitions = {
"src/routes/products/$productId/route.ts": RouteSchema<typeof route_products_$productId_route>;
"src/routes/reports/$reportId/route.ts": RouteSchema<typeof route_reports_$reportId_route>;
"src/routes/teams/$teamId/items/$id/route.ts": RouteSchema<typeof route_teams_$teamId_items_$id_route>;
"src/routes/teams/$teamId/members/$memberId/route.ts": RouteSchema<typeof route_teams_$teamId_members_$memberId_route>;
"src/routes/teams/$teamId/route.ts": RouteSchema<typeof route_teams_$teamId_route>;
};
/** Each retained route's ".." destination, where it has one. */
export type Parents = {
"src/routes/teams/$teamId/items/$id/route.ts": typeof up_teams_$teamId_route;
"src/routes/teams/$teamId/members/$memberId/route.ts": typeof up_teams_$teamId_route;
};
/** Declarations with a generated route record. */
export type Retained =
| "src/routes/products/$productId/route.ts"
| "src/routes/reports/$reportId/route.ts"
| "src/routes/teams/$teamId/items/$id/route.ts"
| "src/routes/teams/$teamId/members/$memberId/route.ts"
| "src/routes/teams/$teamId/route.ts"
;
type ParentOf<Id extends Retained> = Id extends keyof Parents ? Parents[Id] : never;
/** A declaration-bound handle; obtain it through its colocated injectRoute. */
export type Handle<Id extends Retained> = GeneratedHandle<Definitions[Id], ParentOf<Id>>;
interface ActiveBase {
  /** Exactly this route, not an ancestor. Narrows to that route's handle. */
  is<Other extends Retained>(destination: GeneratedDestination<any, Other>): this is ActiveHandle<Other>;
  /** This route or one of its active ancestors. */
  contains(destination: GeneratedDestination<any, Retained>): boolean;
  /** Active generated routes, top-level first, ending with this one. */
  readonly chain: readonly ActiveRoute[];
}
/** An active route narrowed by is(): that declaration's handle. */
export interface ActiveHandle<Id extends Retained> extends Handle<Id>, ActiveBase {}
/** An active route before narrowing: params, search, data and title read as the union of the tree's values; link and navigate need is(). */
export interface ActiveRoute extends Pick<Handle<Retained>, "params" | "search" | "data" | "title">, ActiveBase {}
/**
 * Injects a signal of the deepest active generated route in the primary outlet.
 *
 * @remarks
 * Call in an Angular injection context. The value changes only when a navigation
 * commits, and is undefined before the first one or when no route of this tree is
 * active. A route keeps its handle while it stays active; each call is its own reader.
 */
export function injectActiveRoute(): Signal<ActiveRoute | undefined> {
  // Built inside the call: nothing is read while this module evaluates.
  return injectGeneratedActiveRoute({
"src/routes/products/$productId/route.ts": [route_products_$productId_route],
"src/routes/reports/$reportId/route.ts": [route_reports_$reportId_route],
"src/routes/teams/$teamId/items/$id/route.ts": [route_teams_$teamId_items_$id_route, up_teams_$teamId_route],
"src/routes/teams/$teamId/members/$memberId/route.ts": [route_teams_$teamId_members_$memberId_route, up_teams_$teamId_route],
"src/routes/teams/$teamId/route.ts": [route_teams_$teamId_route],
  });
}
