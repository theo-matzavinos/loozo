import { remembered, stringParam, withFallback } from "@loozo/angular-router";
import { defineRoute } from "@loozo/angular-launch";
import { notFound, readCookies } from "@loozo/angular-launch/server";
import { calls, filterSchema } from "../../fixture.server";

// The stage control: a .context() stage that reads the request refuses the remembered filter.
// Launch keeps a stage's result, refusal included, for the whole request scope, so the
// render's retry gets the same refusal.
export default defineRoute("cached", {
  search: { filter: remembered(withFallback(stringParam, "all"), "cached.filter") },
})
  .context(({ request }) => {
    const refused = readCookies(request).get("search.cached.filter") === "archived";

    calls.push({ kind: "stage", page: "cached", refused });

    if (refused) {
      throw notFound();
    }

    return {};
  })
  .remote(({ query }) => ({
    cached: {
      read: query({
        input: filterSchema,
        handler: ({ input }) => {
          calls.push({ kind: "handler", page: "cached", filter: input.filter });

          return { filter: input.filter };
        },
      }),
    },
  }))
  .resolve({
    cached: ({ remote, search }) => remote.cached.read({ filter: search.filter, pageSize: 20 }),
  });
