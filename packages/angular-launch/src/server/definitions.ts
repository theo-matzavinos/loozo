import type { JsonShape } from "../json.js";
import type { FrameworkCode } from "../client.js";
import { createErrors, declaredFailures } from "./errors.js";
import type { DeclaredFailure } from "./errors.js";

export interface Register {}
export type Context = Register extends { context: infer Value } ? Value : never;

// Structural Standard Schema V1 contract; validators may asynchronously transform.
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
export type InputOf<S extends Schema> = NonNullable<S["~standard"]["types"]>["input"];
export type OutputOf<S> = S extends Schema<unknown, infer Output> ? Output : undefined;

export interface ContextDefinition<Value> {
  readonly create: (request: Request) => Value;
}

export function defineContext<Value>(
  create: (request: Request) => Value,
): ContextDefinition<Value> {
  return { create };
}

export type ContextOf<Definition> =
  Definition extends ContextDefinition<infer Value> ? Awaited<Value> : never;

export type Guard = (args: {
  readonly context: Context;
  readonly request: Request;
}) => boolean | Promise<boolean>;
export type ProcedureGuard<Input> = (args: {
  readonly context: Context;
  readonly request: Request;
  readonly input: OutputOf<Input>;
}) => boolean | Promise<boolean>;
type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type StatusNumber<Value> = Value extends `${infer Status extends number}` ? Status : never;
export type ErrorStatus = StatusNumber<`${4 | 5}${Digit}${Digit}`>;

export interface ErrorDefinition<Data extends Schema = Schema> {
  readonly status: ErrorStatus;
  readonly message: string;
  readonly data: Data;
}
export type ErrorDefinitions = Readonly<Record<string, ErrorDefinition>>;
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

export type ProcedureKind = "query" | "mutation";
export interface Procedure<
  Input,
  Output,
  Kind extends ProcedureKind = "query",
  Errors extends ErrorDefinitions = {},
> {
  readonly kind: Kind;
  readonly input: Input;
  readonly errors: Errors;
  readonly canActivate: readonly ProcedureGuard<Input>[];
  readonly handler: (args: {
    readonly context: Context;
    readonly input: OutputOf<Input>;
    readonly errors: ErrorFactories<Errors>;
  }) => Output | Promise<Output>;
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

export function query<
  Input extends Schema | undefined = undefined,
  Output = unknown,
  const Errors extends ErrorDefinitions = {},
>(options: ProcedureOptions<Input, Output, Errors>): Procedure<Input, Output, "query", Errors> {
  return procedure("query", options);
}

export function mutation<
  Input extends Schema | undefined = undefined,
  Output = unknown,
  const Errors extends ErrorDefinitions = {},
>(options: ProcedureOptions<Input, Output, Errors>): Procedure<Input, Output, "mutation", Errors> {
  return procedure("mutation", options);
}

// Existential boundary: the producer proves every binding is a genuine factory.
export interface ProcedureDefinition {
  readonly kind: ProcedureKind;
}
export interface QueryDefinition extends ProcedureDefinition {
  readonly kind: "query";
}
export interface Group<
  Name extends string,
  Procedures extends Record<string, ProcedureDefinition>,
> {
  readonly name: Name;
  readonly procedures: Procedures;
  readonly canActivate: readonly Guard[];
}

export function defineRpc<
  Name extends string,
  Procedures extends Record<string, ProcedureDefinition>,
>(
  name: Name,
  procedures: Procedures,
  { canActivate = [] }: { readonly canActivate?: readonly Guard[] } = {},
): Group<Name, Procedures> {
  return { name, procedures, canActivate };
}
