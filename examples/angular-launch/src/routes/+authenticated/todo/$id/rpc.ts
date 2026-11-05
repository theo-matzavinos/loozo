import { defineRpc, notFound } from "@loozo/angular-launch/server";
import { signInFirst } from "../../../../auth.server";
import { idSchema } from "../../../../todo-input.server";

export default defineRpc(
  "todo",
  ({ query }) => ({
    get: query({
      input: idSchema,
      handler: async ({ input, context }) => {
        const todo = await context.db.todos.findForUser(context.user.id, input.id);

        // Another user's todo is missing too, so the page can't tell them apart.
        if (todo === null) {
          throw notFound();
        }

        return todo;
      },
    }),
  }),
  { use: [signInFirst] },
);
