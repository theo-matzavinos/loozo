import { defineRoute } from "@loozo/angular-router";
import { route as team } from "../../route.generated.js";
import { destination as item } from "../../items/$id/destination.generated.js";

/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */ const routegen$route = routegen$routeOf(defineRoute, routegen$destination, team)



.redirect({
  to: item,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
import { routeOf as routegen$routeOf } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
export { routegen$route as route };
// @loozo/angular-router routegen: owned route.generated.ts
