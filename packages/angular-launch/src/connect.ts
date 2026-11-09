import { isPlatformServer } from "@angular/common";
import {
  afterNextRender,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
  type Signal,
} from "@angular/core";
import type { Channel } from "./channel.js";
import type { RpcError } from "./client.js";
import type { RpcNotFound, RpcRedirect } from "./outcomes.js";

/**
 * Where a connection is: `"idle"` without input or on the server, `"connecting"` until the
 * server answers, `"open"` while it runs, `"ended"` once the handler ended, or `"failed"`.
 */
export type ConnectionStatus = "idle" | "connecting" | "open" | "ended" | "failed";

/**
 * Why a connection failed: the procedure's `RpcError`, an `RpcRedirect` or an `RpcNotFound`
 * for a failure the server sent, a `TypeError` for a lost or refused connection, or the
 * `Error` `reduce` threw.
 *
 * @remarks
 * Narrow an `RpcError` with the callable's `isError`. A `reduce` that throws something other
 * than an `Error` fails the connection with an `Error` whose `cause` is what it threw.
 */
export type ConnectionError =
  | RpcError<string, unknown>
  | RpcRedirect
  | RpcNotFound
  | TypeError
  | Error;

/**
 * A stream's connection, created by its callable's `connect()`: its latest state as signals.
 *
 * @typeParam State - The state the values fold into.
 */
export interface StreamConnection<State> {
  /**
   * The latest state: `initial()` until the first value arrives, then the latest value or
   * what `reduce` made of it. Kept through failures and reconnects until a new value
   * replaces it.
   */
  readonly value: Signal<State>;
  /** Where the connection is. */
  readonly status: Signal<ConnectionStatus>;
  /** Why the connection failed, while `status` is `"failed"`; `undefined` otherwise. */
  readonly error: Signal<ConnectionError | undefined>;
  /**
   * Opens a new call after the connection ended or failed, starting from the handler's first
   * value. Does nothing in any other status.
   */
  reconnect(): void;
}

/**
 * A channel's connection, created by its callable's `connect()`: a stream's connection, plus
 * `send`.
 *
 * @typeParam State - The state the values fold into.
 * @typeParam Sent - The messages the channel's `message` schema accepts.
 */
export interface Connection<State, Sent> extends StreamConnection<State> {
  /**
   * Sends one message to the handler.
   *
   * @param message - The message, as strict JSON.
   * @returns A promise that resolves once the message was handed to the socket: messages
   * wait while connecting and for the server's room while open. It rejects with the error
   * `error()` then shows when the connection fails first, also when `reduce` throws; with an
   * `AbortError` when Launch closes the connection first, for a new input, `reconnect()` or
   * the injection context's destruction; and with a `TypeError` while idle, ended or failed.
   */
  send(message: Sent): Promise<void>;
}

/**
 * The `input` option of a procedure with an input schema.
 *
 * @typeParam Input - The input schema's input type.
 */
export interface ConnectInput<Input> {
  /**
   * The call's input, read reactively: a change closes the connection and opens a new one,
   * and `undefined` keeps it closed with status `"idle"`.
   */
  readonly input: () => Input | undefined;
}

/** The `input` option of a procedure without input. */
export interface OptionalConnectInput {
  /**
   * Whether to connect, read reactively: `null` connects, `undefined` keeps the connection
   * closed with status `"idle"`. Defaults to always connecting.
   */
  readonly input?: () => null | undefined;
}

/**
 * The options of `connect()` without `reduce`: the state is the latest value.
 *
 * @typeParam Initial - What to show before the first value.
 */
export interface ConnectOptions<Initial> {
  /**
   * The state until the first value arrives, read reactively until then; also what the
   * server renders.
   */
  readonly initial: () => Initial;
}

/**
 * The options of `connect()` with `reduce`: each value folds into the state.
 *
 * @typeParam Value - The values the handler yields.
 * @typeParam State - The state they fold into.
 */
export interface ReducingConnectOptions<Value, State> {
  /**
   * The state until the first value arrives, read reactively until then; also what the
   * server renders, and what a new call's first value folds into.
   */
  readonly initial: () => State;
  /**
   * Folds one value into the state. Runs untracked and must be pure; what it throws fails
   * the connection.
   *
   * @param state - The current state.
   * @param value - The value that arrived.
   * @returns The new state.
   */
  readonly reduce: (state: State, value: Value) => State;
}

/**
 * A stream callable's `connect()`.
 *
 * @typeParam InputOption - The `input` option the stream takes.
 * @typeParam Value - The values its handler yields.
 */
export interface StreamConnector<InputOption, Value> {
  /**
   * Follows the stream as signals, folding each value into the state with `reduce`.
   *
   * @remarks
   * Call it in an injection context, such as a field initializer. It connects in the browser
   * after the next render, never on the server, and never keeps the app from becoming
   * stable. Destroying the injection context closes the connection.
   *
   * @param options - The input, the initial state and the fold.
   * @returns The connection.
   */
  <State>(options: InputOption & ReducingConnectOptions<Value, State>): StreamConnection<State>;
  /**
   * Follows the stream as signals: the state is the latest value.
   *
   * @remarks
   * As the `reduce` form.
   *
   * @param options - The input and what to show before the first value.
   * @returns The connection.
   */
  <Initial>(options: InputOption & ConnectOptions<Initial>): StreamConnection<Value | Initial>;
}

/**
 * A channel callable's `connect()`.
 *
 * @typeParam InputOption - The `input` option the channel takes.
 * @typeParam Value - The values its handler yields.
 * @typeParam Sent - The messages its `message` schema accepts.
 */
export interface ChannelConnector<InputOption, Value, Sent> {
  /**
   * Runs the channel as signals, folding each value into the state with `reduce`.
   *
   * @remarks
   * Call it in an injection context, such as a field initializer. It connects in the browser
   * after the next render, never on the server, and never keeps the app from becoming
   * stable. Destroying the injection context closes the connection. It reads every value as
   * it arrives, so sending never stalls it.
   *
   * @param options - The input, the initial state and the fold.
   * @returns The connection.
   */
  <State>(options: InputOption & ReducingConnectOptions<Value, State>): Connection<State, Sent>;
  /**
   * Runs the channel as signals: the state is the latest value.
   *
   * @remarks
   * As the `reduce` form.
   *
   * @param options - The input and what to show before the first value.
   * @returns The connection.
   */
  <Initial>(options: InputOption & ConnectOptions<Initial>): Connection<Value | Initial, Sent>;
}

/** What `connect` opens one call with. Internal. */
export type Opener = (
  input: unknown,
  signal: AbortSignal,
  opened: () => void,
) => AsyncIterable<unknown> | Channel<unknown, unknown>;

/** One call `connect` opened. */
interface Call {
  readonly controller: AbortController;
  readonly connection: AsyncIterable<unknown> | Channel<unknown, unknown>;
  /** Present once `reduce` failed the call: what it threw, as an `Error`. */
  failure?: { readonly error: Error };
}

interface RuntimeOptions {
  readonly input?: () => unknown;
  readonly initial: () => unknown;
  readonly reduce?: (state: unknown, value: unknown) => unknown;
}

/**
 * Follows a stream or channel as signals. Internal: generated callables expose it as
 * `connect()`.
 *
 * @remarks
 * Must run in an injection context. On the server it never connects: status stays `"idle"`
 * and `value` is `initial()`. In the browser it connects after the next render, and again
 * whenever `input` changes; each connection reads every value as it arrives. A connection
 * closed for a new input or by the injection context's destruction doesn't change `status`
 * or `error`.
 *
 * @param open - Opens one call.
 * @param options - The `connect()` options.
 * @returns The connection; `send` delegates to the open channel.
 */
export function connect(
  open: Opener,
  { input = () => null, initial, reduce }: RuntimeOptions,
): Connection<unknown, unknown> {
  const server = isPlatformServer(inject(PLATFORM_ID));
  const destroyRef = inject(DestroyRef);
  const received = signal<{ readonly state: unknown } | undefined>(undefined);
  const status = signal<ConnectionStatus>("idle");
  const error = signal<ConnectionError | undefined>(undefined);
  const value = computed(() => {
    const latest = received();

    if (latest === undefined) {
      return initial();
    }

    return latest.state;
  });
  let current: Call | undefined;

  function close(): void {
    current?.controller.abort();
    current = undefined;
  }

  function fail(caught: unknown): void {
    error.set(caught as ConnectionError);
    status.set("failed");
  }

  async function follow(call: Call): Promise<void> {
    const { controller, connection } = call;
    let state: unknown;
    let first = true;

    try {
      for await (const item of connection) {
        if (controller.signal.aborted) {
          return;
        }

        try {
          if (!reduce) {
            state = item;
          } else if (first) {
            // A new call's first value folds into the initial state, not the previous call's.
            state = untracked(() => reduce(initial(), item));
          } else {
            const previous = state;

            state = untracked(() => reduce(previous, item));
          }
        } catch (thrown) {
          let failure: Error;

          if (thrown instanceof Error) {
            failure = thrown;
          } else {
            failure = new Error("Launch connection's reduce threw a non-Error value", {
              cause: thrown,
            });
          }

          // Set before the loop closes the channel, so the sends it rejects carry this error.
          call.failure = { error: failure };
          fail(failure);

          throw failure;
        }

        first = false;
        received.set({ state });
        status.set("open");
      }

      if (!controller.signal.aborted) {
        status.set("ended");
      }
    } catch (caught) {
      if (controller.signal.aborted || call.failure !== undefined) {
        return;
      }

      fail(caught);
    }
  }

  function start(next: unknown): void {
    close();

    if (next === undefined) {
      error.set(undefined);
      status.set("idle");

      return;
    }

    const controller = new AbortController();
    const connection = open(next, controller.signal, () => {
      if (current?.controller === controller && status() === "connecting") {
        status.set("open");
      }
    });

    const call: Call = { controller, connection };

    current = call;
    error.set(undefined);
    status.set("connecting");
    void follow(call);
  }

  if (!server) {
    const rendered = signal(false);

    afterNextRender(() => rendered.set(true));
    effect(() => {
      if (!rendered()) {
        return;
      }

      const next = input();

      untracked(() => start(next));
    });
    destroyRef.onDestroy(close);
  }

  return {
    value,
    status: status.asReadonly(),
    error: error.asReadonly(),
    reconnect() {
      const now = untracked(status);

      if (now === "ended" || now === "failed") {
        start(untracked(input));
      }
    },
    send(message) {
      const now = untracked(status);

      const call = current;

      if (!call || (now !== "connecting" && now !== "open") || !("send" in call.connection)) {
        return Promise.reject(new TypeError("Launch connection isn't open"));
      }

      // A failing `reduce` closes the channel; its sends then reject with what it threw.
      return call.connection.send(message).catch((rejection: unknown) => {
        if (call.failure !== undefined) {
          return Promise.reject(call.failure.error);
        }

        return Promise.reject(rejection);
      });
    },
  };
}
