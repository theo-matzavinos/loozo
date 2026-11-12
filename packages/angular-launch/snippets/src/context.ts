import { defineContext } from "@loozo/angular-launch/server";
import { sessions } from "./sessions.server.js";
import { todos } from "./todos.server.js";

export default defineContext(async (request: Request) => ({
  request,
  todos,
  user: await sessions.authenticate(request),
}));
