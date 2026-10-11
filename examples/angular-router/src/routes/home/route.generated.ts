// @loozo/angular-router routegen: owned route.generated.ts
import { createDestination, injectGeneratedRoute } from '@loozo/angular-router/_generated';
import { getRouteSet, type Destination, type Handle } from "../../../generated/destinations.generated.js";
export { defineRoute } from '@loozo/angular-router';
export const destination: Destination<"src/routes/home/definition.ts"> = createDestination(() => getRouteSet(), "src/routes/home/definition.ts");
export function injectRoute(): Handle<"src/routes/home/definition.ts"> { return injectGeneratedRoute(getRouteSet(), "src/routes/home/definition.ts"); }
