import {
  numberParam,
  remembered,
  retained,
  stringParam,
  withFallback,
} from "@loozo/angular-router";
import { defineRoute } from "@loozo/angular-launch";
import { notFound } from "@loozo/angular-launch/server";
import { filterSchema, idSchema, titleSchema } from "../../../todo-input.server";
import parent from "../route";

// The list's filters by name. "archived" was one until it was removed, so a remembered
// "archived" no longer exists.
const filters = new Map([
  ["all", "All"],
  ["open", "Open"],
  ["completed", "Completed"],
]);

// The page size and filter follow the page's own links, and come back when the user returns.
export default defineRoute("todos", {
  parent,
  search: {
    pageSize: retained(remembered(withFallback(numberParam, 20), "todos.pageSize")),
    filter: retained(remembered(withFallback(stringParam, "all"), "todos.filter")),
  },
})
  .remote(({ query, mutation }) => ({
    todos: {
      // The remembered filter reaches the server as input, so a filter that no longer exists
      // is not found, and rpcNavigationErrors renders the list with the fallback instead.
      filter: query({
        input: filterSchema,
        handler: ({ input, context }) => {
          const label = filters.get(input.filter);

          context.stats.filterInputs.push(input.filter);

          if (label === undefined) {
            throw notFound();
          }

          return { name: input.filter, label };
        },
      }),
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
    },
  }))
  .resolve({
    session: ({ remote }) => remote.session.current(),
    filter: ({ remote, search }) => remote.todos.filter({ filter: search.filter }),
  })
  .runGuardsAndResolvers("paramsOrQueryParamsChange");
