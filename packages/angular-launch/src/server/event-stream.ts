import { serializeJson } from "../json.js";
import type { Reply } from "./dispatch.js";

/** How often a stream sends a comment, so idle proxies keep its connection open. */
export const keepAliveMs = 15_000;

/**
 * A stream whose handler returned its iterable: the response can start.
 *
 * @remarks
 * Internal. `dispatch` hands it over and waits for `finished`: resolving it ends the
 * handler's part of the call, rejecting it fails the call with that error.
 */
export interface StreamStart {
  /** The handler's iterator. */
  readonly iterator: AsyncIterator<unknown>;
  /** Settles the handler's part of the call. */
  readonly finished: {
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
  };
}

/**
 * The `text/event-stream` body of a started stream.
 *
 * @remarks
 * Internal. Sends one `value` event per yielded value, then, once the whole call settled
 * (`outcome`, middleware included), one `end` event or one `error` event whose data is
 * `{ status, error }`. A comment goes out every {@link keepAliveMs}.
 *
 * Pull-based, so a slow reader pauses the handler. A yielded value that isn't strict JSON
 * fails the call. Cancelling the body, as hosts do when the client goes away, aborts
 * `cancel` and asks the iterator to return, which runs a generator's `finally` blocks once
 * it next yields; the handler's part of the call ends when that return settles.
 *
 * @param start - The started stream.
 * @param outcome - The whole call's reply, from `dispatch`.
 * @param cancel - Aborted when the body is cancelled; the call's signal follows it.
 * @returns The response body.
 */
export function eventStream(
  start: StreamStart,
  outcome: Promise<Reply>,
  cancel: AbortController,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  let keepAlive: ReturnType<typeof setInterval> | undefined;

  function stop(): void {
    closed = true;
    clearInterval(keepAlive);
  }

  // Ends the handler's part of the call once its iterator returned, so middleware that
  // wraps the stream doesn't clean up while the handler still runs.
  function returnThen(settle: () => void): void {
    if (!start.iterator.return) {
      settle();

      return;
    }

    start.iterator.return().then(settle, start.finished.reject);
  }

  async function finish(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    const reply = await outcome;

    if (closed) {
      return;
    }

    if (reply.status === 200) {
      controller.enqueue(encoder.encode("event: end\ndata: null\n\n"));
    } else {
      const data = serializeJson({ status: reply.status, ...(reply.body as object) });

      controller.enqueue(encoder.encode(`event: error\ndata: ${data}\n\n`));
    }

    stop();
    controller.close();
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, keepAliveMs);
    },
    async pull(controller) {
      let data: string;

      try {
        const step = await start.iterator.next();

        if (step.done) {
          start.finished.resolve();
          await finish(controller);

          return;
        }

        data = serializeJson(step.value);
      } catch (error) {
        // After a value that isn't JSON, the handler is still suspended at its yield.
        returnThen(() => start.finished.reject(error));
        await finish(controller);

        return;
      }

      if (!closed) {
        controller.enqueue(encoder.encode(`event: value\ndata: ${data}\n\n`));
      }
    },
    cancel(reason) {
      stop();
      cancel.abort(reason);
      returnThen(start.finished.resolve);
    },
  });
}
