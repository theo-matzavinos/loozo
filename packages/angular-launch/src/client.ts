import type {
  ErrorDefinitions,
  Group,
  OutputOf,
  Procedure,
  ProcedureKind,
  Schema,
} from "./server/definitions.js";
import { serializeJson } from "./json.js";
export type { Json } from "./json.js";

export interface CallOptions {
  readonly signal?: AbortSignal;
  readonly transferCache?: boolean;
}

export interface MutationCallOptions {
  readonly signal?: AbortSignal;
  readonly transferCache?: false;
}

export interface ErrorMetadata {
  readonly code: string;
  readonly status: number;
  readonly message: string;
}

export const frameworkFailures = {
  INVALID_INPUT: { status: 400, message: "Invalid RPC input" },
  FORBIDDEN: { status: 403, message: "RPC forbidden" },
  RPC_NOT_FOUND: { status: 404, message: "RPC not found" },
  INTERNAL: { status: 500, message: "Internal server error" },
} as const;

export type FrameworkCode = keyof typeof frameworkFailures;

export class RpcError<Code extends string = FrameworkCode, Data = null> extends Error {
  constructor(
    readonly code: Code,
    readonly status: number,
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

export function recognizedFailure(value: unknown, status: number): FrameworkCode | undefined {
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

    if (
      error.code === code &&
      status === expected.status &&
      error.message === expected.message &&
      error.data === null
    ) {
      return code;
    }
  }

  return undefined;
}

export function recognizedError(
  value: unknown,
  status: number,
  declared: readonly ErrorMetadata[],
): { code: string; message: string; data: unknown } | undefined {
  const framework = recognizedFailure(value, status);

  if (framework) {
    return { code: framework, message: frameworkFailures[framework].message, data: null };
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
  [Code in FrameworkCode]: RpcError<Code, null>;
}[FrameworkCode];
type DeclaredError<Errors extends ErrorDefinitions> = {
  [Code in keyof Errors & string]: RpcError<Code, OutputOf<Errors[Code]["data"]>>;
}[keyof Errors & string];
export type ClientRpcError<Value> =
  Value extends Procedure<infer _Input, infer _Output, infer _Kind, infer Errors>
    ? FrameworkError | DeclaredError<Errors>
    : never;

type Options<Kind extends ProcedureKind> = Kind extends "mutation"
  ? MutationCallOptions
  : CallOptions;
type Callable<Input, Output, Kind extends ProcedureKind> =
  Input extends Schema<infer Caller, unknown>
    ? (input: Caller, options?: Options<Kind>) => Promise<Output>
    : (options?: Options<Kind>) => Promise<Output>;
export type ClientProcedure<Value> =
  Value extends Procedure<infer Input, infer Output, infer Kind, infer Errors>
    ? Callable<Input, Awaited<Output>, Kind> & {
        readonly kind: Kind;
        isError(error: unknown): error is FrameworkError | DeclaredError<Errors>;
      }
    : never;
export type Client<Value> =
  Value extends Group<string, infer Procedures>
    ? { readonly [Key in keyof Procedures]: ClientProcedure<Procedures[Key]> }
    : never;
