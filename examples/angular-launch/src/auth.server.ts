import { forbidden, middleware } from "@loozo/angular-launch/server";

// Refuses calls without a user, and narrows `user` for everything after it.
export const signedIn = middleware(async ({ context, next }) => {
  context.stats.signedInChecks += 1;

  if (context.user === null) {
    throw forbidden();
  }

  return next({ user: context.user });
});
