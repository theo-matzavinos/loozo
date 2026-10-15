import { destination as report } from "../../../../reports/$reportId/route.generated.js";
import { injectRoute } from "./route.generated.js";

// injectRoute() needs an injection context, such as a component field initializer.
export function itemLinks() {
  const route = injectRoute();

  route.link({ params: { teamId: 7, id: 8 } }); // this route
  route.link(".", { params: { teamId: 7, id: 8 } }); // same as above
  route.link("/teams/$teamId/items/$id", { params: { teamId: 7, id: 9 } }); // absolute
  route.link("../..", { params: { teamId: 7 } }); // relative
  void route.navigate(report, { params: { reportId: 42 } }); // another route's destination
}
