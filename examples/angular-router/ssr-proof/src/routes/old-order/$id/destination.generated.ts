import { numberParam } from "@loozo/angular-router";


// A typed redirect into an order: for order 42, which is missing, the not-found page follows.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("old-order/$id", { params: { id: numberParam } }, "src/routes/old-order/$id/route.ts")



;
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
