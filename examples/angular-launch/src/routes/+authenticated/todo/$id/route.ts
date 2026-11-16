import { stringParam } from "@loozo/angular-router";
import { defineRoute } from "@loozo/angular-launch";
import { notFound } from "@loozo/angular-launch/server";
import { idSchema } from "../../../../todo-input.server";
import parent from "../../route";

export default defineRoute("todo/$id", { parent, params: { id: stringParam } })
  .remote(({ query }) => ({
    todo: {
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
    },
  }))
  .resolve({
    todo: ({ params, remote }) => remote.todo.get({ id: params.id }),
  });
