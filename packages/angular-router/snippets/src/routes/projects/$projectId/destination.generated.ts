import { numberParam } from "@loozo/angular-router";
import { destination as projects } from "../destination.generated.js";

/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("$projectId", {
  parent: projects,
  params: { projectId: numberParam },
}, "src/routes/projects/$projectId/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
