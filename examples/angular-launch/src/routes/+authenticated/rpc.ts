import { defineRpc, query } from "@loozo/angular-launch/server";
import { isSignedIn, requireUser } from "../../auth.server";
export default defineRpc(
  "session",
  {
    current: query({
      handler: ({ context }) => ({ user: requireUser(context).id, requestId: context.requestId }),
    }),
  },
  { canActivate: [isSignedIn] },
);
