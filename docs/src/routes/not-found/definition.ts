import { defineRoute, stringParam } from "@loozo/angular-router";

export default defineRoute("$segments[]", {
  params: { segments: stringParam },
});
