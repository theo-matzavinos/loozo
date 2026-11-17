import { readCookies } from "@loozo/angular-launch/server";

// Stands in for your session store: the `session` cookie names a signed-in user.
const users = new Map([["alice-session", { id: "alice" }]]);

export const sessions = {
  async authenticate(request: Request): Promise<{ id: string } | null> {
    const token = readCookies(request).get("session");

    if (token === undefined) {
      return null;
    }

    return users.get(token) ?? null;
  },
};
