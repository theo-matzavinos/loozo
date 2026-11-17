import { defineRoute } from "@loozo/angular-launch";
import { readCookies } from "@loozo/angular-launch/server";
import { db, stats, serverOnlySentinel } from "../database.server";

// Test-only cookie identity. Not authentication or deployment guidance. The stage runs once
// per request scope, and only when a call needs it, so `stats.contexts` counts its runs.
export default defineRoute("", {}).context(({ request }) => {
  const cookies = readCookies(request);
  const proofUser = cookies.get("proof-user");
  let user: { id: string } | null = null;

  if (proofUser === "alice" || proofUser === "bob") {
    user = { id: proofUser };
  }

  stats.contexts += 1;

  const rpc = new URL(request.url).pathname.startsWith("/_rpc/");

  return {
    user,
    requestId: stats.contexts,
    db,
    stats,
    serverOnlySentinel,
    delayed: cookies.get("proof-delay") === "1",
    // proof-ssr-failure fails only server rendering, so the browser's own call succeeds.
    failing:
      cookies.get("proof-failure") === "1" || (cookies.get("proof-ssr-failure") === "1" && !rpc),
  };
});
