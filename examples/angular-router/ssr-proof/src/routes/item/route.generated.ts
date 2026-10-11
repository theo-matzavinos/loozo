// @loozo/angular-router routegen: owned route.generated.ts
import { createDestination, injectGeneratedRoute } from '@loozo/angular-router/_generated';
import { getRouteSet, type Destination, type Handle } from "../../../generated/destinations.generated.js";
export { defineRoute } from '@loozo/angular-router';
export const destination: Destination<"src/routes/item/definition.ts"> = createDestination(() => getRouteSet(), "src/routes/item/definition.ts");
export function injectRoute(): Handle<"src/routes/item/definition.ts"> { return injectGeneratedRoute(getRouteSet(), "src/routes/item/definition.ts"); }
