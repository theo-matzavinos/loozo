import { defineRoute } from "@loozo/angular-router";
import { destination as order } from "../../+workspace/orders/$id/destination.generated.js";

// A typed redirect into an order: for order 42, which is missing, the not-found page follows.
/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */ const routegen$route = routegen$routeOf(defineRoute, routegen$destination).redirect({
  to: order,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
import { routeOf as routegen$routeOf } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
export { routegen$route as route };
// @loozo/angular-router routegen: owned route.generated.ts
