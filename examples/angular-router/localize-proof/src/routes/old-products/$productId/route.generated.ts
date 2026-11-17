import { defineRoute } from "@loozo/angular-router";
import { route as parent } from "../route.generated.js";
import { destination as product } from "../../products/$productId/destination.generated.js";

/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */ const routegen$route = routegen$routeOf(defineRoute, routegen$destination, parent).redirect({
  to: product,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
import { routeOf as routegen$routeOf } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
export { routegen$route as route };
// @loozo/angular-router routegen: owned route.generated.ts
