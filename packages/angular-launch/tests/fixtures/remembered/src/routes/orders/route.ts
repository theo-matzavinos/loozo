import { numberParam, remembered, stringParam, withFallback } from "@loozo/angular-router";
import { defineRoute } from "@loozo/angular-launch";
import { notFound } from "@loozo/angular-launch/server";
import { calls, filterSchema } from "../../fixture.server";

const filters = new Set(["all", "open"]);

// The recoverable case: the remembered filter reaches the handler as validated input, and a
// filter that no longer exists is not found.
export default defineRoute("orders", {
  search: {
    filter: remembered(withFallback(stringParam, "all"), "orders.filter"),
    pageSize: remembered(withFallback(numberParam, 20), "orders.pageSize"),
  },
})
  .remote(({ query }) => ({
    orders: {
      read: query({
        input: filterSchema,
        handler: ({ input, response }) => {
          calls.push({ kind: "handler", page: "orders", filter: input.filter });
          response.setCookie("launch-own", "set", { secure: false });

          if (!filters.has(input.filter)) {
            throw notFound();
          }

          return { filter: input.filter, pageSize: input.pageSize };
        },
      }),
    },
  }))
  .resolve({
    orders: ({ remote, search }) =>
      remote.orders.read({ filter: search.filter, pageSize: search.pageSize }),
  });
