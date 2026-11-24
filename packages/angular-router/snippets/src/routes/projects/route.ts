import { defineRoute, enumParam, retained } from "@loozo/angular-router";

export default defineRoute("projects", {
  search: { view: retained(enumParam(["list", "board"])) },
});
