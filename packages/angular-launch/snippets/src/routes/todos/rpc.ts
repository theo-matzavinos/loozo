import { defineRpc } from "@loozo/angular-launch/server";
import { signedIn } from "../../auth.server.js";
import { idSchema } from "../../todo-input.js";

export default defineRpc(
  "todos",
  ({ query, mutation }) => ({
    list: query({
      handler: ({ context }) => context.todos.listForUser(context.user.id),
    }),
    complete: mutation({
      input: idSchema,
      errors: {
        NOT_FOUND: { status: 404, message: "Todo does not exist", data: idSchema },
      },
      handler: async ({ input, context, errors }) => {
        const todo = await context.todos.completeForUser(context.user.id, input.id);

        if (todo === null) {
          throw errors.NOT_FOUND({ id: input.id });
        }

        return todo;
      },
    }),
  }),
  { use: [signedIn] },
);
