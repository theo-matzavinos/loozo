import { defineRoute, optionalSearchParam } from "@loozo/angular-router";
import { delayedNumber } from "../../codecs.js";

export default defineRoute("handle-only/$id", {
  params: { id: delayedNumber },
  search: { score: optionalSearchParam(delayedNumber) },
});
