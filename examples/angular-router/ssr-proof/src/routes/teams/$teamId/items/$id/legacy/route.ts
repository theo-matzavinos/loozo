import { defineRoute } from "@loozo/angular-router";
import item from "../route.js";
import { destination as handleOnly } from "../../../../../handle-only/$id/destination.generated.js";

// A redirect two declarations below the teams/$teamId group root: its hoisted record loads its
// route copy on first use. items/$id keeps a plain record, since its only child is a redirect.
export default defineRoute("legacy", { parent: item }).redirect({
  to: handleOnly,
  params: { id: "id" },
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});
