// @loozo/angular-router routegen: owned destinations.generated.ts
import type { Signal } from '@angular/core';
import { injectGeneratedActiveRoute, type RouteSchema, type Handle as GeneratedHandle, type Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import { route as route_$package__overview_route } from "../src/routes/$package/+overview/route.generated.js";
import { route as route_$package_api_$symbol_route } from "../src/routes/$package/api/$symbol/route.generated.js";
import { route as route_$package_generated_api_route } from "../src/routes/$package/generated-api/route.generated.js";
import { route as route_$package_guide_$guide_route } from "../src/routes/$package/guide/$guide/route.generated.js";
import { route as route_$package_route } from "../src/routes/$package/route.generated.js";
import { route as route_$segments___route } from "../src/routes/$segments[]/route.generated.js";
import { route as route__home_route } from "../src/routes/+home/route.generated.js";
import { destination as up__home_route } from "../src/routes/+home/destination.generated.js";
import { destination as up_$package__overview_route } from "../src/routes/$package/+overview/destination.generated.js";

export type Definitions = {
"src/routes/$package/+overview/route.ts": RouteSchema<typeof route_$package__overview_route>;
"src/routes/$package/api/$symbol/route.ts": RouteSchema<typeof route_$package_api_$symbol_route>;
"src/routes/$package/generated-api/route.ts": RouteSchema<typeof route_$package_generated_api_route>;
"src/routes/$package/guide/$guide/route.ts": RouteSchema<typeof route_$package_guide_$guide_route>;
"src/routes/$package/route.ts": RouteSchema<typeof route_$package_route>;
"src/routes/$segments[]/route.ts": RouteSchema<typeof route_$segments___route>;
"src/routes/+home/route.ts": RouteSchema<typeof route__home_route>;
};
/** Each retained route's ".." destination, where it has one. */
export type Parents = {
"src/routes/$package/+overview/route.ts": typeof up__home_route;
"src/routes/$package/api/$symbol/route.ts": typeof up_$package__overview_route;
"src/routes/$package/generated-api/route.ts": typeof up_$package__overview_route;
"src/routes/$package/guide/$guide/route.ts": typeof up_$package__overview_route;
"src/routes/$package/route.ts": typeof up__home_route;
"src/routes/$segments[]/route.ts": typeof up__home_route;
};
/** Declarations with a generated route record. */
export type Retained =
| "src/routes/$package/+overview/route.ts"
| "src/routes/$package/api/$symbol/route.ts"
| "src/routes/$package/generated-api/route.ts"
| "src/routes/$package/guide/$guide/route.ts"
| "src/routes/$package/route.ts"
| "src/routes/$segments[]/route.ts"
| "src/routes/+home/route.ts"
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
"src/routes/$package/+overview/route.ts": [route_$package__overview_route, up__home_route],
"src/routes/$package/api/$symbol/route.ts": [route_$package_api_$symbol_route, up_$package__overview_route],
"src/routes/$package/generated-api/route.ts": [route_$package_generated_api_route, up_$package__overview_route],
"src/routes/$package/guide/$guide/route.ts": [route_$package_guide_$guide_route, up_$package__overview_route],
"src/routes/$package/route.ts": [route_$package_route, up__home_route],
"src/routes/$segments[]/route.ts": [route_$segments___route, up__home_route],
"src/routes/+home/route.ts": [route__home_route],
  });
}
