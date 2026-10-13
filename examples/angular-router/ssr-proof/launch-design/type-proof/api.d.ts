// Type-only API feasibility fixture. Not an implementation or published package.
declare module "@loozo/angular-launch/server" {
  export interface Register {}
  export type Context = Register extends { context: infer Value } ? Value : never;
  export type Json =
    | null
    | boolean
    | number
    | string
    | readonly Json[]
    | { readonly [key: string]: Json };

  // Structurally matches Standard Schema V1. Source: standard-schema/standard-schema
  // 6fafde5d4e8372937793c92092322a15b6e711cd, packages/spec/schema.md (MIT).
  export interface Schema<Input = unknown, Output = Input> {
    readonly "~standard": {
      readonly version: 1;
      readonly vendor: string;
      readonly types?: { readonly input: Input; readonly output: Output };
      readonly validate: (
        value: unknown,
      ) =>
        | { readonly value: Output; readonly issues?: undefined }
        | { readonly issues: readonly { readonly message: string }[] }
        | Promise<
            | { readonly value: Output; readonly issues?: undefined }
            | { readonly issues: readonly { readonly message: string }[] }
          >;
    };
  }
  export type InputOf<Value extends Schema<any, any>> = NonNullable<
    Value["~standard"]["types"]
  >["input"];
  export type OutputOf<Value extends Schema<any, any>> = NonNullable<
    Value["~standard"]["types"]
  >["output"];
  export interface ContextDefinition<Value> {
    readonly create: (request: Request) => Value | Promise<Value>;
  }
  export function defineContext<Value>(
    create: (request: Request) => Value | Promise<Value>,
  ): ContextDefinition<Value>;
  export type ContextOf<Value> =
    Value extends ContextDefinition<infer Output> ? Awaited<Output> : never;

  export interface ErrorDefinition<Data extends Schema<any, any> = Schema<any, any>> {
    readonly status: number;
    readonly message: string;
    readonly data: Data;
  }
  export type ErrorMap = Readonly<Record<string, ErrorDefinition>>;
  export interface RpcError<Code extends string, Data> extends Error {
    readonly code: Code;
    readonly data: Data;
    readonly status: number;
  }
  export type PublicErrors<Errors extends ErrorMap> = {
    [Code in keyof Errors & string]: RpcError<Code, OutputOf<Errors[Code]["data"]>>;
  }[keyof Errors & string];
  export type FrameworkError =
    | (RpcError<"INVALID_INPUT", null> & {
        readonly issues: readonly { readonly message: string }[];
      })
    | RpcError<"FORBIDDEN", null>
    | RpcError<"INTERNAL", null>;
  export type ErrorFactories<Errors extends ErrorMap> = {
    readonly [Code in keyof Errors]: (
      data: InputOf<Errors[Code]["data"]>,
    ) => PublicErrors<Pick<Errors, Code>>;
  };
  export type Validated<Input> = Input extends Schema<any, any> ? OutputOf<Input> : undefined;
  export type Guard = (args: { readonly context: Context }) => boolean | Promise<boolean>;
  export type ProcedureGuard<Input> = (args: {
    readonly context: Context;
    readonly input: Validated<Input>;
  }) => boolean | Promise<boolean>;
  export interface Procedure<
    Input,
    Output,
    Errors extends ErrorMap,
    Kind extends "query" | "mutation",
  > {
    readonly kind: Kind;
    readonly __input?: Input;
    readonly __output?: Output;
    readonly __errors?: Errors;
  }
  export interface ProcedureOptions<Input, Output, Errors extends ErrorMap> {
    readonly input?: Input;
    readonly errors?: Errors;
    readonly canActivate?: readonly ProcedureGuard<Input>[];
    readonly handler: (args: {
      readonly context: Context;
      readonly input: Validated<Input>;
      readonly errors: ErrorFactories<Errors>;
    }) => Output;
  }
  export function query<
    Input extends Schema<any, any> | undefined = undefined,
    Errors extends ErrorMap = {},
    Output extends Json | Promise<Json> = Json | Promise<Json>,
  >(
    options: ProcedureOptions<Input, Output, Errors>,
  ): Procedure<Input, Awaited<Output>, Errors, "query">;
  export function mutation<
    Input extends Schema<any, any> | undefined = undefined,
    Errors extends ErrorMap = {},
    Output extends Json | Promise<Json> = Json | Promise<Json>,
  >(
    options: ProcedureOptions<Input, Output, Errors>,
  ): Procedure<Input, Awaited<Output>, Errors, "mutation">;
  export interface Group<Name extends string, Procedures> {
    readonly name: Name;
    readonly procedures: Procedures;
  }
  export function defineRpc<
    Name extends string,
    Procedures extends Record<string, Procedure<any, any, any, any>>,
  >(
    name: Name,
    procedures: Procedures,
    options?: { readonly canActivate?: readonly Guard[] },
  ): Group<Name, Procedures>;
  export interface CallOptions {
    readonly signal?: AbortSignal;
  }
  export type Callable<Input, Output> =
    Input extends Schema<any, any>
      ? (input: InputOf<Input>, options?: CallOptions) => Promise<Output>
      : (options?: CallOptions) => Promise<Output>;
  export type ClientProcedure<Value> =
    Value extends Procedure<infer Input, infer Output, infer Errors, infer Kind>
      ? Callable<Input, Output> & {
          readonly kind: Kind;
          isError(error: unknown): error is PublicErrors<Errors> | FrameworkError;
        }
      : never;
  export type Client<GroupValue> =
    GroupValue extends Group<any, infer Procedures>
      ? { readonly [Key in keyof Procedures]: ClientProcedure<Procedures[Key]> }
      : never;
}
