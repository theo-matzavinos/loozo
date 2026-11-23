import { remembered, stringParam, withFallback } from "@loozo/angular-router";
import { defineRoute } from "@loozo/angular-launch";
import { notFound } from "@loozo/angular-launch/server";
import { calls, filterSchema } from "../../fixture.server";

// The genuinely missing control: not found at every filter, the fallback included.
export default defineRoute("missing", {
  search: { filter: remembered(withFallback(stringParam, "all"), "missing.filter") },
})
  .remote(({ query }) => ({
    missing: {
      read: query({
        input: filterSchema,
        handler: ({ input }) => {
          calls.push({ kind: "handler", page: "missing", filter: input.filter });

          throw notFound();
        },
      }),
    },
  }))
  .resolve({
    missing: ({ remote, search }) => remote.missing.read({ filter: search.filter, pageSize: 20 }),
  });
