import { defineRoute, numberParam, optionalSearchParam } from "@loozo/angular-router";

export default defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: { score: optionalSearchParam(numberParam) },
});
