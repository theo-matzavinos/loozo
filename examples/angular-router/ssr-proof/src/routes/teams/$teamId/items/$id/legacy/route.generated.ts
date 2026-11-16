import { defineRoute } from "@loozo/angular-router";
import { route as item } from "../route.generated.js";
import { destination as handleOnly } from "../../../../../handle-only/$id/destination.generated.js";

// A redirect two declarations below the teams/$teamId group root: its hoisted record loads its
// route copy on first use. items/$id keeps a plain record, since its only child is a redirect.
/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */ const routegen$route = routegen$routeOf(defineRoute, routegen$destination, item).redirect({
  to: handleOnly,
  params: { id: "id" },
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
import { routeOf as routegen$routeOf } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
export { routegen$route as route };
// @loozo/angular-router routegen: owned route.generated.ts
