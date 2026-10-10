import { defineRoute, numberParam, optionalSearchParam } from "@loozo/angular-router";
import { delayedNumber } from "../../codecs.js";

export default defineRoute("teams/$teamId", {
  params: { teamId: numberParam },
  search: { score: optionalSearchParam(delayedNumber) },
});
