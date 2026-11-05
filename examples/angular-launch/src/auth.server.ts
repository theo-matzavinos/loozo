import { createUrl } from "@loozo/angular-router";
import { forbidden, middleware, redirect } from "@loozo/angular-launch/server";
import signIn from "./routes/sign-in/route";

// Refuses calls without a user, and narrows `user` for everything after it.
export const signedIn = middleware(async ({ context, next }) => {
  context.stats.signedInChecks += 1;

  if (context.user === null) {
    throw forbidden();
  }

  return next({ user: context.user });
});

// For reads that pages load while navigating: sends visitors without a user to sign in.
export const signInFirst = middleware(async ({ context, next }) => {
  if (context.user === null) {
    throw redirect(createUrl(signIn, {}));
  }

  return next({ user: context.user });
});
