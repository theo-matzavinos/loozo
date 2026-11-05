// @loozo/angular-router routegen: owned destinations.generated.ts
import type { RouteSet, Handle as GeneratedHandle, Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition__home_route from "../src/routes/+home/route.js";

export type Definitions = {
"src/routes/+home/route.ts": typeof definition__home_route;
};
declare const setIdentity: unique symbol;
export type AbsoluteTargets = {
"/": "src/routes/+home/route.ts";
};
export type Parents = {
};
/** Declarations with a colocated facade. */
export type Retained =
| "src/routes/+home/route.ts"
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
}, destinations: {
"src/routes/+home/route.ts": () => definition__home_route,
}, absolute: {
"/": "src/routes/+home/route.ts",
}, parents: {
} };
export function getRouteSet(): RouteSet { return routeSet; }
