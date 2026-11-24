/**
 * A half-open range `[start, end)` of a query, in UTF-16 code units as the input's
 * `selectionStart` counts them.
 */
export interface OrigamiQueryRange {
  /** The first code unit of the range, an integer from 0 to the query's length. */
  readonly start: number;
  /** The code unit after the range's last, an integer from `start` to the query's length. */
  readonly end: number;
}

/**
 * A query token the consumer's parser reports, such as `status:submitted` in
 * `report status:submitted`: a non-empty range of the query, with an optional qualifier and,
 * while it's invalid, the reason.
 */
export interface OrigamiQueryToken extends OrigamiQueryRange {
  /**
   * The qualifier, the token's key before its separator, such as `status`: a non-empty range that
   * starts at the token's start and ends inside it, the separator excluded. Absent for free text.
   */
  readonly qualifier?: OrigamiQueryRange;
  /**
   * Why the token is invalid, such as `Unknown qualifier "staus"`: a non-empty message, shown in
   * the list while the caret is in the token and named in the input's description. Absent while
   * the token is valid.
   */
  readonly error?: string;
}

/**
 * A suggestion for the token at the caret: picking it replaces `[start, end)` of the analysed
 * query with `insert`. The range may be empty, an insertion at `start`. Origami reads only
 * `start`, `end` and `insert`; extend it with the label and detail your rows show.
 */
export interface OrigamiQuerySuggestion extends OrigamiQueryRange {
  /** The text a pick puts in the range: no line break, possibly empty, which deletes the range. */
  readonly insert: string;
}

/**
 * The consumer's analysis of one query at one caret: its query tokens and the suggestions for
 * the token at the caret, stamped with the query and the caret its offsets refer to. The query
 * field applies its tokens only while `query` is the field's query, and its suggestions only while
 * `caret` is also the field's caret and no composition is open; a stale analysis shows nothing
 * from it, and isn't an error.
 *
 * `S` is your suggestion type, which the rows read back from `state.suggestions()`.
 */
export interface OrigamiQueryAnalysis<S extends OrigamiQuerySuggestion = OrigamiQuerySuggestion> {
  /** The query this analysis was computed for; its offsets refer to it. No line break. */
  readonly query: string;
  /**
   * The collapsed caret the suggestions were computed for, from 0 to `query.length`; null when
   * none apply. Publish null too while the caret you hold is greater than `query.length`, as just
   * after a shorter query is written from outside, before the input reports its new caret.
   */
  readonly caret: number | null;
  /** The query's tokens in order: non-empty, non-overlapping (touching is allowed). */
  readonly tokens: readonly OrigamiQueryToken[];
  /** Suggestions for the token at `caret`: `[]` for none, null while they're loading. */
  readonly suggestions: readonly S[] | null;
}

/**
 * One run of the current query for drawing marks behind the input's text. The runs cover the
 * whole query in order, so drawing each `text` in a span reproduces the query.
 */
export interface OrigamiQuerySegment extends OrigamiQueryRange {
  /** The run's text, `query.slice(start, end)`. */
  readonly text: string;
  /**
   * `qualifier`: a token's qualifier; `value`: the rest of a token, its separator included;
   * `text`: unmarked text between tokens, or the whole query while no tokens are current.
   */
  readonly part: "qualifier" | "value" | "text";
  /** The token the run belongs to; null for a `text` run. */
  readonly token: OrigamiQueryToken | null;
}

function lineBreak(text: string): boolean {
  return text.includes("\n") || text.includes("\r");
}

/** Throws unless `query` is a single line. */
export function validateQuery(query: string): void {
  if (lineBreak(query)) {
    throw new RangeError("Query field query must not contain a line break.");
  }
}

function validateRange(range: OrigamiQueryRange, length: number, field: string): void {
  const { start, end } = range;

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new RangeError(`Query field analysis ${field} offsets must be integers.`);
  }

  if (start > end) {
    throw new RangeError(`Query field analysis ${field} must not start after it ends.`);
  }

  if (start < 0 || end > length) {
    throw new RangeError(
      `Query field analysis ${field} must lie within the analysed query [0, ${length}].`,
    );
  }
}

/**
 * Throws a `RangeError` naming the field unless `analysis` has an accepted shape: integer
 * offsets inside its own query, non-empty ordered non-overlapping tokens, qualifiers that start at
 * their token's start, non-empty errors, a caret inside the query, and no line break in `query` or
 * an `insert`. A stale analysis is valid.
 */
export function validateAnalysis(analysis: OrigamiQueryAnalysis): void {
  const length = analysis.query.length;

  if (lineBreak(analysis.query)) {
    throw new RangeError("Query field analysis query must not contain a line break.");
  }

  if (
    analysis.caret !== null &&
    (!Number.isInteger(analysis.caret) || analysis.caret < 0 || analysis.caret > length)
  ) {
    throw new RangeError(
      `Query field analysis caret must be null or an integer within [0, ${length}].`,
    );
  }

  let previousEnd = 0;

  for (const token of analysis.tokens) {
    validateRange(token, length, "token");

    if (token.start === token.end) {
      throw new RangeError("Query field analysis token must not be empty.");
    }

    if (token.start < previousEnd) {
      throw new RangeError("Query field analysis tokens must be in order and must not overlap.");
    }

    previousEnd = token.end;

    const qualifier = token.qualifier;

    if (qualifier !== undefined) {
      validateRange(qualifier, length, "token qualifier");

      if (qualifier.start !== token.start) {
        throw new RangeError(
          "Query field analysis token qualifier must start at its token's start.",
        );
      }

      if (qualifier.start === qualifier.end) {
        throw new RangeError("Query field analysis token qualifier must not be empty.");
      }

      if (qualifier.end > token.end) {
        throw new RangeError("Query field analysis token qualifier must end inside its token.");
      }
    }

    if (token.error !== undefined && (typeof token.error !== "string" || token.error === "")) {
      throw new RangeError("Query field analysis token error must be a non-empty string.");
    }
  }

  if (analysis.suggestions === null) {
    return;
  }

  for (const suggestion of analysis.suggestions) {
    validateRange(suggestion, length, "suggestion");

    if (lineBreak(suggestion.insert)) {
      throw new RangeError("Query field analysis suggestion insert must not contain a line break.");
    }
  }
}

/**
 * The token at `caret`: the one with `start ≤ caret ≤ end`. Where one token ends at the caret and
 * the next starts there, the invalid one wins; when both or neither is invalid, the one starting
 * at the caret. Null while the caret is null or between tokens.
 */
export function tokenAt(
  tokens: readonly OrigamiQueryToken[],
  caret: number | null,
): OrigamiQueryToken | null {
  if (caret === null) {
    return null;
  }

  let ending: OrigamiQueryToken | null = null;

  for (const token of tokens) {
    if (token.start > caret) {
      break;
    }

    if (token.end < caret) {
      continue;
    }

    if (token.end === caret && token.start < caret) {
      ending = token;

      continue;
    }

    // `token.start <= caret` and it doesn't end before or exactly at a later caret: it contains
    // or starts at the caret.
    if (ending !== null && ending.error !== undefined && token.error === undefined) {
      return ending;
    }

    return token;
  }

  return ending;
}

/** Whether two tokens cover the same range. */
export function sameRange(
  left: OrigamiQueryRange | null,
  right: OrigamiQueryRange | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.start === right.start && left.end === right.end;
}

/**
 * The runs of `query` for drawing marks: per token, a `text` run for the gap before it, a
 * `qualifier` run if it has one and a `value` run for the rest, omitted when empty; then a `text`
 * run for the tail. `[]` for an empty query.
 */
export function segmentsOf(
  query: string,
  tokens: readonly OrigamiQueryToken[],
): OrigamiQuerySegment[] {
  const segments: OrigamiQuerySegment[] = [];
  let at = 0;

  for (const token of tokens) {
    if (token.start > at) {
      segments.push({
        start: at,
        end: token.start,
        text: query.slice(at, token.start),
        part: "text",
        token: null,
      });
    }

    let valueStart = token.start;

    if (token.qualifier !== undefined) {
      valueStart = token.qualifier.end;
      segments.push({
        start: token.start,
        end: valueStart,
        text: query.slice(token.start, valueStart),
        part: "qualifier",
        token,
      });
    }

    if (token.end > valueStart) {
      segments.push({
        start: valueStart,
        end: token.end,
        text: query.slice(valueStart, token.end),
        part: "value",
        token,
      });
    }

    at = token.end;
  }

  if (query.length > at) {
    segments.push({
      start: at,
      end: query.length,
      text: query.slice(at),
      part: "text",
      token: null,
    });
  }

  return segments;
}
