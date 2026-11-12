// @loozo/angular-router routegen: owned destinations.generated.ts
import type { Signal } from '@angular/core';
import { injectGeneratedActiveRoute, type RouteSet, type Handle as GeneratedHandle, type Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import definition_$package__overview_route from "../src/routes/$package/+overview/route.js";
import definition_$package_api_$symbol_route from "../src/routes/$package/api/$symbol/route.js";
import definition_$package_generated_api_route from "../src/routes/$package/generated-api/route.js";
import definition_$package_guide_$guide_route from "../src/routes/$package/guide/$guide/route.js";
import definition_$package_route from "../src/routes/$package/route.js";
import definition_$segments___route from "../src/routes/$segments[]/route.js";
import definition__home_route from "../src/routes/+home/route.js";

export type Definitions = {
"src/routes/$package/+overview/route.ts": typeof definition_$package__overview_route;
"src/routes/$package/api/$symbol/route.ts": typeof definition_$package_api_$symbol_route;
"src/routes/$package/generated-api/route.ts": typeof definition_$package_generated_api_route;
"src/routes/$package/guide/$guide/route.ts": typeof definition_$package_guide_$guide_route;
"src/routes/$package/route.ts": typeof definition_$package_route;
"src/routes/$segments[]/route.ts": typeof definition_$segments___route;
"src/routes/+home/route.ts": typeof definition__home_route;
};
declare const setIdentity: unique symbol;
export type AbsoluteTargets = {
"/$package": "src/routes/$package/+overview/route.ts";
"/$package/api/$symbol": "src/routes/$package/api/$symbol/route.ts";
"/$package/generated-api": "src/routes/$package/generated-api/route.ts";
"/$package/guide/$guide": "src/routes/$package/guide/$guide/route.ts";
"/$segments[]": "src/routes/$segments[]/route.ts";
"/": "src/routes/+home/route.ts";
};
export type Parents = {
"src/routes/$package/+overview/route.ts": "src/routes/+home/route.ts";
"src/routes/$package/api/$symbol/route.ts": "src/routes/$package/+overview/route.ts";
"src/routes/$package/generated-api/route.ts": "src/routes/$package/+overview/route.ts";
"src/routes/$package/guide/$guide/route.ts": "src/routes/$package/+overview/route.ts";
"src/routes/$package/route.ts": "src/routes/+home/route.ts";
"src/routes/$segments[]/route.ts": "src/routes/+home/route.ts";
};
/** Declarations with a colocated facade. */
export type Retained =
| "src/routes/$package/+overview/route.ts"
| "src/routes/$package/api/$symbol/route.ts"
| "src/routes/$package/generated-api/route.ts"
| "src/routes/$package/guide/$guide/route.ts"
| "src/routes/$package/route.ts"
| "src/routes/$segments[]/route.ts"
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
/** An active route before narrowing: params, search and data read as the union of the set's values; link and navigate need is(). */
export interface ActiveRoute extends Pick<Handle<Retained>, "params" | "search" | "data">, ActiveBase {}
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
"src/routes/$package/+overview/route.ts": { definition: () => definition_$package__overview_route, owners: ["src/routes/$package/route.ts","src/routes/$package/+overview/route.ts"] },
"src/routes/$package/api/$symbol/route.ts": { definition: () => definition_$package_api_$symbol_route, owners: ["src/routes/$package/route.ts","src/routes/$package/api/$symbol/route.ts"] },
"src/routes/$package/generated-api/route.ts": { definition: () => definition_$package_generated_api_route, owners: ["src/routes/$package/route.ts","src/routes/$package/generated-api/route.ts"] },
"src/routes/$package/guide/$guide/route.ts": { definition: () => definition_$package_guide_$guide_route, owners: ["src/routes/$package/route.ts","src/routes/$package/guide/$guide/route.ts"] },
"src/routes/$package/route.ts": { definition: () => definition_$package_route, owners: ["src/routes/$package/route.ts"] },
"src/routes/$segments[]/route.ts": { definition: () => definition_$segments___route, owners: ["src/routes/$segments[]/route.ts"] },
"src/routes/+home/route.ts": { definition: () => definition__home_route, owners: ["src/routes/+home/route.ts"] },
}, destinations: {
"src/routes/$package/+overview/route.ts": () => definition_$package__overview_route,
"src/routes/$package/api/$symbol/route.ts": () => definition_$package_api_$symbol_route,
"src/routes/$package/generated-api/route.ts": () => definition_$package_generated_api_route,
"src/routes/$package/guide/$guide/route.ts": () => definition_$package_guide_$guide_route,
"src/routes/$package/route.ts": () => definition_$package_route,
"src/routes/$segments[]/route.ts": () => definition_$segments___route,
"src/routes/+home/route.ts": () => definition__home_route,
}, absolute: {
"/$package": "src/routes/$package/+overview/route.ts",
"/$package/api/$symbol": "src/routes/$package/api/$symbol/route.ts",
"/$package/generated-api": "src/routes/$package/generated-api/route.ts",
"/$package/guide/$guide": "src/routes/$package/guide/$guide/route.ts",
"/$segments[]": "src/routes/$segments[]/route.ts",
"/": "src/routes/+home/route.ts",
}, parents: {
"src/routes/$package/+overview/route.ts": "src/routes/+home/route.ts",
"src/routes/$package/api/$symbol/route.ts": "src/routes/$package/+overview/route.ts",
"src/routes/$package/generated-api/route.ts": "src/routes/$package/+overview/route.ts",
"src/routes/$package/guide/$guide/route.ts": "src/routes/$package/+overview/route.ts",
"src/routes/$package/route.ts": "src/routes/+home/route.ts",
"src/routes/$segments[]/route.ts": "src/routes/+home/route.ts",
} };
export function getRouteSet(): RouteSet { return routeSet; }
