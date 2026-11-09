import type {
  ErrorDefinitions,
  Group,
  InputOf,
  OutputOf,
  Procedure,
  ProcedureKind,
  Schema,
} from "./server/definitions.js";
import type { Channel } from "./channel.js";
import type {
  ChannelConnector,
  ConnectInput,
  OptionalConnectInput,
  StreamConnector,
} from "./connect.js";
import { serializeJson } from "./json.js";
import { isInvalidInputData, type InvalidInputData } from "./input-issues.js";

/** Per-call options for a generated query callable. */
export interface CallOptions {
  /**
   * Aborts the call: the HTTP request is cancelled and the promise rejects with a
   * `DOMException` named `AbortError`.
   *
   * @remarks
   * An already aborted signal rejects without sending a request. On the server, the
   * call's middleware and handler see their `signal` abort. That's advisory: work that
   * doesn't pass the signal on still finishes.
   */
  readonly signal?: AbortSignal;
  /**
   * Whether Angular's HTTP transfer cache may store this call's response during server
   * rendering and reuse it during hydration. Defaults to `true`.
   */
  readonly transferCache?: boolean;
}

/** Per-call options for a generated mutation callable. */
export interface MutationCallOptions {
  /**
   * Aborts the call: the HTTP request is cancelled and the promise rejects with a
   * `DOMException` named `AbortError`.
   *
   * @remarks
   * On the server, the call's middleware and handler see their `signal` abort. That's
   * advisory: work that doesn't pass the signal on still finishes, and the write may
   * already have committed.
   */
  readonly signal?: AbortSignal;
  /** Only `false` is accepted: mutations never use the HTTP transfer cache. */
  readonly transferCache?: false;
}

/** Per-call options for a generated stream callable. */
export interface StreamCallOptions {
  /**
   * Aborts the stream: its request is cancelled and iteration rejects with a
   * `DOMException` named `AbortError`.
   *
   * @remarks
   * Ending iteration early, such as with `break`, also closes the request. On the server,
   * the stream's middleware and handler see their `signal` abort.
   */
  readonly signal?: AbortSignal;
}

/** Per-call options for a generated channel callable. */
export interface ChannelCallOptions {
  /**
   * Aborts the channel: its socket closes, iteration rejects with a `DOMException` named
   * `AbortError`, and messages waiting to be sent reject with it too.
   *
   * @remarks
   * Ending iteration early, such as with `break`, also closes the socket. On the server, the
   * channel's middleware and handler see their `signal` abort.
   */
  readonly signal?: AbortSignal;
}

/**
 * Browser-safe metadata for one declared error of a procedure.
 *
 * @remarks
 * Internal; not exported from a public entry point. Generation writes these entries
 * into each `rpc.generated.ts` so the client can recognize the procedure's declared
 * error responses without the server's schemas.
 */
export interface ErrorMetadata {
  /** The declared error code, such as `"NOT_FOUND"`. */
  readonly code: string;
  /** The HTTP status the error is sent with, from 400 to 599. */
  readonly status: number;
  /** The declared public message sent with every instance of the error. */
  readonly message: string;
}

/**
 * The four error codes Launch itself returns, with their HTTP status and public message.
 *
 * @remarks
 * - `INVALID_INPUT` (400): the request or its input failed validation. Its data is
 *   {@link InvalidInputData}: the input schema's issues, or none for a malformed request.
 * - `FORBIDDEN` (403): middleware or a handler threw `forbidden()`, the request wasn't
 *   proven to come from the app's own origin, or a mutation was called during server
 *   rendering.
 * - `RPC_NOT_FOUND` (404): no procedure exists at the requested path.
 * - `INTERNAL` (500): anything else. Details go to the server log, never to the client.
 *
 * The other codes have `null` data. These codes are reserved: procedures can't declare
 * errors with them.
 */
export const frameworkFailures = {
  INVALID_INPUT: { status: 400, message: "Invalid RPC input" },
  FORBIDDEN: { status: 403, message: "RPC forbidden" },
  RPC_NOT_FOUND: { status: 404, message: "RPC not found" },
  INTERNAL: { status: 500, message: "Internal server error" },
} as const;

/** One of the error codes Launch itself returns: a key of {@link frameworkFailures}. */
export type FrameworkCode = keyof typeof frameworkFailures;

type FrameworkData<Code extends FrameworkCode> = Code extends "INVALID_INPUT"
  ? InvalidInputData
  : null;

/**
 * An error response returned by a procedure: either a Launch framework failure or one
 * of the procedure's declared errors.
 *
 * @remarks
 * Generated callables reject with an `RpcError` only for a response that exactly
 * matches a framework failure or one of that procedure's declared errors. Network
 * failures, aborts and unrecognized responses reject with the original error instead.
 * Use the callable's `isError` to narrow a caught value: it recognizes only errors
 * returned by that exact procedure, not `RpcError` instances created elsewhere.
 *
 * @typeParam Code - The error code.
 * @typeParam Data - The error's data: {@link InvalidInputData} for `INVALID_INPUT`,
 * `null` for the other framework failures, the data schema's output for declared errors.
 */
export class RpcError<
  Code extends string = FrameworkCode,
  Data = Code extends FrameworkCode ? FrameworkData<Code> : null,
> extends Error {
  /**
   * Creates an error with the given code, status and data.
   *
   * @param code - The error code.
   * @param status - The HTTP status of the response.
   * @param data - The error's data. Defaults to `null`.
   * @param message - The public message. Defaults to the framework message when `code`
   * is a {@link FrameworkCode}.
   * @throws TypeError when `message` is omitted and `code` isn't a framework code.
   */
  constructor(
    /** The framework or declared error code. */
    readonly code: Code,
    /** The HTTP status of the response. */
    readonly status: number,
    /**
     * The error's data: {@link InvalidInputData} for `INVALID_INPUT`, `null` for the other
     * framework failures, validated data for declared errors.
     */
    readonly data: Data = null as Data,
    message?: string,
  ) {
    if (message === undefined) {
      if (!Object.hasOwn(frameworkFailures, code)) {
        throw new TypeError("Declared RPC errors require their public message");
      }

      message = frameworkFailures[code as FrameworkCode].message;
    }

    super(message);
    this.name = "RpcError";
  }
}

/**
 * Recognizes a response body that is exactly a Launch framework failure.
 *
 * @remarks
 * Internal; not exported from a public entry point. Used by the generated client to
 * convert responses into {@link RpcError}s. The body must be strict JSON shaped
 * exactly as `{ error: { code, message, data } }`, with the framework code's own
 * status and message. `data` must be exactly {@link InvalidInputData} for
 * `INVALID_INPUT` and `null` for the other codes.
 *
 * @param value - The parsed response body.
 * @param status - The response's HTTP status.
 * @returns The framework code and data, or `undefined` when the body doesn't match
 * exactly.
 */
export function recognizedFailure(
  value: unknown,
  status: number,
):
  | {
      /** The framework code. */
      code: FrameworkCode;
      /** The failure's data. */
      data: InvalidInputData | null;
    }
  | undefined {
  try {
    serializeJson(value);
  } catch {
    return undefined;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("error" in value) ||
    Object.keys(value).length !== 1
  ) {
    return undefined;
  }

  const error = value.error;

  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    !("message" in error) ||
    !("data" in error) ||
    Object.keys(error).length !== 3 ||
    typeof error.code !== "string"
  ) {
    return undefined;
  }

  for (const code of Object.keys(frameworkFailures) as FrameworkCode[]) {
    const expected = frameworkFailures[code];

    if (error.code !== code || status !== expected.status || error.message !== expected.message) {
      continue;
    }

    if (code === "INVALID_INPUT") {
      if (isInvalidInputData(error.data)) {
        return { code, data: error.data };
      }
    } else if (error.data === null) {
      return { code, data: null };
    }
  }

  return undefined;
}

/**
 * Recognizes a response body that is exactly a framework failure or one of the given
 * declared errors.
 *
 * @remarks
 * Internal; not exported from a public entry point. Used by the generated client to
 * convert responses into {@link RpcError}s. A declared error matches only when its
 * code, status and message all equal one entry of `declared`. Entries using framework
 * codes are ignored.
 *
 * @param value - The parsed response body.
 * @param status - The response's HTTP status.
 * @param declared - The procedure's declared error metadata.
 * @returns The recognized code, message and data, or `undefined` when the body doesn't
 * match exactly.
 */
export function recognizedError(
  value: unknown,
  status: number,
  declared: readonly ErrorMetadata[],
):
  | {
      /** The framework or declared error code. */
      code: string;
      /** The error's message. */
      message: string;
      /** The error's data as received. */
      data: unknown;
    }
  | undefined {
  const framework = recognizedFailure(value, status);

  if (framework) {
    return {
      code: framework.code,
      message: frameworkFailures[framework.code].message,
      data: framework.data,
    };
  }

  try {
    serializeJson(value);
  } catch {
    return undefined;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("error" in value) ||
    Object.keys(value).length !== 1
  ) {
    return undefined;
  }

  const error = value.error;

  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    !("message" in error) ||
    !("data" in error) ||
    Object.keys(error).length !== 3 ||
    typeof error.code !== "string" ||
    typeof error.message !== "string"
  ) {
    return undefined;
  }

  for (const definition of declared) {
    if (
      !Object.hasOwn(frameworkFailures, definition.code) &&
      definition.code === error.code &&
      definition.status === status &&
      definition.message === error.message
    ) {
      return { code: error.code, message: error.message, data: error.data };
    }
  }

  return undefined;
}

type FrameworkError = {
  [Code in FrameworkCode]: RpcError<Code, FrameworkData<Code>>;
}[FrameworkCode];
type DeclaredError<Errors extends ErrorDefinitions> = {
  [Code in keyof Errors & string]: RpcError<Code, OutputOf<Errors[Code]["data"]>>;
}[keyof Errors & string];
/**
 * The errors a generated callable for a procedure can reject with as {@link RpcError}s.
 *
 * @remarks
 * A union discriminated by `code`: one member per framework failure, with
 * {@link InvalidInputData} for `INVALID_INPUT` and `null` data for the others, and one
 * per declared error with its data schema's output type. Import the group
 * with `import type` so server code stays out of the browser bundle.
 *
 * @example
 * ```ts
 * import type { ClientRpcError } from "@loozo/angular-launch";
 * import type todos from "./rpc";
 *
 * type CompleteError = ClientRpcError<typeof todos.procedures.complete>;
 * ```
 *
 * @typeParam Value - A procedure created by `query` or `mutation`.
 */
export type ClientRpcError<Value> =
  Value extends Procedure<infer _Input, infer _Output, infer _Kind, infer Errors, infer _Message>
    ? FrameworkError | DeclaredError<Errors>
    : never;

type Options<Kind extends ProcedureKind> = Kind extends "mutation"
  ? MutationCallOptions
  : Kind extends "stream"
    ? StreamCallOptions
    : Kind extends "channel"
      ? ChannelCallOptions
      : CallOptions;
type Item<Output> = Output extends AsyncIterable<infer Value> ? Value : never;
type Sent<Message> = Message extends Schema ? InputOf<Message> : never;
type Result<Output, Kind extends ProcedureKind, Message> = Kind extends "stream"
  ? AsyncIterable<Item<Output>>
  : Kind extends "channel"
    ? Channel<Item<Output>, Sent<Message>>
    : Promise<Awaited<Output>>;
type Callable<Input, Output, Kind extends ProcedureKind, Message> =
  Input extends Schema<infer Caller, unknown>
    ? (input: Caller, options?: Options<Kind>) => Result<Output, Kind, Message>
    : (options?: Options<Kind>) => Result<Output, Kind, Message>;
type InputOption<Input> =
  Input extends Schema<infer Caller, unknown> ? ConnectInput<Caller> : OptionalConnectInput;
type Connectable<Input, Output, Kind extends ProcedureKind, Message> = Kind extends "stream"
  ? {
      /** Follows the stream as signals; see {@link StreamConnector}. */
      readonly connect: StreamConnector<InputOption<Input>, Item<Output>>;
    }
  : Kind extends "channel"
    ? {
        /** Runs the channel as signals; see {@link ChannelConnector}. */
        readonly connect: ChannelConnector<InputOption<Input>, Item<Output>, Sent<Message>>;
      }
    : {};
/**
 * The generated client callable for a procedure.
 *
 * @remarks
 * The type of `Client<typeof group>["name"]`. A procedure with an input schema is called as
 * `(input, options?)`, where `input` is the schema's input type; one without input is
 * called as `(options?)`. A query or mutation call returns a promise of the handler's
 * awaited result, a stream call an async iterable of its values, and a channel call an open
 * {@link Channel}. Queries take {@link CallOptions}, mutations
 * {@link MutationCallOptions}, streams {@link StreamCallOptions} and channels
 * {@link ChannelCallOptions}. Streams and channels also have `connect()`, which follows them
 * as signals.
 *
 * @typeParam Value - A procedure created by `query`, `mutation`, `stream` or `channel`.
 */
export type ClientProcedure<Value> =
  Value extends Procedure<infer Input, infer Output, infer Kind, infer Errors, infer Message>
    ? Callable<Input, Output, Kind, Message> &
        Connectable<Input, Output, Kind, Message> & {
          /** Whether the procedure is a `"query"`, a `"mutation"`, a `"stream"` or a `"channel"`. */
          readonly kind: Kind;
          /**
           * Whether `error` is an {@link RpcError} returned by this exact procedure.
           *
           * @param error - A value caught from a call.
           * @returns `true` only for errors this procedure's calls rejected with, narrowed to
           * its framework failures and declared errors.
           */
          isError(error: unknown): error is FrameworkError | DeclaredError<Errors>;
        }
    : never;
/**
 * The generated client for an RPC group: one callable per procedure.
 *
 * @remarks
 * Generated `injectRpc()` functions return an object of these, keyed by namespace.
 * Call `injectRpc()` in an Angular injection context where `HttpClient` is provided;
 * the clients it returns can be called later, outside an injection context. Import the
 * group with `import type` so server code stays out of the browser bundle.
 *
 * @example
 * ```ts
 * import type { Client } from "@loozo/angular-launch";
 * import type todos from "./rpc";
 *
 * type Todos = Awaited<ReturnType<Client<typeof todos>["list"]>>;
 * ```
 *
 * @typeParam Value - A group created by `defineRpc`.
 */
export type Client<Value> =
  Value extends Group<string, infer Procedures>
    ? { readonly [Key in keyof Procedures]: ClientProcedure<Procedures[Key]> }
    : never;
