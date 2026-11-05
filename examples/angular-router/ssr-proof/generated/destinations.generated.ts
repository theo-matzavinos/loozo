// @loozo/angular-router routegen: owned destinations.generated.ts
import type { RouteSet, Handle as GeneratedHandle, Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition__home_route from "../src/routes/+home/route.js";
import definition_handle_only_$id_route from "../src/routes/handle-only/$id/route.js";
import definition_teams_$teamId_items_$id_route from "../src/routes/teams/$teamId/items/$id/route.js";
import definition_teams_$teamId_old_items_$id_route from "../src/routes/teams/$teamId/old-items/$id/route.js";
import definition_teams_$teamId_route from "../src/routes/teams/$teamId/route.js";

export type Definitions = {
"src/routes/+home/route.ts": typeof definition__home_route;
"src/routes/handle-only/$id/route.ts": typeof definition_handle_only_$id_route;
"src/routes/teams/$teamId/items/$id/route.ts": typeof definition_teams_$teamId_items_$id_route;
"src/routes/teams/$teamId/old-items/$id/route.ts": typeof definition_teams_$teamId_old_items_$id_route;
"src/routes/teams/$teamId/route.ts": typeof definition_teams_$teamId_route;
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
