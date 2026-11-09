import { parseJson } from "../json.js";
import { createChannelSocket } from "./channel-socket.js";
import type { ContextDefinition } from "./definitions.js";
import {
  createRequestScope,
  crossSiteReason,
  dispatch,
  failure,
  hostAllowed,
  hostRefusal,
  invalidInput,
  response,
  responseHeaders,
  type ApplicationBinding,
  type HandleOptions,
  type Registry,
  type Reply,
} from "./dispatch.js";
import { failureFrame, type StreamStart } from "./event-stream.js";
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

// A call that failed before it started still upgrades, so the client sees its frame.
function refusedUpgrade(effects: ResponseEffects, reply: Reply): Upgrade {
  return upgrade(effects, (socket) => {
    function fail(): void {
      socket.send(failureFrame(reply));
      socket.close(1000);
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
 * Any path starting with `/_rpc/` is a channel request. Before any context exists, the
 * request is refused with an HTTP response, as `handleRequest` refuses RPCs: a plain-text 400
 * `Host not allowed` when its hostname isn't in `allowedHosts`; `INVALID_INPUT` with no issues
 * unless it's a `GET` with `Upgrade: websocket` and a query of exactly `input` holding JSON;
 * and `FORBIDDEN` unless it's proven same-origin by `handleRequest`'s rules.
 *
 * A fresh context is then created and the call dispatched: `RPC_NOT_FOUND` for a path that
 * isn't a channel, then group middleware, input validation, procedure middleware and the
 * handler, which returns its iterable. From then on the result is an {@link Upgrade} carrying
 * the call's headers and cookies; setting a cookie later throws. A failure before that,
 * including a context factory that throws (`INTERNAL`), is an `Upgrade` too, whose socket
 * receives the failure frame and closes with 1000.
 *
 * Until the socket is accepted the call's signal follows `request.signal`; a request that
 * aborts before the handler is reached skips the handler, and one that aborts after it
 * returned its iterable returns that iterator before its body ran. Either way the socket,
 * if accepted, closes without a frame. Afterwards the signal follows the socket closing.
 *
 * @typeParam Definition - The application's context definition.
 * @param registry - The application's RPC groups.
 * @param application - The application binding.
 * @param request - The upgrade request, as a web `Request`.
 * @param options - The allowed hosts and further allowed origins.
 * @returns A refusal response, the upgrade, or `null` when the path doesn't start with
 * `/_rpc/`.
 */
export async function handleChannelUpgrade<Definition extends ContextDefinition<unknown>>(
  registry: Registry,
  application: ApplicationBinding<Definition>,
  request: Request,
  { allowedHosts, origins = [] }: HandleOptions,
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

  const crossSite = crossSiteReason(request, origins);

  if (crossSite !== undefined) {
    console.error(`Launch refused a cross-origin RPC: ${crossSite}`);

    return response(failure("FORBIDDEN"));
  }

  const effects = createResponseEffects();
  const socket = createChannelSocket(request.signal);
  let reply: Reply;

  try {
    const scope = await createRequestScope(application, request);
    const started = Promise.withResolvers<StreamStart>();
    const outcome = dispatch(
      registry,
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
    );
    // Failures before the handler returned its iterable are frames on an upgraded socket.
    const first = await Promise.race([outcome, started.promise]);

    if ("iterator" in first) {
      // The 101 carries the cookies; the rest of the call is the channel itself.
      effects.commit();
      socket.start(first, outcome);

      return upgrade(effects, (accepted) => socket.accept(accepted));
    }

    // The caller left before the handler ran: nobody reads a frame, the socket just closes.
    if (socket.signal.aborted) {
      effects.commit();

      return upgrade(effects, (accepted) => socket.accept(accepted));
    }

    reply = first;
  } catch (error) {
    console.error("Launch context failed", error);
    reply = failure("INTERNAL");
  }

  effects.commit();

  return refusedUpgrade(effects, reply);
}
