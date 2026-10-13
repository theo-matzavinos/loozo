import { defineRpc, mutation, query } from "@loozo/angular-launch/server";
import type { Context } from "@loozo/angular-launch/server";
import { idSchema, titleSchema } from "./schemas";

function requireUser(context: Context) {
  if (context.user === null) {
    throw new Error("Authentication required");
  }

  return context.user;
}

export default defineRpc(
  "todos",
  {
    list: query({
      handler: ({ context }) => {
        const user = requireUser(context);

        return context.db.listForUser(user.id);
      },
    }),

    add: mutation({
      input: titleSchema,
      canActivate: [({ input, context }) => input.title.length < 100 && context.user !== null],
      handler: ({ input }) => ({ id: "2", title: input.title, completed: false }),
    }),

    complete: mutation({
      input: idSchema,
      errors: {
        NOT_FOUND: { status: 404, message: "Todo does not exist", data: idSchema },
      },
      handler: ({ input, errors }) => {
        if (input.id !== "1") {
          throw errors.NOT_FOUND({ id: input.id });
        }

        return { id: input.id, title: "Design Launch", completed: true };
      },
    }),
  },
  {
    canActivate: [({ context }) => context.user !== null],
  },
);
