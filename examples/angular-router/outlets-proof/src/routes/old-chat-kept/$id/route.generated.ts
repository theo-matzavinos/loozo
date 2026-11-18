import { defineRoute } from "@loozo/angular-router";
import { destination as chat } from "../../chat/$id/destination.generated.js";

// A redirect into a root-level branch that keeps the source's query and fragment.
/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */ const routegen$route = routegen$routeOf(defineRoute, routegen$destination).redirect({
  to: chat,
  search: { mode: "preserve" },
  fragment: { mode: "preserve" },
});
import { routeOf as routegen$routeOf } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
export { routegen$route as route };
// @loozo/angular-router routegen: owned route.generated.ts
