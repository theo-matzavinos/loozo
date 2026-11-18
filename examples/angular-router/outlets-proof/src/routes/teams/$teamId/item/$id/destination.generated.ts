import { numberParam } from "@loozo/angular-router";
import { destination as parent } from "../../destination.generated.js";

// A branch below a dynamic anchor: teams/$teamId.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("item/$id", { parent, outlet: "detail", params: { id: numberParam } }, "src/routes/teams/$teamId/item/$id/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
