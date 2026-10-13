import { defineContext } from "@loozo/angular-launch/server";

export default defineContext(async (request) => {
  const id = request.headers.get("x-proof-user");
  let user: { id: string } | null = null;

  if (id !== null) {
    user = { id };
  }

  return {
    request,
    user,
    db: {
      async listForUser(userId: string) {
        return [{ id: "1", title: "Design Launch", completed: false, owner: userId }];
      },
    },
  };
});
