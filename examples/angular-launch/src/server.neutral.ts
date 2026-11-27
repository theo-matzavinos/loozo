import { AngularAppEngine, createRequestHandler } from "@angular/ssr";
import type { HandleOptions } from "@loozo/angular-launch/server";
import { createRequestScope, handleRequest, handleUpgrade } from "../generated/server.generated";
import { stats } from "./database.server";

// The platform-neutral server entry that runtimes/ hosts on Deno and workerd. Loopback-only, like
// server.ts: one list for pages and RPCs.
const allowedHosts = ["127.0.0.1", "localhost"];
const angular = new AngularAppEngine({ allowedHosts });

// The host's waitUntil, from hosts that cancel a request's work once its client leaves.
type WaitUntil = HandleOptions["waitUntil"];

export async function handle(request: Request, waitUntil?: WaitUntil): Promise<Response> {
  // Loopback-only test diagnostics; deliberately not a production server.
  if (new URL(request.url).pathname === "/__proof/stats") {
    return Response.json(stats);
  }

  const rpc = await handleRequest(request, { allowedHosts, waitUntil });

  if (rpc) {
    return rpc;
  }

  const scope = createRequestScope(request);
  const page = await angular.handle(scope.request, scope);

  return page ?? new Response("Not found", { status: 404 });
}

// For `ng serve` and Deno, which keep a request's work alive.
export const reqHandler = createRequestHandler((request) => handle(request));

// Channels: the host accepts the websocket that this resolves to.
export function upgrade(request: Request, waitUntil?: WaitUntil) {
  return handleUpgrade(request, { allowedHosts, waitUntil });
}
