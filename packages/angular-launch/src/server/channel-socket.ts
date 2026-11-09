import { parseJson, serializeJson } from "../json.js";
import { MessageRefused, type ChannelInbox } from "./channel-messages.js";
import { invalidInput, type Reply } from "./dispatch.js";
import { failureFrame, settleStopped, type StreamStart } from "./event-stream.js";
import type { InputIssue } from "../input-issues.js";

/** How many values the server sends before the caller must grant more. */
export const valueWindow = 256;
/** How many messages the caller sends before the server must grant more. */
export const messageWindow = 32;
/** Past this many unsent bytes in the socket's buffer, the server stops pulling values. */
export const bufferedMark = 1024 * 1024;
/** How often the server checks whether the socket's buffer drained below the mark. */
export const bufferedPollMs = 50;

// WebSocket readyState values; the WebSocket global isn't on every server runtime.
const connecting = 0;
const open = 1;

/**
 * One channel call's side of its websocket. Internal.
 *
 * @remarks
 * Created before the call's pipeline runs, so the handler can receive `messages` and the
 * call a signal; `start` and `accept` follow as the call gets there.
 */
export interface ChannelSocket {
  /** The handler's messages, before validation. */
  readonly inbox: ChannelInbox;
  /**
   * The call's signal: until `accept` it follows the request's signal, then the socket
   * closing. It also aborts when the caller breaks the protocol.
   */
  readonly signal: AbortSignal;
  /**
   * Takes over the started channel: from now on, the caller leaving before `accept` ends it.
   *
   * @param stream - The handler's iterator and the settler of its part of the call.
   * @param outcome - The whole call's reply, from `dispatch`.
   */
  start(stream: StreamStart, outcome: Promise<Reply>): void;
  /**
   * Runs the started channel's frames on the host's accepted socket.
   *
   * @param socket - The accepted socket, open or still connecting.
   */
  accept(socket: WebSocket): void;
}

/**
 * Creates one channel call's side of its websocket.
 *
 * @remarks
 * Internal. After `accept`, it sends one `{"value":v}` frame per yielded value, then, once
 * the whole call settled, `{"end":null}` or the failure frame, and closes with 1000.
 *
 * Flow control is two credit windows. The server sends at most {@link valueWindow} values
 * the caller hasn't granted back with `{"ready":n}`, and pulls the handler's next value only
 * with credit and while the socket buffers less than {@link bufferedMark} bytes, checking
 * every {@link bufferedPollMs} ms. The caller sends at most {@link messageWindow} messages
 * the handler hasn't read; the server grants `{"ready":n}` once the handler read half a
 * window since the last grant.
 *
 * A binary or malformed frame, a message beyond the caller's credit or a grant for more
 * values than are outstanding ends the call with `INVALID_INPUT`, as does a message that
 * fails validation. Frames arriving after the handler finished are dropped.
 *
 * When the socket closes, or the request goes away before `accept`, the call's signal
 * aborts, `messages` ends after the messages already received, and the handler's pending
 * step is awaited and its iterator returned, as for a stream. A generator suspended at its
 * `yield` for want of credit returns at once.
 *
 * @param requestSignal - The upgrade request's signal, followed until `accept`.
 * @returns The channel's socket side.
 */
export function createChannelSocket(requestSignal: AbortSignal): ChannelSocket {
  const controller = new AbortController();
  let socket: WebSocket | undefined;
  let stream: StreamStart | undefined;
  let outcome: Promise<Reply> | undefined;
  let pending: Promise<IteratorResult<unknown>> | undefined;
  // No more values or frames: the socket closed, the request left or the caller broke the
  // protocol. Set once something has taken charge of settling `stream.finished` too.
  let stopped = false;
  let ending = false;
  let closed = false;
  let refusal: Reply | undefined;
  let valueCredit = valueWindow;
  let wake: (() => void) | undefined;
  let poll: ReturnType<typeof setTimeout> | undefined;

  const received: unknown[] = [];
  const readers: {
    readonly resolve: (step: IteratorResult<unknown, undefined>) => void;
    readonly reject: (error: unknown) => void;
  }[] = [];
  let inboxEnded = false;
  let inboxError: MessageRefused | undefined;
  let messageCredit = messageWindow;
  let readSinceGrant = 0;

  function send(frame: string): void {
    socket!.send(frame);
  }

  function read(): void {
    readSinceGrant += 1;

    if (readSinceGrant >= messageWindow / 2 && !stopped && !ending) {
      send(serializeJson({ ready: readSinceGrant }));
      messageCredit += readSinceGrant;
      readSinceGrant = 0;
    }
  }

  // Messages already received are still read; then `messages` ends.
  function endInbox(): void {
    inboxEnded = true;

    for (const reader of readers.splice(0)) {
      reader.resolve({ done: true, value: undefined });
    }
  }

  function receive(message: unknown): void {
    const reader = readers.shift();

    if (reader) {
      read();
      reader.resolve({ done: false, value: message });

      return;
    }

    received.push(message);
  }

  function stop(): void {
    if (stopped) {
      return;
    }

    stopped = true;
    clearTimeout(poll);
    wake?.();
    endInbox();

    if (stream && !ending) {
      ending = true;
      void settleStopped(stream, pending);
    }
  }

  function follow(): void {
    controller.abort(requestSignal.reason);
  }

  // Registered first, so a request that already left stops the socket too.
  controller.signal.addEventListener("abort", stop, { once: true });

  if (requestSignal.aborted) {
    follow();
  } else {
    requestSignal.addEventListener("abort", follow, { once: true });
  }

  // Ends the call with `INVALID_INPUT`, whatever the handler and middleware make of it.
  function refuse(issues: readonly InputIssue[]): void {
    if (stopped || ending) {
      return;
    }

    refusal = invalidInput(issues);
    inboxError = new MessageRefused(issues);
    received.length = 0;

    for (const reader of readers.splice(0)) {
      reader.reject(inboxError);
    }

    controller.abort(new DOMException("Launch channel refused a message", "AbortError"));
    void outcome!.then(() => {
      if (!closed) {
        send(failureFrame(refusal!));
        socket!.close(1000);
      }
    });
  }

  function onMessage(event: MessageEvent): void {
    if (stopped || ending) {
      return;
    }

    if (typeof event.data !== "string") {
      refuse([]);

      return;
    }

    let frame: unknown;

    try {
      frame = parseJson(event.data);
    } catch {
      refuse([]);

      return;
    }

    if (
      typeof frame !== "object" ||
      frame === null ||
      Array.isArray(frame) ||
      Object.keys(frame).length !== 1
    ) {
      refuse([]);

      return;
    }

    if (Object.hasOwn(frame, "message")) {
      messageCredit -= 1;

      if (messageCredit < 0) {
        refuse([]);

        return;
      }

      receive((frame as { readonly message: unknown }).message);

      return;
    }

    if (Object.hasOwn(frame, "ready")) {
      const granted = (frame as { readonly ready: unknown }).ready;
      const outstanding = valueWindow - valueCredit;

      if (
        typeof granted !== "number" ||
        !Number.isSafeInteger(granted) ||
        granted <= 0 ||
        granted > outstanding
      ) {
        refuse([]);

        return;
      }

      valueCredit += granted;
      wake?.();

      return;
    }

    refuse([]);
  }

  function onClose(): void {
    closed = true;

    // Until the whole call settled, middleware included, closing still cancels it; a call that
    // already finished doesn't abort afterwards.
    if (!stopped) {
      controller.abort(new DOMException("Launch channel closed", "AbortError"));
    }
  }

  async function finish(): Promise<void> {
    const reply = await outcome!;

    stop();

    if (closed) {
      return;
    }

    if (reply.status === 200) {
      send(serializeJson({ end: null }));
    } else {
      send(failureFrame(reply));
    }

    socket!.close(1000);
  }

  function waitFor(delay?: number): Promise<void> {
    return new Promise<void>((resolve) => {
      wake = resolve;

      if (delay !== undefined) {
        poll = setTimeout(resolve, delay);
      }
    }).then(() => {
      wake = undefined;
      clearTimeout(poll);
    });
  }

  async function pump(): Promise<void> {
    const started = stream!;

    while (!stopped) {
      if (valueCredit === 0) {
        await waitFor();

        continue;
      }

      if (socket!.bufferedAmount >= bufferedMark) {
        await waitFor(bufferedPollMs);

        continue;
      }

      // A custom iterator's next() may throw instead of rejecting.
      const next = new Promise<IteratorResult<unknown>>((resolve) => {
        resolve(started.iterator.next());
      });
      let step: IteratorResult<unknown>;

      pending = next;

      try {
        step = await next;
      } catch (error) {
        // A stopped channel settles with this failure itself.
        if (!stopped) {
          ending = true;
          started.finished.reject(error);
          await finish();
        }

        return;
      }

      if (stopped) {
        return;
      }

      if (step.done) {
        ending = true;
        started.finished.resolve();
        await finish();

        return;
      }

      let frame: string;

      try {
        frame = serializeJson({ value: step.value });
      } catch (error) {
        // The handler is still suspended at its yield: return its iterator, then fail with
        // this error, whatever returning throws.
        ending = true;
        void settleStopped(started, Promise.reject(error));
        await finish();

        return;
      }

      send(frame);
      valueCredit -= 1;
    }
  }

  function begin(): void {
    if (closed) {
      return;
    }

    void pump();
  }

  return {
    inbox: {
      next() {
        if (received.length > 0) {
          const message = received.shift();

          read();

          return Promise.resolve({ done: false, value: message });
        }

        if (inboxError) {
          return Promise.reject(inboxError);
        }

        if (inboxEnded) {
          return Promise.resolve({ done: true, value: undefined });
        }

        return new Promise((resolve, reject) => {
          readers.push({ resolve, reject });
        });
      },
      refuse,
    },
    signal: controller.signal,
    start(started, settled) {
      stream = started;
      outcome = settled;

      // The request left while the pipeline ran: the handler's body never runs.
      if (controller.signal.aborted) {
        ending = true;
        void settleStopped(started, undefined);
      }
    },
    accept(accepted) {
      requestSignal.removeEventListener("abort", follow);
      socket = accepted;

      if (stopped) {
        accepted.close(1000);

        return;
      }

      accepted.addEventListener("message", onMessage);
      accepted.addEventListener("close", onClose);

      if (accepted.readyState === connecting) {
        accepted.addEventListener("open", begin, { once: true });

        return;
      }

      if (accepted.readyState === open) {
        begin();
      }
    },
  };
}
