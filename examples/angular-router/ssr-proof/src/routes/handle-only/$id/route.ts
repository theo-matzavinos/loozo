import { defineRoute, numberParam, withFallback } from "@loozo/angular-router";

export default defineRoute("handle-only/$id", {
  params: { id: numberParam },
  search: { score: numberParam, page: withFallback(numberParam, 1) },
});
