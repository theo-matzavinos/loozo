import { defineRoute } from "@loozo/angular-launch";
import { db, stats, serverOnlySentinel } from "../database.server";

// Test-only cookie identity. Not authentication or deployment guidance. The stage runs once
// per request scope, and only when a call needs it, so `stats.contexts` counts its runs.
export default defineRoute("", {}).context(({ request }) => {
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)proof-user=(alice|bob)(?:;|$)/.exec(cookie);
  let user: { id: string } | null = null;

  if (match) {
    user = { id: match[1] };
  }

  stats.contexts += 1;

  const rpc = new URL(request.url).pathname.startsWith("/_rpc/");

  return {
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
