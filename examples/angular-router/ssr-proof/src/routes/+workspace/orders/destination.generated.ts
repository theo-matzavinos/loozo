import {

  numberParam,
  remembered,
  retained,
  withFallback,
} from "@loozo/angular-router";
import { destination as workspace } from "../destination.generated.js";


// The page size is retained by links and remembered between visits. Its rows and title read the
// page size, so they rerun when only the query changes, such as when the page size is cleared.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("orders", {
  parent: workspace,
  search: { pageSize: retained(remembered(withFallback(numberParam, 20), "orders.pageSize")) },
}, "src/routes/+workspace/orders/route.ts")












;
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
