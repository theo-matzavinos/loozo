import { defineRoute, stringParam } from "@loozo/angular-router";
import packageRoute from "../definition.js";

export default defineRoute("api/$symbol", {
  parent: packageRoute,
  params: { symbol: stringParam },
});
