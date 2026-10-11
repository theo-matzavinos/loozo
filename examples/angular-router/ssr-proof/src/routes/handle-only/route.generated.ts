// @loozo/angular-router routegen: owned route.generated.ts
import { createDestination, injectGeneratedRoute } from '@loozo/angular-router/_generated';
import { getRouteSet, type Destination, type Handle } from "../../../generated/destinations.generated.js";
export { defineRoute } from '@loozo/angular-router';
export const destination: Destination<"src/routes/handle-only/definition.ts"> = createDestination(() => getRouteSet(), "src/routes/handle-only/definition.ts");
export function injectRoute(): Handle<"src/routes/handle-only/definition.ts"> { return injectGeneratedRoute(getRouteSet(), "src/routes/handle-only/definition.ts"); }
