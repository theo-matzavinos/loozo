import type { BuilderContext } from "@angular-devkit/architect";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { UpgradeListener } from "../node/index.js";
import { upgradeListenerSlot } from "../node/upgrade-listener-slot.js";

/** A connect middleware, as Angular's dev server takes it. */
export type DevServerMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

const unavailableBody = "Channels aren't available: the server module created no upgrade handler\n";
const unavailable =
  "HTTP/1.1 503 Service Unavailable\r\n" +
  "content-type: text/plain\r\n" +
  `content-length: ${Buffer.byteLength(unavailableBody)}\r\n` +
  "connection: close\r\n\r\n" +
  unavailableBody;

function ignore(): void {}

/**
 * The dev server's connect middleware that forwards channel upgrades to the app.
 *
 * Vite's HTTP server hands websocket upgrades to its `upgrade` listeners, never to middleware,
 * so on the first request through a server this attaches one listener to it. That listener passes
 * `/_rpc/` upgrades to the latest listener `createUpgradeHandler` created, which the server
 * module creates at its top level each time Vite loads it, and leaves every other upgrade, such
 * as Vite's HMR socket, to the server's own listeners. Until a listener exists it answers them
 * with a plain-text 503 and warns once. The middleware itself always calls `next()`.
 */
export function forwardChannels(logger: BuilderContext["logger"]): DevServerMiddleware {
  const servers = new WeakSet<EventEmitter>();
  let reportedNoServer = false;
  let reportedNoListener = false;

  function forward(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!request.url?.startsWith("/_rpc/")) {
      return;
    }

    const listener = (globalThis as Record<symbol, UpgradeListener | undefined>)[
      upgradeListenerSlot
    ];

    if (listener !== undefined) {
      listener(request, socket, head);

      return;
    }

    if (!reportedNoListener) {
      reportedNoListener = true;
      logger.warn(
        `A channel upgrade to ${request.url} was answered 503: no createUpgradeHandler listener ` +
          "exists. Create it at your server module's top level; the dev server loads that module " +
          "with the first request it passes to server.ts, such as a page.",
      );
    }

    // A client resetting while the refusal is written must not crash the dev server.
    socket.on("error", ignore);

    if (!socket.destroyed) {
      socket.end(unavailable);
    }
  }

  return (request, _response, next) => {
    // Node records the server that accepted a connection on its socket, undocumented.
    const server: unknown = (request.socket as { server?: unknown }).server;

    if (server instanceof EventEmitter) {
      if (!servers.has(server)) {
        servers.add(server);
        server.on("upgrade", forward);
      }
    } else if (!reportedNoServer) {
      reportedNoServer = true;
      logger.warn(
        "Launch can't forward channel upgrades under this dev server: its requests don't expose " +
          "their HTTP server, so channels won't connect.",
      );
    }

    next();
  };
}
