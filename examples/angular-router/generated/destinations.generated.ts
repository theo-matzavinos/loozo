// @loozo/angular-router routegen: owned destinations.generated.ts
import type { Signal } from '@angular/core';
import { injectGeneratedActiveRoute, type RouteSchema, type Handle as GeneratedHandle, type Destination as GeneratedDestination } from '@loozo/angular-router/_generated';
import { route as route__home_route } from "../src/routes/+home/route.generated.js";

export type Definitions = {
"src/routes/+home/route.ts": RouteSchema<typeof route__home_route>;
};
/** Each retained route's ".." destination, where it has one. */
export type Parents = {
};
/** Declarations with a generated route record. */
export type Retained =
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
"src/routes/+home/route.ts": [route__home_route],
  });
}
