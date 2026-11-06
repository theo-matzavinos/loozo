import { defineRpc } from "@loozo/angular-launch/server";
import { signInFirst } from "../../auth.server";
import { timing } from "../../timing.server";
export default defineRpc(
  "session",
  ({ query }) => ({
    current: query({
      handler: ({ context, response }) => {
        // Test-only: records which context answered. During server rendering the cookie
        // goes on the page response.
        response.setCookie("proof-seen", String(context.requestId));

        return { user: context.user.id, requestId: context.requestId };
      },
    }),
  }),
  { use: [timing, signInFirst] },
);
