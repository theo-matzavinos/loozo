import { parseJson } from "../json.js";
import { createChannelSocket, type ChannelSocket } from "./channel-socket.js";
import type { ApplicationBinding } from "./application.js";
import {
  createRequestScope,
  crossSiteReason,
  runProcedure,
  failure,
  hostAllowed,
  hostRefusal,
  invalidInput,
  response,
  responseHeaders,
  type HandleOptions,
  type Reply,
} from "./dispatch.js";
import { failureFrame, settleStopped, type StreamStart } from "./event-stream.js";
import { callSettlement, holdCall } from "./hold-call.js";
import { createResponseEffects, type ResponseEffects } from "./response-effects.js";

/**
 * A channel call that passed its checks: the host upgrades the request to a websocket and
 * hands Launch the socket.
 *
 * @remarks
 * Returned by the generated `handleUpgrade`. Send `headers` on the `101` response, then call
 * `accept` with the socket. A call that failed before its handler returned its iterable is an
 * `Upgrade` too: its socket gets the failure frame and closes, so the browser client sees the
 * procedure's own error. `@loozo/angular-launch/node` does all of this for Node servers.
 */
export interface Upgrade {
  /** Headers for the `101` response: the call's headers, and a `Set-Cookie` per cookie. */
  readonly headers: Headers;
  /**
   * Runs the call on the socket the host accepted for this request.
   *
   * @param socket - The accepted socket, open or still connecting. Call this once, before or
   * as the `101` goes out; if the caller left before, close the socket instead.
   */
  readonly accept: (socket: WebSocket) => void;
}

/** The `{ input }` envelope a channel's query carries, or `undefined` when it's malformed. */
function queryEnvelope(url: URL): { readonly input: unknown } | undefined {
  const entries = [...url.searchParams];

  if (entries.length !== 1 || entries[0][0] !== "input") {
    return undefined;
  }

  try {
    return { input: parseJson(entries[0][1]) };
  } catch {
    return undefined;
  }
}

function upgrade(effects: ResponseEffects, accept: (socket: WebSocket) => void): Upgrade {
  return { headers: responseHeaders({}, effects), accept };
}

// A call that failed before it started still upgrades, so the client sees its frame. The socket
// closing, whether after the frame or before it ever opened, ends what's left of the call, such
// as middleware that didn't wait for `next()`.
function refusedUpgrade(effects: ResponseEffects, reply: Reply, channel: ChannelSocket): Upgrade {
  return upgrade(effects, (socket) => {
    function fail(): void {
      socket.send(failureFrame(reply));
      socket.close(1000);
    }

    channel.handOff(socket);

    // Already closed: there's no one to send the frame to.
    if (socket.readyState === 3) {
      return;
    }

    if (socket.readyState === 0) {
      socket.addEventListener("open", fail, { once: true });

      return;
    }

    fail();
  });
}

/**
 * Answers a websocket upgrade request for a channel, or returns `null` for any other
 * request.
 *
 * @remarks
 * Internal: exported only from `@loozo/angular-launch/_server` for the generated
 * `handleUpgrade` in `server.generated.ts`; call that instead.
 *
 * Any path starting with `/_rpc/` is a channel request. Before any stage runs, the
 * request is refused with an HTTP response, as `handleRequest` refuses RPCs: a plain-text 400
 * `Host not allowed` when its hostname isn't in `allowedHosts`; `INVALID_INPUT` with no issues
 * unless it's a `GET` with `Upgrade: websocket` and a query of exactly `input` holding JSON;
 * and `FORBIDDEN` unless it's proven same-origin by `handleRequest`'s rules.
 *
 * A fresh request scope is then created and the call run: `RPC_NOT_FOUND` for a path that
 * isn't a channel, then the owning route's stages and `.use()` middleware, input
 * validation, procedure middleware and the handler, which returns its iterable. From then
 * on the result is an {@link Upgrade} carrying the call's headers and cookies, including
 * the stages'; setting a cookie later throws. A failure before that, including a stage
 * that throws (`INTERNAL`), is an `Upgrade` too, whose socket receives the failure frame
 * and closes with 1000.
 *
 * Until the socket is accepted the call's signal follows `request.signal`; a request that
 * aborts before the handler is reached skips the handler, and one that aborts after it
 * returned its iterable returns that iterator before its body ran. Either way the socket,
 * if accepted, closes without a frame. Afterwards the signal follows the socket closing. The
 * scope's request carries that signal, so stages' `signal` and every `request.signal` end with
 * the socket too.
 *
 * @param application - The application binding.
 * @param request - The upgrade request, as a web `Request`.
 * @param options - The allowed hosts and further allowed origins.
 * @returns A refusal response, the upgrade, or `null` when the path doesn't start with
 * `/_rpc/`.
 */
export async function handleChannelUpgrade(
  application: ApplicationBinding,
  request: Request,
  { allowedHosts, allowedOrigins = [], waitUntil }: HandleOptions,
): Promise<Response | Upgrade | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/_rpc/")) {
    return null;
  }

  if (!hostAllowed(url.hostname, allowedHosts)) {
    return hostRefusal(url.hostname);
  }

  const envelope = queryEnvelope(url);

  if (
    request.method !== "GET" ||
    request.headers.get("upgrade")?.toLowerCase() !== "websocket" ||
    envelope === undefined
  ) {
    return response(invalidInput());
  }

  const crossSite = crossSiteReason(request, allowedOrigins);

  if (crossSite !== undefined) {
    console.error(`Launch refused a cross-origin RPC: ${crossSite}`);

    return response(failure("FORBIDDEN"));
  }

  const effects = createResponseEffects();
  const continuations: Promise<unknown>[] = [];
  // Work the call's middleware started with `next()` that hasn't ended yet.
  let running = 0;
  const socket = createChannelSocket(request.signal, () => running > 0);
  let reply: Reply;

  try {
    // Stages and `request.signal` follow the call: the request until accept, then the socket.
    const scope = createRequestScope(application, new Request(request, { signal: socket.signal }));
    const started = Promise.withResolvers<StreamStart>();
    const outcome = runProcedure(
      url.pathname,
      envelope,
      scope,
      application,
      scope.request,
      "socket",
      socket.signal,
      effects,
      started.resolve,
      socket.inbox,
      (continuation) => {
        continuations.push(continuation);
        running += 1;

        const ended = () => {
          running -= 1;
        };

        void continuation.then(ended, ended);
      },
    );

    holdCall(waitUntil, callSettlement(outcome, continuations));

    // Failures before the handler returned its iterable are frames on an upgraded socket.
    const first = await Promise.race([outcome, started.promise]);

    if ("iterator" in first) {
      // The 101 carries the cookies; the rest of the call is the channel itself.
      effects.commit();
      socket.start(first, outcome);

      return upgrade(effects, (accepted) => socket.accept(accepted));
    }

    // Middleware that didn't wait for `next()` can still get an iterable after this reply:
    // no socket runs it, so it ends at once and the middleware around it can finish.
    void started.promise.then((late) => settleStopped(late, undefined));

    // The caller left before the handler ran: nobody reads a frame, the socket just closes.
    if (socket.signal.aborted) {
      effects.commit();

      return upgrade(effects, (accepted) => socket.accept(accepted));
    }

    reply = first;
  } catch (error) {
    console.error("Launch request scope failed", error);
    reply = failure("INTERNAL");
  }

  effects.commit();

  return refusedUpgrade(effects, reply, socket);
}
