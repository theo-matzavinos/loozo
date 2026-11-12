// Stands in for your session store: the `session` cookie names a signed-in user.
const users = new Map([["alice-session", { id: "alice" }]]);

export const sessions = {
  async authenticate(request: Request): Promise<{ id: string } | null> {
    const cookie = request.headers.get("cookie") ?? "";
    const match = /(?:^|;\s*)session=([^;]*)/.exec(cookie);

    if (match === null) {
      return null;
    }

    return users.get(match[1]) ?? null;
  },
};
