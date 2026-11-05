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
 * fails the call. The stream stops when `signal` aborts, which it does when the host
 * cancels the body or aborts the request: the body errors, the handler's pending step is
 * awaited and the iterator asked to return, which runs a generator's `finally` blocks once
 * it next yields. The handler's part of the call then ends, with the failure if that step
 * threw, so middleware that wraps the stream never cleans up under a running handler.
 *
 * @param start - The started stream.
 * @param outcome - The whole call's reply, from `dispatch`.
 * @param cancel - Aborted when the body is cancelled.
 * @param signal - The call's signal: it follows `cancel` and the request's signal.
 * @returns The response body.
 */
export function eventStream(
  start: StreamStart,
  outcome: Promise<Reply>,
  cancel: AbortController,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  // Set once something has taken charge of settling `start.finished`.
  let ending = false;
  let pending: Promise<IteratorResult<unknown>> | undefined;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let stopped: (() => void) | undefined;

  function stop(): void {
    closed = true;
    clearInterval(keepAlive);
    signal.removeEventListener("abort", stopped!);
  }

  // After the stream stopped: let the handler's pending step finish, then return it.
  async function settleStopped(): Promise<void> {
    try {
      const step = await pending;

      if (step?.done) {
        start.finished.resolve();

        return;
      }

      await start.iterator.return?.();
      start.finished.resolve();
    } catch (error) {
      start.finished.reject(error);
    }
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
      stopped = () => {
        if (closed) {
          return;
        }

        stop();
        controller.error(signal.reason);

        if (!ending) {
          ending = true;
          void settleStopped();
        }
      };

      // The request may already be gone, such as while middleware ran.
      if (signal.aborted) {
        stopped();

        return;
      }

      signal.addEventListener("abort", stopped, { once: true });
      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, keepAliveMs);
    },
    async pull(controller) {
      const next = start.iterator.next();
      let step: IteratorResult<unknown>;

      pending = next;

      try {
        step = await next;
      } catch (error) {
        // A stopped stream settles with this failure itself.
        if (!closed) {
          ending = true;
          start.finished.reject(error);
          await finish(controller);
        }

        return;
      }

      if (closed) {
        return;
      }

      if (step.done) {
        ending = true;
        start.finished.resolve();
        await finish(controller);

        return;
      }

      let data: string;

      try {
        data = serializeJson(step.value);
      } catch (error) {
        // The handler is still suspended at its yield.
        ending = true;
        void Promise.resolve(start.iterator.return?.()).then(
          () => start.finished.reject(error),
          start.finished.reject,
        );
        await finish(controller);

        return;
      }

      controller.enqueue(encoder.encode(`event: value\ndata: ${data}\n\n`));
    },
    cancel(reason) {
      cancel.abort(reason);
    },
  });
}
