import { defineRpc, mutation, query } from "@loozo/angular-launch/server";
import { isSignedIn, requireUser } from "../../../auth.server";
import { idSchema, titleSchema } from "../../../todo-input.server";
export default defineRpc(
  "todos",
  {
    list: query({
      handler: async ({ context }) => {
        const user = requireUser(context);

        // Loopback proof fixture for the generic unexpected-failure boundary.
        if (context.failing) {
          throw new Error("Private database failure fixture");
        }

        if (new URL(context.request.url).pathname.startsWith("/_rpc/")) {
          context.stats.httpQueries += 1;
        } else {
          context.stats.directQueries += 1;
        }

        return {
          user: user.id,
          requestId: context.requestId,
          todos: await context.db.todos.listForUser(user.id, context.delayed),
        };
      },
    }),
    add: mutation({
      input: titleSchema,
      handler: ({ input, context }) =>
        context.db.todos.addForUser(requireUser(context).id, input.title),
    }),
    complete: mutation({
      input: idSchema,
      errors: {
        NOT_FOUND: { status: 404, message: "Todo does not exist", data: idSchema },
      },
      handler: async ({ input, context, errors }) => {
        const todo = await context.db.todos.completeForUser(requireUser(context).id, input.id);

        if (todo === null) {
          throw errors.NOT_FOUND({ id: input.id });
        }

        return todo;
      },
    }),
  },
  { canActivate: [isSignedIn] },
);
