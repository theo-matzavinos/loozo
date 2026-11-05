import { defineRpc } from "@loozo/angular-launch/server";
import { signedIn } from "../../auth.server";
export default defineRpc(
  "session",
  ({ query }) => ({
    current: query({
      handler: ({ context }) => ({ user: context.user.id, requestId: context.requestId }),
    }),
  }),
  { use: [signedIn] },
);
