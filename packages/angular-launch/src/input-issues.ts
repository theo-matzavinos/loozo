/**
 * One problem an input schema found, as sent to the client in `INVALID_INPUT` data.
 *
 * @remarks
 * Only the schema issue's message and path are sent, never vendor details, input
 * values or stacks, so write schema messages for users.
 */
export interface InputIssue {
  /**
   * Where the problem is, as property names and array indexes from the procedure's
   * input. Empty for the input as a whole, or when the schema's path can't be
   * represented in JSON, such as a symbol key.
   */
  readonly path: readonly (string | number)[];
  /** The schema's description of the problem. */
  readonly message: string;
}

/**
 * The data of an `INVALID_INPUT` error.
 *
 * @remarks
 * A request that isn't a valid RPC envelope, such as a body that isn't JSON, has no
 * issues.
 */
export interface InvalidInputData {
  /** The problems the input schema found, in the schema's order. */
  readonly issues: readonly InputIssue[];
}

function segment(value: unknown): string | number | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

/**
 * Converts Standard Schema issues to the issues sent to the client.
 *
 * @remarks
 * Internal; not exported from a public entry point. A path segment may be a property
 * key or a `{ key }` object. An issue with a segment that isn't a string or a finite
 * number gets the root path `[]`; it isn't stringified.
 *
 * @param issues - The issues a schema returned.
 * @returns Each issue's message and normalized path, in the same order.
 */
export function inputIssues(
  issues: readonly {
    readonly message: string;
    readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
  }[],
): InputIssue[] {
  const result: InputIssue[] = [];

  for (const issue of issues) {
    let path: (string | number)[] = [];

    for (const raw of issue.path ?? []) {
      let normalized: string | number | undefined;

      if (typeof raw === "object" && raw !== null) {
        normalized = segment(raw.key);
      } else {
        normalized = segment(raw);
      }

      if (normalized === undefined) {
        path = [];

        break;
      }

      path.push(normalized);
    }

    result.push({ path, message: issue.message });
  }

  return result;
}

/**
 * Checks whether a strict JSON value is exactly {@link InvalidInputData}.
 *
 * @remarks
 * Internal; not exported from a public entry point. Used by the client to recognize
 * `INVALID_INPUT` responses. Extra properties make the value unrecognized.
 *
 * @param value - Received error data, already checked to be strict JSON.
 * @returns `true` when `value` is `{ issues }` with only `{ path, message }` issues.
 */
export function isInvalidInputData(value: unknown): value is InvalidInputData {
  if (
    typeof value !== "object" ||
    value === null ||
    !("issues" in value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.issues)
  ) {
    return false;
  }

  for (const issue of value.issues) {
    if (
      typeof issue !== "object" ||
      issue === null ||
      !("path" in issue) ||
      !("message" in issue) ||
      Object.keys(issue).length !== 2 ||
      typeof issue.message !== "string" ||
      !Array.isArray(issue.path)
    ) {
      return false;
    }

    for (const part of issue.path) {
      if (typeof part !== "string" && typeof part !== "number") {
        return false;
      }
    }
  }

  return true;
}
