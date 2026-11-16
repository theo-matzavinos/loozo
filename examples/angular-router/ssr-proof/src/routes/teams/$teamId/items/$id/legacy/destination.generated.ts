
import { destination as item } from "../destination.generated.js";


// A redirect two declarations below the teams/$teamId group root: its hoisted record loads its
// route copy on first use. items/$id keeps a plain record, since its only child is a redirect.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("legacy", { parent: item }, "src/routes/teams/$teamId/items/$id/legacy/route.ts")




;
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts
