import { defineRoute } from "@loozo/angular-router";
import { destination as item } from "../../products/item/$id/destination.generated.js";

// The query belongs to the primary route: products reads the preserved sort.
/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */ const routegen$route = routegen$routeOf(defineRoute, routegen$destination).redirect({
  to: item,
  search: { mode: "preserve" },
  fragment: { mode: "drop" },
});
import { routeOf as routegen$routeOf } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
export { routegen$route as route };
// @loozo/angular-router routegen: owned route.generated.ts
