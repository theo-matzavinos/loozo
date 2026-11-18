import { stringParam } from "@loozo/angular-router";

// The root not-found page; Angular SSR needs it to render named-outlet URLs at all.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("$segments[]", { params: { segments: stringParam } }, "src/routes/$segments[]/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
