import { destination as report } from "../../../../reports/$reportId/destination.generated.js";
import { destination as item } from "./destination.generated.js";
import { injectRoute } from "./route.generated.js";

// injectRoute() needs an injection context, such as a component field initializer.
export function itemLinks() {
  const route = injectRoute();

  route.link({ params: { teamId: 7, id: 8 } }); // this route
  route.link({ to: item, params: { teamId: 7, id: 9 } }); // a destination
  route.link({ to: "..", params: { teamId: 7 } }); // parent route
  void route.navigate({ to: report, params: { reportId: 42 } }); // another route's destination

  // Angular's navigation behavior options go in the same object, for navigate only.
  void route.navigate({ params: { teamId: 7, id: 8 }, search: { score: 10 }, replaceUrl: true });
}
