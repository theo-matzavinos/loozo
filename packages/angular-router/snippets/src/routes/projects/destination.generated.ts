import { enumParam, retained } from "@loozo/angular-router";

/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("projects", {
  search: { view: retained(enumParam(["list", "board"])) },
}, "src/routes/projects/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
