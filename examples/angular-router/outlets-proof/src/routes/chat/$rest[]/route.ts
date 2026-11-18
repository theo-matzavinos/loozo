import { defineRoute, stringParam } from "@loozo/angular-router";

// The chat outlet's not-found panel: the root catchall doesn't cover named outlets.
export default defineRoute("$rest[]", { outlet: "chat", params: { rest: stringParam } });
