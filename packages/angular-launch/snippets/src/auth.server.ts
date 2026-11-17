import { forbidden, type StageArgs } from "@loozo/angular-launch/server";
import type { Context } from "./routes/route.generated.js";

export function signedIn({ context }: StageArgs<Context>) {
  if (context.user === null) {
    throw forbidden();
  }

  return { ...context, user: context.user };
}
