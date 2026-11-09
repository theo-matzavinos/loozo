import type { ChannelCallOptions, ErrorMetadata, RpcError } from "./client.js";
import { parseJson, serializeJson } from "./json.js";
import { failureRejection } from "./stream.js";

/**
 * An open channel: the values its handler yields, and `send` for messages to it.
 *
 * @remarks
 * Returned by a generated channel callable, which opens the websocket at once. Iterate it
 * once; a second iterator throws a `TypeError`. Iteration ends when the handler ends, and
 * throws the procedure's `RpcError`, an `RpcRedirect` or an `RpcNotFound` when the call
 * fails, an `AbortError` when the call's `signal` aborts, and a `TypeError` when the
 * connection closes early, the server refused the handshake or sent a malformed frame.
 * The signal counts until iteration ends: aborting after the last frame arrived drops the
 * values not read yet and throws the `AbortError`. Leaving the loop early, as `break` does,
 * closes the channel. Reads may overlap; they settle in order.
 *
 * Flow control is mutual: the server stops at 256 values this side hasn't read, and `send`
 * waits once 32 messages are unread on the server. So read in a loop that runs alongside
 * your sends; awaiting a batch of sends before reading can stall both sides for good.
 *
 * @typeParam Received - The values the handler yields.
 * @typeParam Sent - The messages the channel's `message` schema accepts.
 */
export interface Channel<Received, Sent> extends AsyncIterable<Received> {
  /**
   * Sends one message to the handler.
   *
   * @remarks
   * Messages wait here, in order, until the socket is open and the server has room for
   * them.
   *
   * @param message - The message, as strict JSON.
   * @returns A promise that resolves once the message was handed to the socket. It rejects
   * with the channel's closing error when the channel closes first, and with a `TypeError`
   * when the channel is already closed or `message` isn't strict JSON.
   */
  send(message: Sent): Promise<void>;
}

/** How many values the server sends before this side must grant more. */
const valueWindow = 256;
/** How many messages this side sends before the server must grant more. */
const messageWindow = 32;

/**
 * Opens one channel call over the browser `WebSocket`.
 *
 * @remarks
 * Internal. The socket's URL is `path` resolved against the page, with a `ws:` or `wss:`
 * scheme. Not `HttpClient`, and no Angular pending task: an open channel never keeps the app
 * unstable. See {@link Channel} for the caller-facing behavior. Values that arrive before
 * they're read are kept; the server sends no more than its window.
 *
 * @param path - The procedure's `/_rpc/<namespace>/<procedure>?input=…` path.
 * @param declared - The procedure's declared error metadata.
 * @param own - Associates a converted error with its procedure for `isError`.
 * @param options - The call options.
 * @param opened - Called once the socket opens.
 * @param refused - Fails the channel at once with this error, without a connection.
 */
export function openChannel(
  path: string,
  declared: readonly ErrorMetadata[],
  own: (error: RpcError<string, unknown>) => RpcError<string, unknown>,
  { signal }: ChannelCallOptions,
  opened: () => void = () => undefined,
  refused?: Error,
): Channel<unknown, unknown> {
  const values: unknown[] = [];
  const sends: {
    readonly frame: string;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
  }[] = [];
  let socket: WebSocket | undefined;
  let sendCredit = messageWindow;
  let readSinceGrant = 0;
  // No more frames either way: the call ended, failed, was aborted or left.
  let closed = false;
  let failure: Error | undefined;
  // The consumer is done: it read the end, caught the failure or left the loop.
  let settled = false;
  let iterated = false;
  let wake: (() => void) | undefined;
  // Each read waits for the one before it, so concurrent `next()` calls settle in order.
  let reading: Promise<unknown> = Promise.resolve();

  function finish(error?: Error): void {
    if (closed) {
      return;
    }

    closed = true;
    failure = error;

    const reason = error ?? new TypeError("Launch channel closed");

    for (const pending of sends.splice(0)) {
      pending.reject(reason);
    }

    // Closing again after the server's own close is harmless.
    socket?.close(1000);
    wake?.();
  }

  function settle(): void {
    settled = true;
    values.length = 0;
    signal?.removeEventListener("abort", abort);
  }

  // Also after the last frame: values the consumer hasn't read yet aren't delivered.
  function abort(): void {
    if (settled) {
      return;
    }

    const reason = new DOMException("RPC channel aborted", "AbortError") as Error;

    values.length = 0;

    if (closed) {
      failure = reason;
      wake?.();

      return;
    }

    finish(reason);
  }

  function flush(): void {
    while (socket?.readyState === 1 && !closed && sendCredit > 0 && sends.length > 0) {
      const pending = sends.shift()!;

      socket.send(pending.frame);
      sendCredit -= 1;
      pending.resolve();
    }
  }

  function malformed(): void {
    finish(new TypeError("Launch channel sent a malformed frame"));
  }

  function onMessage(event: MessageEvent): void {
    if (closed) {
      return;
    }

    if (typeof event.data !== "string") {
      malformed();

      return;
    }

    let frame: unknown;

    try {
      frame = parseJson(event.data);
    } catch {
      malformed();

      return;
    }

    if (typeof frame !== "object" || frame === null || Array.isArray(frame)) {
      malformed();

      return;
    }

    const single = Object.keys(frame).length === 1;

    if (single && Object.hasOwn(frame, "value")) {
      values.push((frame as { readonly value: unknown }).value);
      wake?.();

      return;
    }

    if (single && Object.hasOwn(frame, "ready")) {
      const granted = (frame as { readonly ready: unknown }).ready;

      if (typeof granted !== "number" || !Number.isSafeInteger(granted) || granted <= 0) {
        malformed();

        return;
      }

      sendCredit += granted;
      flush();

      return;
    }

    if (
      single &&
      Object.hasOwn(frame, "end") &&
      (frame as { readonly end: unknown }).end === null
    ) {
      finish();

      return;
    }

    if (Object.hasOwn(frame, "status")) {
      const { status, ...body } = frame as { readonly status: unknown };
      let error: Error | undefined;

      if (typeof status === "number") {
        error = failureRejection(body, status, declared, own);
      }

      finish(error ?? new TypeError("Launch channel sent an unrecognized error"));

      return;
    }

    malformed();
  }

  function read(): void {
    readSinceGrant += 1;

    if (readSinceGrant >= valueWindow / 2 && !closed) {
      socket!.send(serializeJson({ ready: readSinceGrant }));
      readSinceGrant = 0;
    }
  }

  if (refused) {
    finish(refused);
  } else if (signal?.aborted) {
    abort();
  } else {
    try {
      // Resolved against the page's base URL, with its http(s) scheme turned into ws(s).
      socket = new WebSocket(path);
    } catch (error) {
      finish(new TypeError("Launch channel couldn't connect", { cause: error }));
    }
  }

  if (socket) {
    const opening = socket;

    signal?.addEventListener("abort", abort, { once: true });
    opening.addEventListener("open", () => {
      if (!closed) {
        opened();
        flush();
      }
    });
    opening.addEventListener("message", onMessage);
    // A refused handshake fires error, then close; a dropped connection only close.
    opening.addEventListener("close", () => {
      finish(new TypeError("Launch channel closed before it ended"));
    });
  }

  return {
    send(message) {
      if (closed) {
        return Promise.reject(new TypeError("Launch channel is closed"));
      }

      let frame: string;

      try {
        frame = serializeJson({ message });
      } catch (error) {
        return Promise.reject(error);
      }

      return new Promise((resolve, reject) => {
        sends.push({ frame, resolve, reject });
        flush();
      });
    },
    [Symbol.asyncIterator]() {
      if (iterated) {
        throw new TypeError("A Launch channel has one consumer: iterate it once");
      }

      iterated = true;

      async function step(): Promise<IteratorResult<unknown, undefined>> {
        while (true) {
          if (values.length > 0) {
            const value = values.shift();

            read();

            return { done: false, value };
          }

          if (closed) {
            if (settled) {
              return { done: true, value: undefined };
            }

            settle();

            if (failure) {
              throw failure;
            }

            return { done: true, value: undefined };
          }

          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          wake = undefined;
        }
      }

      return {
        next(): Promise<IteratorResult<unknown, undefined>> {
          const result = reading.then(step);

          reading = result.catch(() => undefined);

          return result;
        },
        async return(): Promise<IteratorResult<unknown, undefined>> {
          settle();
          finish();

          return { done: true, value: undefined };
        },
      };
    },
  };
}
