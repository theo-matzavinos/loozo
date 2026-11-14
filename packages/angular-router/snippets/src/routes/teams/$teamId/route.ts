import { defineRoute, numberParam } from "@loozo/angular-router";

export default defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: { score: numberParam },
}).resolve({
  team: ({ params }) => ({ id: params.teamId, name: `Team ${params.teamId}` }),
});
