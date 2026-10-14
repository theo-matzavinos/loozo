import type { JsonShape } from "../json.js";
import type { FrameworkCode } from "../client.js";
import { createErrors, declaredFailures } from "./errors.js";
import type { DeclaredFailure } from "./errors.js";

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
 * Handlers and guards receive a value of this type as `context`. It's `never` until
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
 * input type and the procedure's guards and handler receive the output type; group
 * guards receive no input, and the client's success value is the handler's result,
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
          /** The problems found, which mark a failure. Not sent to clients. */
          readonly issues: readonly {
            /** A description of the problem. */
            readonly message: string;
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
              /** The problems found, which mark a failure. Not sent to clients. */
              readonly issues: readonly {
                /** A description of the problem. */
                readonly message: string;
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
   * Creates the context for one live server request.
   *
   * @param request - The request bound to the new request scope.
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
 * and RPC requests alike, and its value is what handlers and guards receive as
 * `context`. Keep per-request state in the context rather than in module variables.
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

/** The awaited context type of a {@link ContextDefinition}. */
export type ContextOf<Definition> =
  Definition extends ContextDefinition<infer Value> ? Awaited<Value> : never;

/**
 * A group guard, passed to `defineRpc` in `canActivate`.
 *
 * @remarks
 * Group guards run after input validation and before the procedure's guards, for
 * every procedure in the group. Returning `false` fails the call with `FORBIDDEN`;
 * throwing fails it with `INTERNAL`. Guards aren't inherited through the route tree
 * and don't narrow types.
 *
 * @example
 * ```ts
 * import type { Guard } from "@loozo/angular-launch/server";
 *
 * export const isSignedIn: Guard = ({ context }) => context.user !== null;
 * ```
 */
export type Guard = (args: {
  /** The context created for the request. */
  readonly context: Context;
  /**
   * The live request the call runs in, bound to its request scope: the scope's copy of
   * the RPC HTTP request, or, during server rendering, the page request given to Angular.
   */
  readonly request: Request;
}) => boolean | Promise<boolean>;
/**
 * A procedure guard, passed to `query` or `mutation` in `canActivate`.
 *
 * @remarks
 * Procedure guards run after the group's guards and receive the validated input as
 * well. Returning `false` fails the call with `FORBIDDEN`; throwing fails it with
 * `INTERNAL`.
 *
 * @typeParam Input - The procedure's input schema, or `undefined` without input.
 */
export type ProcedureGuard<Input> = (args: {
  /** The context created for the request. */
  readonly context: Context;
  /**
   * The live request the call runs in, bound to its request scope: the scope's copy of
   * the RPC HTTP request, or, during server rendering, the page request given to Angular.
   */
  readonly request: Request;
  /** The validated input: the schema's output, or `undefined` without an input schema. */
  readonly input: OutputOf<Input>;
}) => boolean | Promise<boolean>;
type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type StatusNumber<Value> = Value extends `${infer Status extends number}` ? Status : never;
/** An HTTP error status from 400 to 599, as an integer literal type. */
export type ErrorStatus = StatusNumber<`${4 | 5}${Digit}${Digit}`>;

/**
 * The declaration of one error a procedure can return.
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

/** Whether a procedure reads (`"query"`) or writes (`"mutation"`). */
export type ProcedureKind = "query" | "mutation";
/**
 * A procedure created by {@link query} or {@link mutation}.
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
  /** The procedure's guards, in the order they run. Empty when none were given. */
  readonly canActivate: readonly ProcedureGuard<Input>[];
  /**
   * Runs the authored handler with the procedure's own error factories.
   *
   * @param args - The context and the validated input. Any `errors` passed here are
   * ignored in favor of the procedure's own factories.
   * @returns The handler's result.
   */
  readonly handler: (args: {
    /** The context created for the request. */
    readonly context: Context;
    /** The validated input: the schema's output, or `undefined` without an input schema. */
    readonly input: OutputOf<Input>;
    /** Ignored; the authored handler receives the procedure's own factories. */
    readonly errors: ErrorFactories<Errors>;
  }) => Output | Promise<Output>;
  /** Internal record of errors created by this procedure's factories; not public API. */
  readonly [declaredFailures]: WeakMap<object, DeclaredFailure>;
}

interface ProcedureOptions<Input, Output, Errors extends ErrorDefinitions> {
  readonly input?: Input & InputContract<NoInfer<Input>>;
  readonly errors?: Errors & ErrorContract<NoInfer<Errors>>;
  readonly canActivate?: readonly ProcedureGuard<Input>[];
  readonly handler: (args: {
    readonly context: Context;
    readonly input: OutputOf<Input>;
    readonly errors: ErrorFactories<Errors>;
  }) => Output & JsonResult<NoInfer<Output>>;
}

function procedure<Input, Output, Kind extends ProcedureKind, Errors extends ErrorDefinitions>(
  kind: Kind,
  options: ProcedureOptions<Input, Output, Errors>,
): Procedure<Input, Output, Kind, Errors> {
  const definitions = (options.errors ?? {}) as Errors;
  const { factories, failures } = createErrors(definitions);

  return {
    kind,
    input: options.input as Input,
    errors: definitions,
    canActivate: options.canActivate ?? [],
    handler: ({ context, input }) => options.handler({ context, input, errors: factories }),
    [declaredFailures]: failures,
  };
}

/**
 * Defines a procedure that reads data.
 *
 * @remarks
 * The handler receives `{ context, input, errors }`: the request's {@link Context},
 * the validated input (`undefined` without an input schema) and the
 * {@link ErrorFactories} for the declared errors. A call validates the input, runs the
 * group's guards, then the procedure's guards, then the handler. Inputs and results
 * must be strict JSON; a result that isn't fails the call with `INTERNAL`. Throwing an
 * error created by `errors` returns that declared error; any other exception fails the
 * call with `INTERNAL` and is logged on the server.
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
 *   handler: ({ context }) => context.db.todos.listForUser(requireUser(context).id),
 * }),
 * ```
 *
 * @typeParam Input - The input schema; omit `input` for a procedure without input.
 * @typeParam Output - The handler's return type.
 * @typeParam Errors - The declared errors, written inline.
 * @param options - The procedure's `input` schema, `canActivate` guards, inline
 * `errors` declarations and `handler`.
 * @returns The procedure, to use as a value in `defineRpc`.
 * @throws TypeError when a declared error is invalid: its code isn't an identifier, is
 * `__proto__` or a framework code, its status isn't an integer from 400 to 599, its
 * message is empty, or its data isn't a Standard Schema V1.
 */
export function query<
  Input extends Schema | undefined = undefined,
  Output = unknown,
  const Errors extends ErrorDefinitions = {},
>(options: ProcedureOptions<Input, Output, Errors>): Procedure<Input, Output, "query", Errors> {
  return procedure("query", options);
}

/**
 * Defines a procedure that writes data.
 *
 * @remarks
 * The handler receives `{ context, input, errors }`: the request's {@link Context},
 * the validated input (`undefined` without an input schema) and the
 * {@link ErrorFactories} for the declared errors. A call validates the input, runs the
 * group's guards, then the procedure's guards, then the handler. Inputs and results
 * must be strict JSON; a result that isn't fails the call with `INTERNAL`. Throwing an
 * error created by `errors` returns that declared error; any other exception fails the
 * call with `INTERNAL` and is logged on the server.
 *
 * An explicit `input` schema must have a concrete type, without `undefined`, `null`,
 * `any` or `unknown` branches, or generation fails: `Schema<string> | undefined` is
 * rejected. The schema's caller input type may still be a JSON union, as in
 * `Schema<string | number, number>`.
 *
 * Mutations never use the HTTP transfer cache. During server rendering they fail with
 * `FORBIDDEN` before validation, guards or the handler run.
 *
 * @example
 * ```ts
 * add: mutation({
 *   input: titleSchema,
 *   handler: ({ input, context }) =>
 *     context.db.todos.addForUser(requireUser(context).id, input.title),
 * }),
 * ```
 *
 * @typeParam Input - The input schema; omit `input` for a procedure without input.
 * @typeParam Output - The handler's return type.
 * @typeParam Errors - The declared errors, written inline.
 * @param options - The procedure's `input` schema, `canActivate` guards, inline
 * `errors` declarations and `handler`.
 * @returns The procedure, to use as a value in `defineRpc`.
 * @throws TypeError when a declared error is invalid: its code isn't an identifier, is
 * `__proto__` or a framework code, its status isn't an integer from 400 to 599, its
 * message is empty, or its data isn't a Standard Schema V1.
 */
export function mutation<
  Input extends Schema | undefined = undefined,
  Output = unknown,
  const Errors extends ErrorDefinitions = {},
>(options: ProcedureOptions<Input, Output, Errors>): Procedure<Input, Output, "mutation", Errors> {
  return procedure("mutation", options);
}

/**
 * The minimal shape `defineRpc` accepts for each procedure.
 *
 * @remarks
 * Create procedures with {@link query} or {@link mutation}; generation rejects any
 * other value.
 */
// Existential boundary: the producer proves every binding is a genuine factory.
export interface ProcedureDefinition {
  /** Whether the procedure is a `"query"` or a `"mutation"`. */
  readonly kind: ProcedureKind;
}
/** A {@link ProcedureDefinition} narrowed to queries. */
export interface QueryDefinition extends ProcedureDefinition {
  /** Always `"query"`. */
  readonly kind: "query";
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
  /** The group's guards, in the order they run. Empty when none were given. */
  readonly canActivate: readonly Guard[];
}

/**
 * Defines the RPC group for the route declared in the same directory.
 *
 * @remarks
 * Default-export the result from a file next to the route's `route.ts`; one group per
 * route. That route must be one that gets generated files: not a redirect, and with a
 * page or descendants with pages that aren't all redirects. Generation reads the call
 * statically without running it: import `defineRpc`, `query` and `mutation` by name
 * from this entry point, call them directly without type arguments, use literal
 * identifiers other than `__proto__` for the namespace and procedure names, and
 * write the procedures, options and `canActivate` arrays inline. Each route's
 * generated `injectRpc()` exposes its own group and its ancestors' groups under their
 * namespaces, so a namespace can't repeat within one route's ancestry.
 *
 * Exposure isn't authorization: anyone who can reach the server can call any
 * procedure, so guard every group and procedure that needs it.
 *
 * @example
 * ```ts
 * import { defineRpc, query } from "@loozo/angular-launch/server";
 * import { isSignedIn, requireUser } from "../../auth.server";
 *
 * export default defineRpc(
 *   "todos",
 *   {
 *     list: query({
 *       handler: ({ context }) => context.db.todos.listForUser(requireUser(context).id),
 *     }),
 *   },
 *   { canActivate: [isSignedIn] },
 * );
 * ```
 *
 * @typeParam Name - The namespace literal.
 * @typeParam Procedures - The procedures, keyed by name.
 * @param name - The namespace the generated client exposes the group under.
 * @param procedures - The procedures, keyed by name.
 * @param options - `canActivate`: group guards that run for every procedure in the
 * group.
 * @returns The group, to default-export.
 */
export function defineRpc<
  Name extends string,
  Procedures extends Record<string, ProcedureDefinition>,
>(
  name: Name,
  procedures: Procedures,
  {
    canActivate = [],
  }: {
    /**
     * Guards run in order for every call to any procedure in the group, before the
     * procedure's own guards. The first to return `false` rejects the call as `FORBIDDEN`.
     */
    readonly canActivate?: readonly Guard[];
  } = {},
): Group<Name, Procedures> {
  return { name, procedures, canActivate };
}
