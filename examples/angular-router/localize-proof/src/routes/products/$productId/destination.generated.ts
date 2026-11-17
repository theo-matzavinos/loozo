import { numberParam } from "@loozo/angular-router";

/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("products/$productId", { params: { productId: numberParam } }, "src/routes/products/$productId/route.ts", [$localize`:URL path segment|One segment of page URLs, without "/". Changing it changes links and bookmarks.@@route.segment.products:products`]);
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
