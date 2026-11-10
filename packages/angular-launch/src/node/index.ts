/// <reference types="node" preserve="true" />
import { STATUS_CODES, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket as NodeWebSocket } from "ws";
import type { Upgrade } from "../server/upgrade.js";
import { upgradeListenerSlot } from "./upgrade-listener-slot.js";

/** Options for {@link createUpgradeHandler}. */
export interface UpgradeHandlerOptions {
  /**
   * The largest message a caller may send, in bytes. A bigger frame closes the socket with
   * 1009, which the browser client reports as a `TypeError`. Defaults to 1 MiB.
   */
  readonly maxPayload?: number;
}

/**
 * A Node `upgrade` listener, for `server.on("upgrade", listener)`.
 *
 * @param request - The upgrade request.
 * @param socket - The request's socket.
 * @param head - The first bytes of the upgraded stream, if any arrived with the request.
 */
export type UpgradeListener = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

const pingMs = 15_000;

// The upgrade request as a web Request. Like Angular's createWebRequestFromNodeRequest by
// default, it trusts no proxy headers: the protocol comes from the socket, the host from Host.
function webRequest(incoming: IncomingMessage, signal: AbortSignal): Request {
  const headers = new Headers();

  for (const [name, value] of Object.entries(incoming.headers)) {
    // HTTP/2 pseudo-headers aren't headers.
    if (name.startsWith(":")) {
      continue;
    }

    if (typeof value === "string") {
      headers.append(name, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    }
  }

  const encrypted = "encrypted" in incoming.socket && incoming.socket.encrypted === true;
  let protocol = "http";

  if (encrypted) {
    protocol = "https";
  }

  return new Request(`${protocol}://${incoming.headers.host}${incoming.url}`, {
    method: incoming.method,
    headers,
    signal,
  });
}

// A refusal on the raw socket: status line, headers, body, then the connection closes.
async function writeResponse(socket: Duplex, response: Response): Promise<void> {
  const body = Buffer.from(await response.arrayBuffer());
  let head = `HTTP/1.1 ${response.status} ${STATUS_CODES[response.status] ?? ""}\r\n`;

  for (const [name, value] of response.headers) {
    if (name !== "content-length" && name !== "connection") {
      head += `${name}: ${value}\r\n`;
    }
  }

  head += `content-length: ${body.length}\r\nconnection: close\r\n\r\n`;

  if (!socket.destroyed) {
    socket.end(Buffer.concat([Buffer.from(head, "latin1"), body]));
  }
}

function ignore(): void {}

// Terminates a socket that didn't answer the previous ping.
function keepAlive(socket: NodeWebSocket): void {
  let alive = true;
  const timer = setInterval(() => {
    if (!alive) {
      socket.terminate();

      return;
    }

    alive = false;
    socket.ping();
  }, pingMs);

  socket.on("pong", () => {
    alive = true;
  });
  socket.on("close", () => clearInterval(timer));
}

/**
 * Creates the Node `upgrade` listener that runs the app's channels.
 *
 * @remarks
 * Create it once, at your server module's top level, and attach it to the HTTP server that
 * serves the app with `server.on("upgrade", listener)`; with Express, to the server
 * `app.listen()` returns.
 *
 * For each upgrade request it builds a web `Request` (the protocol from the socket, the host
 * from `Host`; proxy headers aren't trusted) whose signal aborts when the client leaves before
 * the socket is accepted, and passes it to `handle`. A `null` result leaves the socket to the
 * server's other `upgrade` listeners, such as a dev server's. A `Response` is written to the
 * socket, which then closes. An `Upgrade` is accepted with `ws`, with its headers on the `101`,
 * unless the client already left. Accepted sockets are pinged every 15 s and terminated when
 * they miss the answer.
 *
 * Under `ng serve`, Launch's serve builder forwards `/_rpc/` upgrades to the latest listener
 * created, so attaching it where your built server listens is all the wiring there is.
 *
 * @example
 * ```ts
 * import { createServer } from "node:http";
 * import { createUpgradeHandler } from "@loozo/angular-launch/node";
 * import { handleUpgrade } from "../generated/server.generated";
 *
 * const upgrade = createUpgradeHandler((request) => handleUpgrade(request, { allowedHosts }));
 *
 * if (isMainModule(import.meta.url)) {
 *   const server = createServer(reqHandler).listen(port);
 *
 *   server.on("upgrade", upgrade);
 * }
 * ```
 *
 * @param handle - Answers one upgrade request: the generated `handleUpgrade`, with your
 * options.
 * @param options - The largest message a caller may send.
 * @returns The listener.
 */
export function createUpgradeHandler(
  handle: (request: Request) => Promise<Response | Upgrade | null>,
  { maxPayload = 1024 * 1024 }: UpgradeHandlerOptions = {},
): UpgradeListener {
  const server = new WebSocketServer({ noServer: true, clientTracking: false, maxPayload });
  const accepted = new WeakMap<IncomingMessage, Headers>();

  server.on("headers", (lines: string[], incoming: IncomingMessage) => {
    for (const [name, value] of accepted.get(incoming) ?? []) {
      lines.push(`${name}: ${value}`);
    }
  });

  async function upgrade(incoming: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const leave = new AbortController();

    function left(): void {
      leave.abort(
        new DOMException("The client left before its channel was accepted", "AbortError"),
      );
    }

    // Browsers that leave early send FIN, or the connection resets.
    socket.once("end", left);
    socket.once("close", left);
    socket.on("error", left);

    function release(): void {
      socket.off("end", left);
      socket.off("close", left);
      socket.off("error", left);
    }

    // Nothing else owns a socket Launch closes itself: a reset while it closes must not go
    // unhandled.
    function releaseToClose(): void {
      release();
      socket.on("error", ignore);
      socket.once("close", () => socket.off("error", ignore));
    }

    let result: Response | Upgrade | null;

    try {
      result = await handle(webRequest(incoming, leave.signal));
    } catch (error) {
      console.error("Launch couldn't answer an upgrade request", error);
      result = new Response("Bad request", {
        status: 400,
        headers: { "content-type": "text/plain" },
      });
    }

    if (result === null) {
      release();

      return;
    }

    if (result instanceof Response) {
      releaseToClose();
      await writeResponse(socket, result);

      return;
    }

    if (leave.signal.aborted || socket.destroyed) {
      releaseToClose();
      socket.destroy();

      return;
    }

    const call = result;

    accepted.set(incoming, call.headers);
    // Until accepted, a client leaving still ends the call, also when ws refuses the handshake.
    server.handleUpgrade(incoming, socket, head, (websocket) => {
      release();
      accepted.delete(incoming);
      // A frame over maxPayload or a broken connection emits an error, then the socket closes.
      websocket.on("error", () => undefined);
      keepAlive(websocket);
      // ws implements the WHATWG WebSocket interface Launch uses.
      call.accept(websocket as unknown as WebSocket);
    });
  }

  const listener: UpgradeListener = (incoming, socket, head) => {
    void upgrade(incoming, socket, head);
  };

  // Where `ng serve` finds the app's listener; the latest one created wins.
  (globalThis as Record<symbol, unknown>)[upgradeListenerSlot] = listener;

  return listener;
}
