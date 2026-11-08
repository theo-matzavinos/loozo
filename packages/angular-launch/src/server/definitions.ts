import type { JsonShape } from "../json.js";
import type { FrameworkCode } from "../client.js";
import { createErrors, declaredFailures } from "./errors.js";
import type { DeclaredFailure } from "./errors.js";
import type { ResponseControl } from "./response-effects.js";

/**
 * Registration point for the application's context type.
 *
 * @remarks
 * Generation writes `context.generated.d.ts`, which augments this interface with a
 * `context` property typed as the awaited return value of your `defineContext`
 * factory. Don't augment it yourself.
 */
export interface Register {}
/**
 * The application's context type, as registered by generation.
 *
 * @remarks
 * Middleware and handlers start from a value of this type as `context`. It's `never` until
 * generation has registered the context type, so include the generated files in your
 * tsconfig.
 */
export type Context = Register extends { context: infer Value } ? Value : never;

/**
 * A {@link https://standardschema.dev | Standard Schema} V1 validator, from any library
 * or written by hand.
 *
 * @remarks
 * Launch uses schemas for procedure inputs and declared error data. Validation may be
 * asynchronous and may transform the value. For a procedure input, callers pass the
 * input type and the procedure's middleware and handler receive the output type; group
 * middleware receives no input, and the client's success value is the handler's result,
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

/**
 * The application's context factory, created by {@link defineContext}.
 *
 * @typeParam Value - The factory's return type, possibly a promise.
 */
export interface ContextDefinition<Value> {
  /**
   * Creates the context for one live server request, or for one page Angular prerenders.
   *
   * @param request - The request bound to the new request scope: a cookie-less `GET` of
   * the page's URL when Angular prerenders it.
   * @returns The context value, or a promise of it.
   */
  readonly create: (request: Request) => Value;
}

/**
 * Defines the application's per-request server context.
 *
 * @remarks
 * Default-export the call itself from exactly one file in your application's sources,
 * as `export default defineContext(...)`: generation finds it by that default export and
 * registers its awaited return type as {@link Context}. Import `defineContext` by name
 * from this entry point and call it without type arguments; a context assigned to a
 * variable and exported later, or `defineContext<MyContext>(...)`, fails generation.
 * The factory runs once per live server request, for page renders
 * and RPC requests alike, and its value is the `context` middleware and handlers start
 * from. Keep per-request state in the context rather than in module variables.
 *
 * When Angular prerenders a page that calls an RPC, the factory runs at build time with a
 * cookie-less `GET` of the page's URL on a local origin Angular picks, so a prerendered
 * page shows what an anonymous visitor would see.
 *
 * @example
 * ```ts
 * import { defineContext } from "@loozo/angular-launch/server";
 * import { sessions } from "./sessions.server";
 *
 * export default defineContext(async (request: Request) => ({
 *   user: await sessions.authenticate(request),
 * }));
 * ```
 *
 * @typeParam Value - The factory's return type, possibly a promise.
 * @param create - Creates the context for one request. A rejection or throw fails that
 * request: an RPC request returns `INTERNAL`.
 * @returns The context definition to default-export.
 */
export function defineContext<Value>(
  create: (request: Request) => Value,
): ContextDefinition<Value> {
  return { create };
}

/** The awaited context type of a context created by {@link defineContext}. */
export type ContextOf<Definition> =
  Definition extends ContextDefinition<infer Value> ? Awaited<Value> : never;

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
 * Whether a procedure reads (`"query"`), writes (`"mutation"`) or streams values while it
 * runs (`"stream"`).
 */
export type ProcedureKind = "query" | "mutation" | "stream";
// A stream handler yields strict JSON and returns nothing: a returned value would be lost.
type StreamResult<Value> =
  Value extends AsyncIterable<infer Item> ? AsyncIterable<JsonShape<Item>, void> : never;

declare const middlewareResult: unique symbol;

// The keys `Value` may omit. Spreading an object without them keeps the earlier values,
// so the context's type can't follow an addition with optional keys.
type OptionalKeys<Value> = {
  [Key in keyof Value]-?: {} extends Pick<Value, Key> ? Key : never;
}[keyof Value];
// Whether `Value` is a union. `keyof` a union holds only its shared keys, so neither the
// optional-key rule nor the merge could see a key only some members have.
type IsUnion<Value, Whole = Value> = Value extends unknown
  ? [Whole] extends [Value]
    ? false
    : true
  : never;
// What an addition must also satisfy: a single object type whose keys are all required.
// A union becomes `never`; each optional key becomes a required `never`.
type AdditionRule<Value> =
  true extends IsUnion<Value> ? never : { readonly [Key in OptionalKeys<Value>]-?: never };

// Invariant in `Keys`, covariant in `Added`. With a covariant brand alone, TypeScript
// would reduce a middleware's `next({ user: null })` and `next()` results to the
// supertype `{}` and hide the overwrite; with `Added` invariant, `next({ user: null })`
// and `next({ user: maybeUser })` couldn't combine. `Keys` must be a parameter of its
// own: deriving it inside the brand makes TypeScript measure `Added` as invariant.
/**
 * What a middleware's `next()` resolves to, and what the middleware must return.
 *
 * @remarks
 * Opaque: it proves the rest of the call ran, and its type carries what the middleware
 * added to the context. There's no other way to create one.
 *
 * Results that add different keys don't combine, so a middleware whose `next(...)` calls
 * add different keys is a type error rather than a result that hides some of them.
 * Results with the same keys combine only when one's values already include the
 * other's, so a value that differs per branch belongs in one `next()` call.
 *
 * @typeParam Added - The values the middleware passed to `next()`.
 * @typeParam Keys - The keys of `Added`. Leave it to its default.
 */
export interface MiddlewareResult<Added, Keys = keyof Added> {
  /** Type-only brand; absent at runtime. */
  readonly [middlewareResult]: {
    /** The added keys, in both directions so that results only combine with the same keys. */
    readonly keys: (key: Keys) => Keys;
    /** The added values. */
    readonly values: Added;
  };
}

/**
 * What middleware and handlers receive for one call.
 *
 * @typeParam ContextValue - The context at this point of the call.
 * @typeParam Input - The validated input, or `unknown` for group middleware.
 */
export interface CallArgs<ContextValue, Input> {
  /**
   * The context created for the request, with what earlier middleware added to it.
   *
   * @remarks
   * Read-only at the top level: a middleware adds or replaces values through `next()`,
   * so later middleware and the handler see their types. Nested objects stay writable.
   */
  readonly context: Readonly<ContextValue>;
  /**
   * The validated input: the schema's output, or `undefined` without an input schema.
   * Group middleware runs before validation and receives `undefined`.
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
   * has no response, so a cookie set while Angular prerenders it fails the build.
   */
  readonly response: ResponseControl;
}

/**
 * What a middleware receives: the call's arguments and `next`.
 *
 * @remarks
 * Annotate a middleware's argument with this type to declare what it needs: the context
 * values earlier middleware must have added, and the input the procedure's schema must
 * produce. Without an annotation a middleware needs the registered {@link Context} and
 * `unknown` input, so it fits anywhere.
 *
 * @example
 * ```ts
 * export const ownTodo = middleware(
 *   async ({ context, input, next }: MiddlewareArgs<{ user: User; db: Db }, { id: string }>) => {
 *     const todo = await context.db.todos.findForUser(context.user.id, input.id);
 *
 *     if (todo === null) {
 *       throw forbidden();
 *     }
 *
 *     return next({ todo });
 *   },
 * );
 * ```
 *
 * @typeParam Needs - The context the middleware needs. Defaults to {@link Context}.
 * @typeParam Input - The input the middleware needs. Defaults to `unknown`.
 */
export interface MiddlewareArgs<Needs = Context, Input = unknown> extends CallArgs<Needs, Input> {
  /**
   * Continues the call, optionally with values merged into the context.
   *
   * @remarks
   * A function property rather than a method, so destructuring it is safe.
   */
  readonly next: {
    /**
     * Continues the call with the context unchanged.
     *
     * @returns The result to return from the middleware. It rejects with whatever the
     * rest of the call threw, including declared errors and outcomes such as `forbidden()`.
     */
    (): Promise<MiddlewareResult<{}>>;
    /**
     * Continues the call with `added` merged into the context by spread, so later
     * middleware and the handler see its values and types.
     *
     * @remarks
     * `added` must be a single object type whose properties are all required: a missing
     * optional value would leave the earlier one in place, which the context's type can't
     * follow, and a union could hide such a key in one of its members. Write a value that
     * may be missing as `next({ user: maybeUser })` with a type such as `User | null`, and
     * alternatives as a union value: `next({ session: a | b })`.
     *
     * @param added - The values to add or replace.
     * @returns The result to return from the middleware. It rejects with whatever the
     * rest of the call threw, including declared errors and outcomes such as `forbidden()`.
     */
    <Added extends object>(added: Added & AdditionRule<Added>): Promise<MiddlewareResult<Added>>;
  };
}

/**
 * A middleware created by {@link middleware}.
 *
 * @typeParam Needs - The context it needs.
 * @typeParam Added - The values it adds to the context.
 * @typeParam Input - The input it needs.
 */
export interface MiddlewareDefinition<Needs, Added, Input> {
  /** Runs the middleware for one call. */
  readonly run: (args: MiddlewareArgs<Needs, Input>) => Promise<MiddlewareResult<Added>>;
}

// Any middleware, whatever it needs and adds. A result is invariant in the keys it adds,
// so no `MiddlewareDefinition` instantiation is a supertype of every middleware.
type AnyMiddleware = {
  readonly run: (args: never) => Promise<{
    readonly [middlewareResult]: {
      readonly keys: (key: never) => PropertyKey;
      readonly values: object;
    };
  }>;
};

/**
 * Creates a middleware: code that runs around a procedure call, to refuse it, add typed
 * values to its context, or wrap the rest of it.
 *
 * @remarks
 * List middleware in `defineRpc`'s `use` to run it for every procedure in the group, or
 * in a procedure's `use` to run it for that procedure. A call runs the group's
 * middleware with no input, then validates the input, then runs the procedure's
 * middleware with the validated input, then the handler. Middleware runs for every
 * call, also during server rendering, where `request` is the page request, and when
 * Angular prerenders a page, where it's a cookie-less `GET` of the page's URL.
 *
 * `run` must call `next()` exactly once and return its result: calling it twice or
 * returning anything else fails the call with `INTERNAL`. `next(added)` merges `added`
 * into the context by spread, so the context must be a plain object. The context is
 * read-only at the top level: change it through `next()`. Every `next(...)` in a
 * middleware adds the same keys, and a value that differs per branch goes in one
 * `next()` call with a union-typed value, such as
 * `next({ user: preview ? null : context.user })`: separate `next({ user: null })` and
 * `next({ user: context.user })` calls don't infer `User | null` when `context.user` is
 * a `User`. `next()` rejects when anything after it throws, so `await next()` in a `try`
 * wraps the rest of the call.
 *
 * Refuse a call with `throw forbidden()`, which fails it with `FORBIDDEN`, or answer it
 * with `throw notFound()` or `throw redirect(to)`. Any other exception fails it with
 * `INTERNAL` and is logged on the server. Declared errors belong to handlers.
 *
 * @example
 * ```ts
 * import { forbidden, middleware } from "@loozo/angular-launch/server";
 *
 * export const signedIn = middleware(async ({ context, next }) => {
 *   if (context.user === null) {
 *     throw forbidden();
 *   }
 *
 *   return next({ user: context.user });
 * });
 * ```
 *
 * @typeParam Needs - The context it needs, from an annotated argument. Defaults to
 * {@link Context}.
 * @typeParam Added - The values it adds, inferred from what it passes to `next()`.
 * @typeParam Input - The input it needs, from an annotated argument. Defaults to
 * `unknown`.
 * @param run - Runs the middleware for one call.
 * @returns The middleware, to list in a `use` array.
 */
export function middleware<Needs = Context, Added extends object = {}, Input = unknown>(
  run: (args: MiddlewareArgs<Needs, Input>) => Promise<MiddlewareResult<Added>>,
): MiddlewareDefinition<Needs, Added, Input> {
  return { run };
}

// Both spellings of a property key: JavaScript stores `1` and `"1"` as one property, so
// adding either replaces the other. Only a number's canonical spelling counts: `"01"`,
// `"1.0"` and `"1e0"` are separate properties, and TypeScript infers them as `number`.
type KeySpellings<Key> = Key extends number
  ? Key | `${Key}`
  : Key extends `${infer Numeric extends number}`
    ? number extends Numeric
      ? Key
      : `${Numeric}` extends Key
        ? Key | Numeric
        : Key
    : Key;
// Spreads `Added` over each member of `Base`, so a union context keeps its correlation;
// an empty addition leaves `Base` as it is.
type Merge<Base, Added> = [keyof Added] extends [never]
  ? Base
  : Base extends unknown
    ? Omit<Base, KeySpellings<keyof Added>> & Added
    : never;
type Flat<Value> = { [Key in keyof Value]: Value[Key] } & {};
// The context after running `Use` in order on top of `Base`.
type ContextAfter<Base, Use> = Use extends readonly [infer First, ...infer Rest]
  ? First extends MiddlewareDefinition<infer _Needs, infer Added, infer _Input>
    ? ContextAfter<Flat<Merge<Base, Added>>, Rest>
    : Base
  : Base;
// Each entry must accept the context and input accumulated before it, and add a single
// object type with only required keys; a misfit becomes `never`, so the error lands on
// that entry.
type CheckChain<Base, Input, Use> = Use extends readonly [infer First, ...infer Rest]
  ? First extends MiddlewareDefinition<infer Needs, infer Added, infer NeedsInput>
    ? [
        [Base] extends [Needs]
          ? [Input] extends [NeedsInput]
            ? true extends IsUnion<Added>
              ? never
              : [OptionalKeys<Added>] extends [never]
                ? First
                : never
            : never
          : never,
        ...CheckChain<Flat<Merge<Base, Added>>, Input, Rest>,
      ]
    : [never]
  : [];

/**
 * A procedure created by a group's `query` or `mutation` builder.
 *
 * @remarks
 * Procedures are values for `defineRpc`. Their types drive the generated client;
 * the server dispatches calls to them. Don't build one by hand.
 *
 * @typeParam Input - The input schema, or `undefined` without input.
 * @typeParam Output - The handler's return type.
 * @typeParam Kind - Whether the procedure is a query or a mutation.
 * @typeParam Errors - The declared errors.
 */
export interface Procedure<
  Input,
  Output,
  Kind extends ProcedureKind = "query",
  Errors extends ErrorDefinitions = {},
> {
  /** Whether the procedure is a `"query"` or a `"mutation"`. */
  readonly kind: Kind;
  /** The input schema, or `undefined` for a procedure without input. */
  readonly input: Input;
  /** The declared errors, as written in the procedure's options. */
  readonly errors: Errors;
  /** The procedure's middleware, in the order it runs. Empty when none was given. */
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
 * The options a group's `query` and `mutation` builders take.
 *
 * @remarks
 * Write them inline in the call; generation reads them statically.
 *
 * @typeParam ContextValue - The context after the group's middleware.
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
   * Middleware that runs in order after the group's middleware and input validation,
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
    args: CallArgs<ContextAfter<ContextValue, Use>, OutputOf<Input>> & {
      /** One factory per declared error code, creating an error to `throw`. */
      readonly errors: ErrorFactories<Errors>;
    },
  ) => Output & JsonResult<NoInfer<Output>>;
}

/**
 * The options a group's `stream` builder takes: those of `query`, with a handler that
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
    args: CallArgs<ContextAfter<ContextValue, Use>, OutputOf<Input>> & {
      /** One factory per declared error code, creating an error to `throw`. */
      readonly errors: ErrorFactories<Errors>;
    },
  ) => Output & StreamResult<NoInfer<Output>>;
}

/**
 * The `query` and `mutation` builders `defineRpc` passes to its callback.
 *
 * @remarks
 * Function properties rather than methods, so destructuring them is safe.
 *
 * @typeParam ContextValue - The context after the group's middleware.
 */
export interface ProcedureBuilder<ContextValue> {
  /**
   * Defines a procedure that reads data.
   *
   * @remarks
   * The handler receives `{ context, input, errors, request, signal, response }`: the
   * context after the group's and the procedure's middleware, the validated input
   * (`undefined` without an input schema), the error factories for the declared errors,
   * the request the call runs in, its abort signal and its response cookies and headers. Inputs and results must be strict JSON; a
   * result that isn't fails the call with `INTERNAL`. Throwing an error created by
   * `errors` returns that declared error, throwing `forbidden()` fails the call with
   * `FORBIDDEN`, and throwing `notFound()` or `redirect(to)` answers it with that outcome;
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
    const Use extends readonly AnyMiddleware[] = [],
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
   * `FORBIDDEN` before any middleware, validation or the handler runs.
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
    const Use extends readonly AnyMiddleware[] = [],
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
   * be set before that: in middleware before `next()`, or in a handler that isn't a
   * generator. Setting one later throws, and later header changes are ignored.
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
    const Use extends readonly AnyMiddleware[] = [],
    Output extends AsyncIterable<unknown> = AsyncIterable<unknown>,
    const Errors extends ErrorDefinitions = {},
  >(
    options: StreamOptions<ContextValue, Input, Use, Output, Errors>,
  ) => Procedure<Input, Output, "stream", Errors>;
}

// The runtime view of any builder's options; their types are checked at the call site.
interface ProcedureSource {
  readonly input?: unknown;
  readonly use?: readonly AnyMiddleware[];
  readonly errors?: ErrorDefinitions;
  readonly handler: (args: never) => unknown;
}

function procedure(
  kind: ProcedureKind,
  { input, use = [], errors = {}, handler }: ProcedureSource,
): Procedure<unknown, unknown, ProcedureKind, ErrorDefinitions> {
  const { factories, failures } = createErrors(errors);
  const run = handler as (args: object) => unknown;

  return {
    kind,
    input,
    errors,
    use,
    handler: (args) => run({ ...args, errors: factories }),
    [declaredFailures]: failures,
  };
}

// The checked option types above tie each result to its builder's type parameters.
const builder: ProcedureBuilder<never> = {
  query: (options) => procedure("query", options) as never,
  mutation: (options) => procedure("mutation", options) as never,
  stream: (options) => procedure("stream", options) as never,
};

/**
 * The minimal shape `defineRpc` accepts for each procedure.
 *
 * @remarks
 * Create procedures with the `query` and `mutation` builders `defineRpc` passes to its
 * callback; generation rejects any other value.
 */
// Existential boundary: the producer proves every binding is a genuine builder call.
export interface ProcedureDefinition {
  /** Whether the procedure is a `"query"` or a `"mutation"`. */
  readonly kind: ProcedureKind;
}
/**
 * An RPC group created by {@link defineRpc}.
 *
 * @typeParam Name - The group's namespace.
 * @typeParam Procedures - The group's procedures, keyed by name.
 */
export interface Group<
  Name extends string,
  Procedures extends Record<string, ProcedureDefinition>,
> {
  /** The namespace the generated client exposes the group under. */
  readonly name: Name;
  /** The group's procedures, keyed by procedure name. */
  readonly procedures: Procedures;
  /** The group's middleware, in the order it runs. Empty when none was given. */
  readonly use: readonly AnyMiddleware[];
}

/**
 * Defines the RPC group for the route declared in the same directory.
 *
 * @remarks
 * Default-export the result from a file next to the route's `route.ts`; one group per
 * route. That route must be one that gets generated files: not a redirect, and with a
 * page or descendants with pages that aren't all redirects. Generation reads the call
 * statically without running it: import `defineRpc` by name from this entry point and
 * call it directly without type arguments, with a literal identifier other than
 * `__proto__` for the namespace; pass an arrow function whose parameter destructures
 * `query` and/or `mutation` without renaming and whose body is a parenthesized object
 * literal of procedures, each a direct `query(...)` or `mutation(...)` call with inline
 * options; and write the group options inline. Each route's generated `injectRpc()`
 * exposes its own group and its ancestors' groups under their namespaces. Each namespace
 * must be unique across the app: calls go to `/_rpc/<namespace>/<procedure>`.
 *
 * The group's `use` middleware runs for every procedure in the group, before input
 * validation, and the procedures' handlers and middleware see what it adds to the
 * context. It isn't inherited through the route tree.
 *
 * Exposure isn't authorization: anyone who can reach the server can call any
 * procedure, so protect every group and procedure that needs it.
 *
 * @example
 * ```ts
 * import { defineRpc } from "@loozo/angular-launch/server";
 * import { signedIn } from "../../auth.server";
 *
 * export default defineRpc(
 *   "todos",
 *   ({ query }) => ({
 *     list: query({
 *       handler: ({ context }) => context.db.todos.listForUser(context.user.id),
 *     }),
 *   }),
 *   { use: [signedIn] },
 * );
 * ```
 *
 * @typeParam Name - The namespace literal.
 * @typeParam Use - The group's middleware, written inline.
 * @typeParam Procedures - The procedures, keyed by name.
 * @param name - The namespace the generated client exposes the group under.
 * @param build - Returns the procedures, keyed by name, built with the `query` and
 * `mutation` builders it receives.
 * @param options - `use`: middleware that runs for every procedure in the group.
 * @returns The group, to default-export.
 */
export function defineRpc<
  Name extends string,
  const Use extends readonly AnyMiddleware[] = [],
  Procedures extends Record<string, ProcedureDefinition> = {},
>(
  name: Name,
  build: (builder: ProcedureBuilder<ContextAfter<Context, Use>>) => Procedures,
  {
    use,
  }: {
    /**
     * Middleware that runs in order for every call to any procedure in the group, before
     * input validation and the procedure's own middleware. It receives no input. Each
     * entry must accept the context before it.
     */
    readonly use?: Use & CheckChain<Context, unknown, NoInfer<Use>>;
  } = {},
): Group<Name, Procedures> {
  return { name, procedures: build(builder), use: use ?? [] };
}
