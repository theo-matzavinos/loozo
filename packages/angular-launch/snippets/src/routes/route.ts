import { defineRoute } from "@loozo/angular-launch";
import { sessions } from "../sessions.server.js";
import { todos } from "../todos.server.js";

export default defineRoute("", {}).context(async ({ request }) => ({
  todos,
  user: await sessions.authenticate(request),
}));
