import { numberParam } from "@loozo/angular-router";
import { destination as team } from "../../destination.generated.js";

/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("members/$memberId", {
  parent: team,
  params: { memberId: numberParam },
}, "src/routes/teams/$teamId/members/$memberId/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
