// @loozo/angular-router routegen: owned route.generated.ts
import { createDestination, injectGeneratedRoute } from '@loozo/angular-router/_generated';
import { getRouteSet, type Destination, type Handle } from "../../../../generated/destinations.generated.js";
export { defineRoute } from '@loozo/angular-router';
/**
 * Inert reference to this exact declaration for same-set handle link/navigate calls.
 * No injection context is required; copies and foreign-set references are invalid.
 * This is not an authored route and cannot be passed to the root createUrl function.
 */
export const destination: Destination<"src/routes/$package/generated-api/route.ts"> = /* @__PURE__ */ createDestination(() => getRouteSet(), "src/routes/$package/generated-api/route.ts");
/**
 * Injects a typed handle bound to this exact generated activated route record.
 *
 * @remarks
 * Call in an Angular injection context. The handle exposes readonly native
 * params/search/data/title Signals and destination-typed link/navigate methods.
 * Data holds the resolver results of this route and its ancestors, a nearer
 * key hiding an ancestor's; native static data and the title stay out. Title
 * is the nearest declared title in the chain, or undefined when none declares one.
 * All navigation values are explicit; current inputs are never reused implicitly.
 *
 * @returns A noncallable handle for this declaration.
 * @throws A synchronous wiring error outside an injection context or when the
 * activated record does not carry this declaration's own generated identity.
 */
export function injectRoute(): Handle<"src/routes/$package/generated-api/route.ts"> { return injectGeneratedRoute(getRouteSet(), "src/routes/$package/generated-api/route.ts"); }
