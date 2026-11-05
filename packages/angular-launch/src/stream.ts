import { RpcError, recognizedError, type ErrorMetadata, type StreamCallOptions } from "./client.js";
import { serializeJson } from "./json.js";

/** One parsed `text/event-stream` event: its name and its data line. */
interface Event {
  readonly name: string;
  readonly data: string;
}

/**
 * Takes the complete events off the front of `buffer`, dropping comments.
 *
 * @param buffer - Text received so far and not yet taken.
 * @param from - Where to look for the first event's end: no event ends before it.
 * @throws TypeError for an event that isn't exactly an `event:` line and a `data:` line,
 * which Launch servers never send.
 */
function takeEvents(buffer: string, from: number): { events: Event[]; rest: string } {
  const events: Event[] = [];
  let rest = buffer;
  let end = rest.indexOf("\n\n", from);

  while (end !== -1) {
    const lines = rest.slice(0, end).split("\n");

    rest = rest.slice(end + 2);
    end = rest.indexOf("\n\n");

    if (lines.every((line) => line.startsWith(":"))) {
      continue;
    }

    if (lines.length !== 2 || !lines[0].startsWith("event: ") || !lines[1].startsWith("data: ")) {
      throw new TypeError("Launch stream sent a malformed event");
    }

    events.push({ name: lines[0].slice("event: ".length), data: lines[1].slice("data: ".length) });
  }

  return { events, rest };
}

/** Parses an event's data, which a Launch server always sends as JSON. */
function eventData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    throw new TypeError("Launch stream sent an event whose data isn't JSON");
  }
}

/** The `RpcError` for an error frame, or `undefined` when it isn't one of `declared`'s. */
function recognizedRpcError(
  body: unknown,
  status: number,
  declared: readonly ErrorMetadata[],
): RpcError<string, unknown> | undefined {
  const frame = recognizedError(body, status, declared);

  if (!frame) {
    return undefined;
  }

  return new RpcError(frame.code, status, frame.data, frame.message);
}

/**
 * Runs one stream call over `fetch` and yields its values.
 *
 * @remarks
 * Internal. Not `HttpClient`: every `HttpClient` request is an Angular pending task until
 * it completes, and its fetch backend keeps the whole body, so an open stream would keep
 * the app unstable and grow without bound.
 *
 * Ends after the `end` event. Throws an `RpcError`, passed through `own`, for an error
 * event or a recognized error response; an `AbortError` when `signal` aborts; and a
 * `TypeError` when the connection fails, the body ends without its `end` event or an
 * event is malformed. Returning early, as `break` does, closes the request.
 *
 * @param url - The procedure's `/_rpc/<namespace>/<procedure>` path.
 * @param input - The caller's input, or `null`.
 * @param declared - The procedure's declared error metadata.
 * @param own - Associates a converted error with its procedure for `isError`.
 * @param options - The call options.
 */
export async function* openStream(
  url: string,
  input: unknown,
  declared: readonly ErrorMetadata[],
  own: (error: RpcError<string, unknown>) => RpcError<string, unknown>,
  { signal }: StreamCallOptions,
): AsyncGenerator<unknown, void, undefined> {
  if (signal?.aborted) {
    throw new DOMException("RPC stream aborted", "AbortError");
  }

  const request = new AbortController();

  function abort(): void {
    request.abort(new DOMException("RPC stream aborted", "AbortError"));
  }

  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: serializeJson({ input }),
      signal: request.signal,
    });

    if (!response.ok) {
      let body: unknown;

      try {
        body = await response.json();
      } catch (error) {
        // Aborting while the body arrives isn't a transport failure.
        if (request.signal.aborted) {
          throw error;
        }

        throw new TypeError(`Launch stream request failed with status ${response.status}`);
      }

      const error = recognizedRpcError(body, response.status, declared);

      if (!error) {
        throw new TypeError(`Launch stream request failed with status ${response.status}`);
      }

      throw own(error);
    }

    const mediaType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const isEventStream = mediaType === "text/event-stream";

    if (!isEventStream || !response.body) {
      throw new TypeError("Launch stream response isn't an event stream");
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        throw new TypeError("Launch stream ended without its end event");
      }

      // The rest holds no complete event, so one can only end in what just arrived.
      const taken = takeEvents(buffer + chunk.value, Math.max(0, buffer.length - 1));

      buffer = taken.rest;

      for (const event of taken.events) {
        // Events that arrived together aren't delivered after an abort.
        if (signal?.aborted) {
          throw new DOMException("RPC stream aborted", "AbortError");
        }

        if (event.name === "value") {
          yield eventData(event.data);

          continue;
        }

        if (event.name === "end" && event.data === "null") {
          return;
        }

        if (event.name !== "error") {
          throw new TypeError("Launch stream sent a malformed event");
        }

        const frame = eventData(event.data);
        let error: RpcError<string, unknown> | undefined;

        if (typeof frame === "object" && frame !== null && "status" in frame) {
          const { status, ...body } = frame;

          if (typeof status === "number") {
            error = recognizedRpcError(body, status, declared);
          }
        }

        if (!error) {
          throw new TypeError("Launch stream sent an unrecognized error");
        }

        throw own(error);
      }
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    // Closes the request when iteration ended early, failed or the stream ended.
    request.abort(new DOMException("RPC stream closed", "AbortError"));
  }
}
