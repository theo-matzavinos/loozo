import { defineContext } from "@loozo/angular-launch/server";
import { db, stats, serverOnlySentinel } from "./database.server";

// Test-only cookie identity. Not authentication or deployment guidance.
export default defineContext(async (request: Request) => {
  const match = /(?:^|;\s*)proof-user=(alice|bob)(?:;|$)/.exec(request.headers.get("cookie") ?? "");
  let user: { id: string } | null = null;

  if (match) {
    user = { id: match[1] };
  }

  stats.contexts += 1;

  return {
    request,
    user,
    requestId: stats.contexts,
    db,
    stats,
    serverOnlySentinel,
    delayed: request.headers.get("cookie")?.includes("proof-delay=1") === true,
    failing: request.headers.get("cookie")?.includes("proof-failure=1") === true,
  };
});
