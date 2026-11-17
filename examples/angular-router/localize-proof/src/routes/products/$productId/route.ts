import { defineRoute, numberParam } from "@loozo/angular-router";

export default defineRoute("products/$productId", { params: { productId: numberParam } });
