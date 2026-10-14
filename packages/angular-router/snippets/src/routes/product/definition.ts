import { defineRoute, enumParam, numberParam, optionalSearchParam } from "@loozo/angular-router";

export default defineRoute("products/$productId", {
  params: { productId: numberParam },
  search: { tab: optionalSearchParam(enumParam(["details", "reviews"])) },
  fragments: ["summary", "reviews"],
});
