import { enumParam, remembered } from "@loozo/angular-router";

// The layout is remembered per tab (session storage): a server-rendered page shows the default
// until the browser restores it.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("products", {
  search: {
    sort: enumParam(["name", "price"]),
    view: remembered(enumParam(["grid", "table"]), "products.view"),
  },
}, "src/routes/products/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
