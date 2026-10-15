import { defineRoute, numberParam } from "@loozo/angular-router";

export default defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: { score: numberParam },
});
