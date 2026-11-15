import { enumParam, numberParam, withFallback } from "@loozo/angular-router";

/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("products/$productId", {
  params: { productId: numberParam },
  search: { tab: withFallback(enumParam(["details", "reviews"]), "details") },
  fragments: ["summary", "reviews"],
}, "src/routes/products/$productId/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
