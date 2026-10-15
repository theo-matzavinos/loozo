import { defineRoute, stringParam } from "@loozo/angular-router";

export default defineRoute("$segments[]", {
  params: { segments: stringParam },
  title: "Page not found · loozo docs",
});
