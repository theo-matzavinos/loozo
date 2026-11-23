import { enumParam, remembered, retained, withFallback } from "@loozo/angular-router";
import { defineRoute } from "@loozo/angular-launch";
import { redirect } from "@loozo/angular-launch/server";
import { timing } from "../../timing.server";
import parent from "../route";
import { destination as signIn } from "../sign-in/destination.generated";

// Pages that load their data while navigating: a call without a user is sent to sign in,
// and every procedure below sees `user` narrowed. Their list density follows every link and
// comes back on the next visit.
export default defineRoute("", {
  parent,
  search: {
    density: retained(
      remembered(
        withFallback(enumParam(["comfortable", "compact"]), "comfortable"),
        "layout.density",
      ),
    ),
  },
})
  .context(({ context }) => {
    context.stats.signedInChecks += 1;

    if (context.user === null) {
      throw redirect(signIn, {});
    }

    return { ...context, user: context.user };
  })
  .use(timing)
  .remote(({ query }) => ({
    session: {
      current: query({
        handler: ({ context, response }) => {
          // Test-only: records which context answered. During server rendering the cookie
          // goes on the page response.
          response.setCookie("proof-seen", String(context.requestId));

          return { user: context.user.id, requestId: context.requestId };
        },
      }),
    },
  }));
