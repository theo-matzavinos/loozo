import { defineRoute, numberParam, withFallback } from "@loozo/angular-router";

export default defineRoute("products", { search: { page: withFallback(numberParam, 1) } });
