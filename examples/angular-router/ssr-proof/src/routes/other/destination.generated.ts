import { retained, stringParam } from "@loozo/angular-router";

// An unrelated owner of a retained key with the same name: its value never reaches
// pages below +workspace, nor theirs this subtree.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("other", { search: { workspace: retained(stringParam) } }, "src/routes/other/route.ts")

;
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
