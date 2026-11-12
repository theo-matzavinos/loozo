import { forbidden, middleware } from "@loozo/angular-launch/server";

export const signedIn = middleware(async ({ context, next }) => {
  if (context.user === null) {
    throw forbidden();
  }

  return next({ user: context.user });
});
