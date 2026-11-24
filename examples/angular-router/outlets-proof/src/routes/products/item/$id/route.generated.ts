import { defineRoute } from "@loozo/angular-router";
import { route as parent } from "../../route.generated.js";

/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */ const routegen$route = routegen$routeOf(defineRoute, routegen$destination, parent);
import { routeOf as routegen$routeOf, injectGeneratedRoute as routegen$injectGeneratedRoute, type Handle as routegen$Handle } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
export { routegen$route as route };
/**
 * Injects a typed handle bound to this exact generated activated route record.
 *
 * @remarks
 * Call in an Angular injection context. The handle exposes readonly native
 * params/search/data/title Signals and destination-typed link/navigate methods.
 * Data holds the resolver results of this route and its ancestors, a nearer
 * key hiding an ancestor's; native static data and the title stay out. Title
 * is the nearest declared title in the chain, or undefined when none declares one.
 * Navigation values are explicit, except omitted retained search keys; links and
 * navigations compose with the current URL, keeping the named-outlet branches a
 * navigation doesn't touch.
 *
 * @returns A noncallable handle for this declaration.
 * @throws A synchronous wiring error outside an injection context or when the
 * activated record does not carry this declaration's own generated identity.
 */
function routegen$injectRoute(): routegen$Handle<typeof routegen$route> { return routegen$injectGeneratedRoute(routegen$route); }
export { routegen$injectRoute as injectRoute };
// @loozo/angular-router routegen: owned route.generated.ts
