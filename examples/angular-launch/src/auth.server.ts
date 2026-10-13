import type { Context, Guard } from "@loozo/angular-launch/server";

export const isSignedIn: Guard = ({ context }) => {
  context.stats.groupGuards += 1;

  return context.user !== null;
};

export function requireUser(context: Context): { id: string } {
  if (context.user === null) {
    throw new Error("User required");
  }

  return context.user;
}
