import type { JsonShape } from "../json.js";
import type { FrameworkCode } from "../client.js";
import { createErrors, declaredFailures } from "./errors.js";
import type { DeclaredFailure } from "./errors.js";
import type { ResponseControl } from "./response-effects.js";

/**
 * A {@link https://standardschema.dev | Standard Schema} V1 validator, from any library
 * or written by hand.
 *
 * @remarks
 * Launch uses schemas for procedure inputs and declared error data. Validation may be
 * asynchronous and may transform the value. For a procedure input, callers pass the
 * input type and the procedure's middleware and handler receive the output type; a
 * route's `.use()` middleware receives no input, and the client's success value is the handler's result,
 * not a schema output. For declared error data, the client receives the output type.
 *
 * @example
 * ```ts
 * import type { Schema } from "@loozo/angular-launch/server";
 *
 * export const idSchema: Schema<{ id: string }> = {
 *   "~standard": {
 *     version: 1,
 *     vendor: "todos",
 *     validate: (value) => {
 *       if (
 *         typeof value !== "object" ||
 *         value === null ||
 *         !("id" in value) ||
 *         typeof value.id !== "string"
 *       ) {
 *         return { issues: [{ message: "Expected { id: string }" }] };
 *       }
 *
 *       return { value: { id: value.id } };
 *     },
 *   },
 * };
 * ```
 *
 * @typeParam Input - The type callers pass in.
 * @typeParam Output - The validated, possibly transformed type.
 */
// Structural Standard Schema V1 contract; validators may asynchronously transform.
export interface Schema<Input = unknown, Output = Input> {
  /** The Standard Schema V1 interface. */
  readonly "~standard": {
    /** The Standard Schema version: always `1`. */
    readonly version: 1;
    /** The name of the schema library, or your own name for a handwritten schema. */
    readonly vendor: string;
    /** Type-only witnesses for the input and output types; not needed at runtime. */
    readonly types?: {
      /** The type callers pass in. */
      readonly input: Input;
      /** The validated, possibly transformed type. */
      readonly output: Output;
    };
    /**
     * Validates an unknown value, synchronously or asynchronously.
     *
     * @param value - The value to validate.
     * @returns `{ value }` with the output on success, or `{ issues }` on failure.
     */
    readonly validate: (value: unknown) =>
      | {
          /** The validated, possibly transformed value. */
          readonly value: Output;
          /** Absent on success. */
          readonly issues?: undefined;
        }
      | {
          /**
           * The problems found, which mark a failure. For a procedure input, each issue's
           * message and path are sent to the client as `INVALID_INPUT` data.
           */
          readonly issues: readonly {
            /** A description of the problem. */
            readonly message: string;
            /** Where the problem is: property keys, or `{ key }` segments. */
            readonly path?:
              | readonly (
                  | PropertyKey
                  | {
                      /** The segment's property key. */
                      readonly key: PropertyKey;
                    }
                )[]
              | undefined;
          }[];
        }
      | Promise<
          | {
              /** The validated, possibly transformed value. */
              readonly value: Output;
              /** Absent on success. */
              readonly issues?: undefined;
            }
          | {
              /**
               * The problems found, which mark a failure. For a procedure input, each issue's
               * message and path are sent to the client as `INVALID_INPUT` data.
               */
              readonly issues: readonly {
                /** A description of the problem. */
                readonly message: string;
                /** Where the problem is: property keys, or `{ key }` segments. */
                readonly path?:
                  | readonly (
                      | PropertyKey
                      | {
                          /** The segment's property key. */
                          readonly key: PropertyKey;
                        }
                    )[]
                  | undefined;
              }[];
            }
        >;
  };
}
/** The type callers pass to a schema: its Standard Schema input type. */
export type InputOf<S extends Schema> = NonNullable<S["~standard"]["types"]>["input"];
/**
 * The validated type a schema produces, or `undefined` when `S` isn't a schema, such
 * as for a procedure without input.
 */
export type OutputOf<S> = S extends Schema<unknown, infer Output> ? Output : undefined;

type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type StatusNumber<Value> = Value extends `${infer Status extends number}` ? Status : never;
/** An HTTP error status from 400 to 599, as an integer literal type. */
export type ErrorStatus = StatusNumber<`${4 | 5}${Digit}${Digit}`>;

/**
 * The declaration of one error a procedure can return.
 *
 * @remarks
 * Declare errors inline in `query` or `mutation`. The type is public so that
 * application code can name a procedure's `errors` metadata.
 *
 * @typeParam Data - The schema for the error's data.
 */
export interface ErrorDefinition<Data extends Schema = Schema> {
  /** The HTTP status the error is sent with: an integer literal from 400 to 599. */
  readonly status: ErrorStatus;
  /** The public message sent with every instance of the error: a non-empty literal. */
  readonly message: string;
  /**
   * The schema the server validates the error's data with before sending it. Use a
   * `Schema<null>` for an error without data.
   */
  readonly data: Data;
}
/**
 * A procedure's declared errors, keyed by error code.
 *
 * @remarks
 * Codes are identifiers. The framework codes in `frameworkFailures` and `__proto__`
 * can't be declared.
 */
export type ErrorDefinitions = Readonly<Record<string, ErrorDefinition>>;
/**
 * The `errors` a handler receives: one factory per declared error code.
 *
 * @remarks
 * A factory creates an error to `throw` from the handler. The server validates its
 * data with the declared schema and sends it with the declared status and message;
 * data that fails validation turns the response into `INTERNAL`. Only throwing an
 * error created by the same procedure's factory produces a declared error response.
 *
 * @typeParam Definitions - The procedure's declared errors.
 */
export type ErrorFactories<Definitions extends ErrorDefinitions> = {
  readonly [Code in keyof Definitions]: (data: InputOf<Definitions[Code]["data"]>) => Error;
};

type JsonContract<Value> = 0 extends 1 & Value
  ? never
  : [Value] extends [JsonShape<Value>]
    ? unknown
    : never;
type InputContract<Input> = Input extends Schema ? JsonContract<InputOf<Input>> : unknown;
type MessageContract<Message> = Message extends Schema ? JsonContract<InputOf<Message>> : never;
type ErrorContract<Definitions extends ErrorDefinitions> = {
  readonly [Code in keyof Definitions]: Code extends FrameworkCode | "__proto__"
    ? never
    : Definitions[Code]["message"] extends ""
      ? never
      : Definitions[Code] & JsonContract<OutputOf<Definitions[Code]["data"]>>;
};
type JsonResult<Value> =
  Value extends Promise<infer Result> ? Promise<JsonShape<Result>> : JsonShape<Value>;

/**
 * Whether a procedure reads (`"query"`), writes (`"mutation"`), streams values while it
 * runs (`"stream"`) or talks both ways over a websocket (`"channel"`).
 */
export type ProcedureKind = "query" | "mutation" | "stream" | "channel";
// A stream handler yields strict JSON and returns nothing: a returned value would be lost.
type StreamResult<Value> =
  Value extends AsyncIterable<infer Item> ? AsyncIterable<JsonShape<Item>, void> : never;

declare const middlewareResult: unique symbol;

/**
 * What a middleware's `next()` resolves to, and what the middleware must return.
 *
 * @remarks
 * Opaque: it proves the rest of the call ran. There's no other way to create one.
 */
export interface MiddlewareResult {
  /** Type-only brand; absent at runtime. */
  readonly [middlewareResult]: true;
}

/**
 * What a route's `.context()` stage receives.
 *
 * @remarks
 * A stage runs at most once per request scope, the first time a call needs it, and returns
 * the whole context the stages, middleware and handlers below it receive: spread `context`
 * to keep its keys. Annotate a standalone stage's argument with this type and the context
 * it receives.
 *
 * @example
 * ```ts
 * import { redirect, type StageArgs } from "@loozo/angular-launch/server";
 * import type { Context } from "./routes/route.generated";
 * import { destination as signIn } from "./routes/sign-in/destination.generated";
 *
 * export function signedIn({ context }: StageArgs<Context>) {
 *   if (context.user === null) {
 *     throw redirect(signIn, {});
 *   }
 *
 *   return { ...context, user: context.user };
 * }
 * ```
 *
 * @typeParam ContextValue - The context of the stages above this one; `{}` for the first.
 */
export interface StageArgs<ContextValue> {
  /** The context of the stages above this one, read-only at the top level. */
  readonly context: Readonly<ContextValue>;
  /**
   * The request scope's request: the scope's copy of the RPC HTTP request or of the page
   * request, or, when Angular prerenders a page, a cookie-less `GET` of its URL.
   */
  readonly request: Request;
  /**
   * The cookies and headers of the call that first needed this stage. A stage runs once
   * per scope, so its cookies go out once, with that call's response.
   */
  readonly response: ResponseControl;
  /** The request scope's signal: it aborts when the request does. */
  readonly signal: AbortSignal;
}

/**
 * What middleware and handlers receive for one call.
 *
 * @typeParam ContextValue - The context of the call: what the route's stages returned.
 * @typeParam Input - The validated input, or `unknown` for a route's `.use()` middleware.
 */
export interface CallArgs<ContextValue, Input> {
  /**
   * The context the owning route's stages built for the request scope, root first.
   *
   * @remarks
   * Read-only at the top level. Nested objects stay writable.
   */
  readonly context: Readonly<ContextValue>;
  /**
   * The validated input: the schema's output, or `undefined` without an input schema.
   * A route's `.use()` middleware runs before validation and receives `undefined`.
   */
  readonly input: Input;
  /**
   * The live request the call runs in, bound to its request scope: the scope's copy of
   * the RPC HTTP request, or, during server rendering, the page request given to Angular.
   * When Angular prerenders a page, it's a cookie-less `GET` of the page's URL.
   */
  readonly request: Request;
  /**
   * Aborts when the caller goes away: over HTTP when the incoming request's signal
   * aborts, and during server rendering when the page request aborts or `HttpClient`
   * unsubscribes before the call settled. When Angular prerenders a page, the page
   * request aborts when the render's application is destroyed. Advisory: pass it on to work that accepts one.
   */
  readonly signal: AbortSignal;
  /**
   * The call's cookies and headers. Over HTTP they go on the RPC response; during server
   * rendering, cookies go on the page response and headers are dropped. A prerendered page
   * has no response, so a cookie set while Angular prerenders it fails the build, unless
   * it's set after the app is first stable, such as in a `BEFORE_APP_SERIALIZED` hook.
   */
  readonly response: ResponseControl;
}

/**
 * What a middleware receives: the call's arguments and `next`.
 *
 * @remarks
 * Annotate a standalone middleware's argument with this type, or pass `middleware` its
 * type arguments, to declare what it needs: the context the route's stages must have
 * built, and the input the procedure's schema must produce. Without them a middleware
 * needs nothing, so it fits anywhere.
 *
 * @example
 * ```ts
 * export const audit = middleware<{ user: User }>(async ({ context, next }) => {
 *   log(context.user.id);
 *
 *   return next();
 * });
 * ```
 *
 * @typeParam Needs - The context the middleware needs. Defaults to `{}`.
 * @typeParam Input - The input the middleware needs. Defaults to `unknown`.
 */
export interface MiddlewareArgs<Needs = {}, Input = unknown> extends CallArgs<Needs, Input> {
  /**
   * Continues the call.
   *
   * @remarks
   * A function property rather than a method, so destructuring it is safe. Middleware
   * doesn't change the context; a route's `.context()` stage does.
   *
   * @returns The result to return from the middleware. It rejects with whatever the rest
   * of the call threw, including declared errors and outcomes such as `forbidden()`.
   */
  readonly next: () => Promise<MiddlewareResult>;
}

/**
 * A middleware created by {@link middleware}.
 *
 * @typeParam Needs - The context it needs.
 * @typeParam Input - The input it needs.
 */
export interface MiddlewareDefinition<Needs = {}, Input = unknown> {
  /** Runs the middleware for one call. */
  readonly run: (args: MiddlewareArgs<Needs, Input>) => Promise<MiddlewareResult>;
}

// Any middleware, whatever it needs: a `middleware()` definition or a bare function.
type AnyMiddleware =
  | { readonly run: (args: never) => Promise<MiddlewareResult> }
  | ((args: never) => Promise<MiddlewareResult>);

// What a procedure's `use` lists: any `middleware()` definition, which `CheckChain` checks,
// or a bare function, typed with the declaring route's context and the validated input.
// Only the function takes the context and input: a union with `(args: never) => …` would
// type a bare arrow's argument as `never`.
type ProcedureMiddleware<ContextValue, Input> =
  | { readonly run: (args: never) => Promise<MiddlewareResult> }
  | MiddlewareDefinition<ContextValue, Input>["run"];

/**
 * Creates a middleware: code that runs around a procedure call, to refuse it or wrap the
 * rest of it.
 *
 * @remarks
 * List middleware in a route's `.use()` to run it for that route's own procedures, or in
 * a procedure's `use` to run it for that procedure. Those lists also take a bare `run`
 * function, typed with the route's context and, on a procedure, the validated input, so use
 * `middleware` for middleware you share. A call runs the owning route's stages,
 * then its `.use()` middleware with no input, then validates the input, then runs the
 * procedure's middleware with the validated input, then the handler. Middleware runs for
 * every call, also during server rendering, where `request` is the page request, and when
 * Angular prerenders a page, where it's a cookie-less `GET` of the page's URL. A route's
 * `.use()` isn't inherited: a child route's procedures don't run it.
 *
 * `run` must call `next()` exactly once and return its result: calling it twice or
 * returning anything else fails the call with `INTERNAL`. `next()` rejects when anything
 * after it throws, so `await next()` in a `try` wraps the rest of the call. Middleware
 * can't add to the context: derive values in a `.context()` stage instead.
 *
 * Refuse a call with `throw forbidden()`, which fails it with `FORBIDDEN`, or answer it
 * with `throw notFound()` or `throw redirect(destination, values)`. Any other exception fails it with
 * `INTERNAL` and is logged on the server. Declared errors belong to handlers.
 *
 * @example
 * ```ts
 * import { middleware } from "@loozo/angular-launch/server";
 *
 * export const timing = middleware(async ({ next, response }) => {
 *   const start = performance.now();
 *
 *   try {
 *     return await next();
 *   } finally {
 *     response.headers.append("server-timing", `rpc;dur=${performance.now() - start}`);
 *   }
 * });
 * ```
 *
 * @typeParam Needs - The context it needs. Defaults to `{}`, also when the call is written
 * inline in `.use()`: pass the keys it reads, as in `middleware<{ user: User }>(…)`, or
 * write a bare function there instead.
 * @typeParam Input - The input it needs. Defaults to `unknown`.
 * @param run - Runs the middleware for one call.
 * @returns The middleware, to list in `.use()` or a procedure's `use`.
 */
export function middleware<Needs = {}, Input = unknown>(
  run: (args: MiddlewareArgs<Needs, Input>) => Promise<MiddlewareResult>,
): MiddlewareDefinition<Needs, Input> {
  return { run };
}

// Each `middleware()` entry must accept the context and the input; a misfit becomes
// `never`, so the error lands on that entry. A bare function passes: `ProcedureMiddleware`
// already typed it with both. While `Use` is still being inferred it's an array, not a
// tuple: every entry then fits the context and input, which types a bare arrow's argument.
type CheckChain<ContextValue, Input, Use> = Use extends readonly []
  ? []
  : Use extends readonly [infer First, ...infer Rest]
    ? First extends MiddlewareDefinition<infer Needs, infer NeedsInput>
      ? [
          [ContextValue] extends [Needs] ? ([Input] extends [NeedsInput] ? First : never) : never,
          ...CheckChain<ContextValue, Input, Rest>,
        ]
      : First extends (args: never) => Promise<MiddlewareResult>
        ? [First, ...CheckChain<ContextValue, Input, Rest>]
        : [never]
    : readonly (
        | MiddlewareDefinition<ContextValue, Input>
        | MiddlewareDefinition<ContextValue, Input>["run"]
      )[];

/**
 * A procedure created by a `.remote()` builder's `query`, `mutation`, `stream` or
 * `channel`.
 *
 * @remarks
 * Procedures are values in a route's `.remote()` namespaces. Their types drive the
 * route's client; the server dispatches calls to them. Don't build one by hand.
 *
 * @typeParam Input - The input schema, or `undefined` without input.
 * @typeParam Output - The handler's return type.
 * @typeParam Kind - Whether the procedure is a query, a mutation, a stream or a channel.
 * @typeParam Errors - The declared errors.
 * @typeParam Message - A channel's message schema; `undefined` for the other kinds.
 */
export interface Procedure<
  Input,
  Output,
  Kind extends ProcedureKind = "query",
  Errors extends ErrorDefinitions = {},
  Message = undefined,
> {
  /** Whether the procedure is a `"query"`, a `"mutation"`, a `"stream"` or a `"channel"`. */
  readonly kind: Kind;
  /** The input schema, or `undefined` for a procedure without input. */
  readonly input: Input;
  /**
   * The schema a channel validates each message from its caller with; `undefined` for the
   * other kinds.
   */
  readonly message: Message;
  /** The declared errors, as written in the procedure's options. */
  readonly errors: Errors;
  /**
   * The procedure's middleware, `middleware()` definitions and bare functions, in the order
   * it runs. Empty when none was given.
   */
  readonly use: readonly AnyMiddleware[];
  /**
   * Runs the authored handler with the procedure's own error factories.
   *
   * @param args - The call's arguments. Any `errors` passed here are ignored in favor of
   * the procedure's own factories.
   * @returns The handler's result.
   */
  readonly handler: (args: CallArgs<never, never>) => Output | Promise<Output>;
  /** Internal record of errors created by this procedure's factories; not public API. */
  readonly [declaredFailures]: WeakMap<object, DeclaredFailure>;
}

/**
 * The options the `query` and `mutation` builders take.
 *
 * @remarks
 * Write them inline in the call; generation reads them statically.
 *
 * @typeParam ContextValue - The context the declaring route's stages build.
 * @typeParam Input - The input schema, or `undefined` without input.
 * @typeParam Use - The procedure's middleware.
 * @typeParam Output - The handler's return type.
 * @typeParam Errors - The declared errors.
 */
export interface ProcedureOptions<
  ContextValue,
  Input,
  Use extends readonly AnyMiddleware[],
  Output,
  Errors extends ErrorDefinitions,
> {
  /** The schema the server validates the input with; omit it for a procedure without input. */
  readonly input?: Input & InputContract<NoInfer<Input>>;
  /**
   * Middleware that runs in order after the route's `.use()` middleware and input validation,
   * with the validated input. Each entry must accept the context and input before it.
   */
  readonly use?: Use & CheckChain<ContextValue, OutputOf<Input>, NoInfer<Use>>;
  /** The declared errors, keyed by error code. */
  readonly errors?: Errors & ErrorContract<NoInfer<Errors>>;
  /**
   * Runs the call and returns its strict JSON result.
   *
   * @param args - The call's arguments and the error factories.
   * @returns The call's result, or a promise of it.
   */
  readonly handler: (
    args: CallArgs<ContextValue, OutputOf<Input>> & {
      /** One factory per declared error code, creating an error to `throw`. */
      readonly errors: ErrorFactories<Errors>;
    },
  ) => Output & JsonResult<NoInfer<Output>>;
}

/**
 * The options the `stream` builder takes: those of `query`, with a handler that
 * returns an async iterable, usually an `async function*`.
 */
export interface StreamOptions<
  ContextValue,
  Input,
  Use extends readonly AnyMiddleware[],
  Output,
  Errors extends ErrorDefinitions,
> extends Omit<ProcedureOptions<ContextValue, Input, Use, Output, Errors>, "handler"> {
  /**
   * Runs the stream: each value it yields is sent to the caller as strict JSON, until it
   * returns or throws.
   */
  readonly handler: (
    args: CallArgs<ContextValue, OutputOf<Input>> & {
      /** One factory per declared error code, creating an error to `throw`. */
      readonly errors: ErrorFactories<Errors>;
    },
  ) => Output & StreamResult<NoInfer<Output>>;
}

/**
 * The options the `channel` builder takes: those of `stream`, with a required
 * `message` schema and a handler that also receives the caller's `messages`.
 */
export interface ChannelOptions<
  ContextValue,
  Input,
  Message,
  Use extends readonly AnyMiddleware[],
  Output,
  Errors extends ErrorDefinitions,
> extends Omit<ProcedureOptions<ContextValue, Input, Use, Output, Errors>, "handler"> {
  /**
   * The schema the server validates each message from the caller with, when the handler
   * reads it. Its caller input type is what the client's `send` takes.
   */
  readonly message: Message & MessageContract<NoInfer<Message>>;
  /**
   * Runs the channel: each value it yields is sent to the caller as strict JSON, until it
   * returns or throws.
   */
  readonly handler: (
    args: CallArgs<ContextValue, OutputOf<Input>> & {
      /** One factory per declared error code, creating an error to `throw`. */
      readonly errors: ErrorFactories<Errors>;
      /**
       * The caller's messages, validated with `message` as they're read, in arrival order.
       *
       * @remarks
       * One consumer only: a second iterator throws. Iteration ends when the caller closes
       * the channel. A message that fails validation ends the call with `INVALID_INPUT` and
       * the schema's issues.
       */
      readonly messages: AsyncIterable<OutputOf<Message>>;
    },
  ) => Output & StreamResult<NoInfer<Output>>;
}

/**
 * The `query`, `mutation`, `stream` and `channel` builders a route's `.remote()` passes to
 * its callback.
 *
 * @remarks
 * Function properties rather than methods, so destructuring them is safe.
 *
 * @typeParam ContextValue - The context the declaring route's stages build.
 */
export interface ProcedureBuilder<ContextValue> {
  /**
   * Defines a procedure that reads data.
   *
   * @remarks
   * The handler receives `{ context, input, errors, request, signal, response }`: the
   * context the declaring route's stages built, the validated input
   * (`undefined` without an input schema), the error factories for the declared errors,
   * the request the call runs in, its abort signal and its response cookies and headers. Inputs and results must be strict JSON; a
   * result that isn't fails the call with `INTERNAL`. Throwing an error created by
   * `errors` returns that declared error, throwing `forbidden()` fails the call with
   * `FORBIDDEN`, and throwing `notFound()` or `redirect()` answers it with that outcome;
   * any other exception fails the call with `INTERNAL` and is logged on the server.
   *
   * An explicit `input` schema must have a concrete type, without `undefined`, `null`,
   * `any` or `unknown` branches, or generation fails: `Schema<string> | undefined` is
   * rejected. The schema's caller input type may still be a JSON union, as in
   * `Schema<string | number, number>`.
   *
   * Query responses are stored in Angular's HTTP transfer cache during server rendering
   * by default, so hydration reuses them.
   *
   * @example
   * ```ts
   * list: query({
   *   handler: ({ context, signal }) => context.db.todos.listForUser(context.user.id, { signal }),
   * }),
   * ```
   *
   * @typeParam Input - The input schema; omit `input` for a procedure without input.
   * @typeParam Use - The procedure's middleware, written inline.
   * @typeParam Output - The handler's return type.
   * @typeParam Errors - The declared errors, written inline.
   * @param options - The procedure's `input` schema, `use` middleware, inline `errors`
   * declarations and `handler`.
   * @returns The procedure, to use as a value in the callback's result.
   * @throws TypeError when a declared error is invalid: its code isn't an identifier, is
   * `__proto__` or a framework code, its status isn't an integer from 400 to 599, its
   * message is empty, or its data isn't a Standard Schema V1.
   */
  readonly query: <
    Input extends Schema | undefined = undefined,
    const Use extends readonly ProcedureMiddleware<ContextValue, OutputOf<Input>>[] =
      readonly ProcedureMiddleware<ContextValue, OutputOf<Input>>[],
    Output = unknown,
    const Errors extends ErrorDefinitions = {},
  >(
    options: ProcedureOptions<ContextValue, Input, Use, Output, Errors>,
  ) => Procedure<Input, Output, "query", Errors>;
  /**
   * Defines a procedure that writes data.
   *
   * @remarks
   * Takes the same options as `query`, and its handler receives the same arguments.
   *
   * Mutations never use the HTTP transfer cache. During server rendering they fail with
   * `FORBIDDEN` before any stage, middleware, validation or the handler runs.
   *
   * @example
   * ```ts
   * add: mutation({
   *   input: titleSchema,
   *   handler: ({ input, context }) => context.db.todos.addForUser(context.user.id, input.title),
   * }),
   * ```
   *
   * @typeParam Input - The input schema; omit `input` for a procedure without input.
   * @typeParam Use - The procedure's middleware, written inline.
   * @typeParam Output - The handler's return type.
   * @typeParam Errors - The declared errors, written inline.
   * @param options - The procedure's `input` schema, `use` middleware, inline `errors`
   * declarations and `handler`.
   * @returns The procedure, to use as a value in the callback's result.
   * @throws TypeError when a declared error is invalid, as for `query`.
   */
  readonly mutation: <
    Input extends Schema | undefined = undefined,
    const Use extends readonly ProcedureMiddleware<ContextValue, OutputOf<Input>>[] =
      readonly ProcedureMiddleware<ContextValue, OutputOf<Input>>[],
    Output = unknown,
    const Errors extends ErrorDefinitions = {},
  >(
    options: ProcedureOptions<ContextValue, Input, Use, Output, Errors>,
  ) => Procedure<Input, Output, "mutation", Errors>;
  /**
   * Defines a procedure that sends values while it runs: a stream.
   *
   * @remarks
   * Takes the same options as `query`, except that the handler returns an async iterable,
   * usually written as `handler: async function* ({ context, input, signal }) { … }`. Each
   * value it yields reaches the caller as soon as it's yielded.
   *
   * The stream's response starts once the handler returned its iterable, so cookies must
   * be set before that: in a stage, in middleware before `next()`, or in a handler that
   * isn't a generator. A stage's cookies are set before the iterable starts. Setting one later throws, and later header changes are ignored.
   *
   * @example
   * ```ts
   * watch: stream({
   *   input: idSchema,
   *   handler: async function* ({ context, input, signal }) {
   *     for await (const chat of context.chats.changes(input.id, { signal })) {
   *       yield chat;
   *     }
   *   },
   * }),
   * ```
   */
  readonly stream: <
    Input extends Schema | undefined = undefined,
    const Use extends readonly ProcedureMiddleware<ContextValue, OutputOf<Input>>[] =
      readonly ProcedureMiddleware<ContextValue, OutputOf<Input>>[],
    Output extends AsyncIterable<unknown> = AsyncIterable<unknown>,
    const Errors extends ErrorDefinitions = {},
  >(
    options: StreamOptions<ContextValue, Input, Use, Output, Errors>,
  ) => Procedure<Input, Output, "stream", Errors>;
  /**
   * Defines a procedure that talks both ways over a websocket: a channel.
   *
   * @remarks
   * Takes a stream's options plus a required `message` schema. The handler is a stream
   * handler that also receives `messages`, the caller's messages validated with `message` as
   * it reads them, written as `handler: async function* ({ context, input, messages }) { … }`.
   * Each value it yields reaches the caller as soon as the caller has room for it; a slow
   * reader pauses the handler at its `yield`, and a handler that stops reading `messages`
   * makes the caller's `send` wait.
   *
   * The call runs over `GET /_rpc/<namespace>/<procedure>?input=…` upgraded to a websocket by
   * the generated `handleUpgrade`, not `handleRequest`. The route's stages, middleware, input
   * validation and the handler run before the upgrade's `101` response, which carries the
   * call's cookies and headers, so cookies follow a stream's rules: set them in a stage, in
   * middleware before `next()` or in a handler that isn't a generator. During server
   * rendering a channel fails with `FORBIDDEN` before any stage or middleware runs.
   *
   * @example
   * ```ts
   * talk: channel({
   *   input: chatSchema,
   *   message: textSchema,
   *   handler: async function* ({ context, input, messages, signal }) {
   *     yield { kind: "history", messages: await context.chats.history(input.chatId) };
   *
   *     for await (const message of messages) {
   *       yield { kind: "answer", text: await context.chats.answer(input.chatId, message.text, signal) };
   *     }
   *   },
   * }),
   * ```
   */
  readonly channel: <
    Input extends Schema | undefined = undefined,
    Message extends Schema = Schema,
    const Use extends readonly ProcedureMiddleware<ContextValue, OutputOf<Input>>[] =
      readonly ProcedureMiddleware<ContextValue, OutputOf<Input>>[],
    Output extends AsyncIterable<unknown> = AsyncIterable<unknown>,
    const Errors extends ErrorDefinitions = {},
  >(
    options: ChannelOptions<ContextValue, Input, Message, Use, Output, Errors>,
  ) => Procedure<Input, Output, "channel", Errors, Message>;
}

// The runtime view of any builder's options; their types are checked at the call site.
interface ProcedureSource {
  readonly input?: unknown;
  readonly message?: unknown;
  readonly use?: readonly AnyMiddleware[];
  readonly errors?: ErrorDefinitions;
  readonly handler: (args: never) => unknown;
}

function procedure(
  kind: ProcedureKind,
  { input, message, use = [], errors = {}, handler }: ProcedureSource,
): Procedure<unknown, unknown, ProcedureKind, ErrorDefinitions, unknown> {
  const { factories, failures } = createErrors(errors);
  const run = handler as (args: object) => unknown;

  return {
    kind,
    input,
    message,
    errors,
    use,
    handler: (args) => run({ ...args, errors: factories }),
    [declaredFailures]: failures,
  };
}

// The checked option types above tie each result to its builder's type parameters.
export const builder: ProcedureBuilder<never> = {
  query: (options) => procedure("query", options) as never,
  mutation: (options) => procedure("mutation", options) as never,
  stream: (options) => procedure("stream", options) as never,
  channel: (options) => procedure("channel", options) as never,
};

/**
 * The minimal shape `.remote()` accepts for each procedure.
 *
 * @remarks
 * Create procedures with the builders `.remote()` passes to its callback; generation
 * rejects any other value.
 */
// Existential boundary: the producer proves every binding is a genuine builder call.
export interface ProcedureDefinition {
  /** Whether the procedure is a `"query"`, a `"mutation"`, a `"stream"` or a `"channel"`. */
  readonly kind: ProcedureKind;
}
