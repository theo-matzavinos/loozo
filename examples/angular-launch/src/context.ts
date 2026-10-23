import { defineContext } from "@loozo/angular-launch/server";
import { db, stats, serverOnlySentinel } from "./database.server";

// Test-only cookie identity. Not authentication or deployment guidance.
export default defineContext(async (request: Request) => {
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)proof-user=(alice|bob)(?:;|$)/.exec(cookie);
  let user: { id: string } | null = null;

  if (match) {
    user = { id: match[1] };
  }

  stats.contexts += 1;

  const rpc = new URL(request.url).pathname.startsWith("/_rpc/");

  return {
    request,
    user,
    requestId: stats.contexts,
    db,
    stats,
    serverOnlySentinel,
    delayed: cookie.includes("proof-delay=1"),
    // proof-ssr-failure fails only server rendering, so the browser's own call succeeds.
    failing: cookie.includes("proof-failure=1") || (cookie.includes("proof-ssr-failure=1") && !rpc),
  };
});
