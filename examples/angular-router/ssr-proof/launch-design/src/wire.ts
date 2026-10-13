export type Todo = { id: string; title: string; completed: boolean };
export type ListResult = { user: string; requestId: number; todos: Todo[] };
export type PublicCode = "INVALID_INPUT" | "FORBIDDEN" | "INTERNAL" | "NOT_FOUND";
export type Failure = { error: { code: PublicCode; message: string; data: { id: string } | null } };

export class RpcError extends Error {
  constructor(
    readonly code: PublicCode,
    message: string,
    readonly data: { id: string } | null,
    readonly status: number,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export function isFailure(value: unknown): value is Failure {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  const error = value.error;

  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    !("message" in error) ||
    !("data" in error)
  ) {
    return false;
  }

  const knownCode =
    error.code === "INVALID_INPUT" ||
    error.code === "FORBIDDEN" ||
    error.code === "INTERNAL" ||
    error.code === "NOT_FOUND";
  const validData =
    error.data === null ||
    (typeof error.data === "object" && "id" in error.data && typeof error.data.id === "string");

  return knownCode && typeof error.message === "string" && validData;
}
