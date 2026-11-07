import { defineRpc } from "@loozo/angular-launch/server";
import { signedIn } from "../../../auth.server";
import { idSchema, titleSchema } from "../../../todo-input.server";
export default defineRpc(
  "todos",
  ({ query, mutation }) => ({
    list: query({
      handler: async ({ context, request, signal }) => {
        // Loopback proof fixture for the generic unexpected-failure boundary.
        if (context.failing) {
          throw new Error("Private database failure fixture");
        }

        if (new URL(request.url).pathname.startsWith("/_rpc/")) {
          context.stats.httpQueries += 1;
        } else {
          context.stats.directQueries += 1;
        }

        const todos = await context.db.todos.listForUser(context.user.id, context.delayed);

        // The read isn't cancellable; record that the caller went away meanwhile.
        if (signal.aborted) {
          context.stats.abortedQueries += 1;
        }

        return { user: context.user.id, requestId: context.requestId, todos };
      },
    }),
    add: mutation({
      input: titleSchema,
      handler: ({ input, context }) => context.db.todos.addForUser(context.user.id, input.title),
    }),
    complete: mutation({
      input: idSchema,
      errors: {
        NOT_FOUND: { status: 404, message: "Todo does not exist", data: idSchema },
      },
      handler: async ({ input, context, errors }) => {
        const todo = await context.db.todos.completeForUser(context.user.id, input.id);

        if (todo === null) {
          throw errors.NOT_FOUND({ id: input.id });
        }

        return todo;
      },
    }),
    remove: mutation({
      input: idSchema,
      errors: {
        NOT_FOUND: { status: 404, message: "Todo does not exist", data: idSchema },
      },
      handler: async ({ input, context, errors }) => {
        const removed = await context.db.todos.removeForUser(context.user.id, input.id);

        if (!removed) {
          throw errors.NOT_FOUND({ id: input.id });
        }

        return { id: input.id };
      },
    }),
  }),
  { use: [signedIn] },
);
