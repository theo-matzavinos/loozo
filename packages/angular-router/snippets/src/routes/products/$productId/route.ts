import { defineRoute, enumParam, numberParam, withFallback } from "@loozo/angular-router";

export default defineRoute("products/$productId", {
  params: { productId: numberParam },
  search: { tab: withFallback(enumParam(["details", "reviews"]), "details") },
  fragments: ["summary", "reviews"],
});
