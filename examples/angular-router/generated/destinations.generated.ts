// @loozo/angular-router routegen: owned destinations.generated.ts
import type { RouteSet, Handle as GeneratedHandle, Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition0 from "../src/routes/+home/route.js";

export type Definitions = {
"src/routes/+home/route.ts": typeof definition0;
};
declare const setIdentity: unique symbol;
export type AbsoluteTargets = {
"/": "src/routes/+home/route.ts";
};
export type RelativeTargets = {
"src/routes/+home/route.ts": {
"./": "src/routes/+home/route.ts";
};
};
export type Selected<Id extends keyof RelativeTargets> = {
  readonly [Expression in keyof AbsoluteTargets | keyof RelativeTargets[Id]]:
    Definitions[(Expression extends keyof AbsoluteTargets ? AbsoluteTargets[Expression] :
      Expression extends keyof RelativeTargets[Id] ? RelativeTargets[Id][Expression] : never) & keyof Definitions];
};
/** A declaration-bound handle; obtain it through its colocated injectRoute facade. */
export type Handle<Id extends keyof RelativeTargets> = GeneratedHandle<Definitions[Id], Selected<Id>, typeof setIdentity, Pick<Definitions, keyof RelativeTargets>>;
/** A same-set nominal reference; use the destination exported by a colocated facade. */
export type Destination<Id extends keyof RelativeTargets> = GeneratedDestination<Definitions[Id], typeof setIdentity, Id>;
const routeSet: RouteSet = { records: {
"src/routes/+home/route.ts": { definition: () => definition0, owners: ["src/routes/+home/route.ts"] },
}, destinations: {
"src/routes/+home/route.ts": () => definition0,
}, absolute: {"/":"src/routes/+home/route.ts"}, relative: {"src/routes/+home/route.ts":{"./":"src/routes/+home/route.ts"}} };
export function getRouteSet(): RouteSet { return routeSet; }
