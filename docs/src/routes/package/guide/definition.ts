import { defineRoute, stringParam } from "@loozo/angular-router";
import packageRoute from "../definition.js";

export default defineRoute("guide/$guide", {
  parent: packageRoute,
  params: { guide: stringParam },
});
