import { destination as report } from "../../reports/$reportId/destination.generated.js";
import { injectRoute } from "./route.generated.js";

// On /projects/7?view=board. injectRoute() needs an injection context.
export function projectLinks() {
  const route = injectRoute();

  route.link({ params: { projectId: 8 } }); // /projects/8?view=board: omitted, so kept
  route.link({ params: { projectId: 8 }, search: { view: "list" } }); // /projects/8?view=list
  route.link({ params: { projectId: 8 }, search: { view: undefined } }); // /projects/8: dropped
  route.link({ to: report, params: { reportId: 42 } }); // /reports/42: not below projects
}
