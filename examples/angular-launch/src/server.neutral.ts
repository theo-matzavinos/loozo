import { AngularAppEngine, createRequestHandler } from "@angular/ssr";
import { createRequestScope, handleRequest, handleUpgrade } from "../generated/server.generated";
import { stats } from "./database.server";

// The platform-neutral server entry that runtimes/ hosts on Deno and workerd. Loopback-only, like
// server.ts: one list for pages and RPCs.
const allowedHosts = ["127.0.0.1", "localhost"];
const angular = new AngularAppEngine({ allowedHosts });

export const reqHandler = createRequestHandler(async (request: Request) => {
  // Loopback-only test diagnostics; deliberately not a production server.
  if (new URL(request.url).pathname === "/__proof/stats") {
    return Response.json(stats);
  }

  const rpc = await handleRequest(request, { allowedHosts });

  if (rpc) {
    return rpc;
  }

  const scope = createRequestScope(request);
  const page = await angular.handle(scope.request, scope);

  return page ?? new Response("Not found", { status: 404 });
});

// Channels: the host accepts the websocket that this resolves to.
export function upgrade(request: Request) {
  return handleUpgrade(request, { allowedHosts });
}
