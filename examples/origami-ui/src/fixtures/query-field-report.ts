import type {
  OrigamiQueryAnalysis,
  OrigamiQueryRange,
  OrigamiQuerySuggestion,
  OrigamiQueryToken,
} from "@loozo/origami-ui/query-field";

// The query field fixtures' report grammar, a stand-in for a consumer's generated parser. Tokens
// are runs of non-space text; `key:value` has the qualifier `key`. Known qualifiers are `status`,
// `by`, `submitted` and `sort`; any other qualifier is invalid, with fixes by its first letter
// (`staus` → `status`, `sort`, and a removal) or none (`zz`). Labels may be Greek; inserts are the
// ASCII keys.

/** A row's suggestion: Origami reads `start`, `end` and `insert`; the rows show the rest. */
export interface ReportSuggestion extends OrigamiQuerySuggestion {
  readonly label: string;
  readonly detail: string;
}

export type ReportAnalysis = OrigamiQueryAnalysis<ReportSuggestion>;

interface Qualifier {
  readonly name: string;
  readonly greek: string;
  readonly values: readonly ReportValue[];
}

interface ReportValue {
  readonly insert: string;
  readonly label: string;
  readonly detail: string;
}

export const users: readonly ReportValue[] = [
  { insert: "alice", label: "Alice", detail: "alice@example.com" },
  { insert: "bob", label: "Bob", detail: "bob@example.com" },
  { insert: "chris", label: "Chris", detail: "chris@example.com" },
];

const qualifiers: readonly Qualifier[] = [
  {
    name: "status",
    greek: "κατάσταση",
    values: [
      { insert: "draft", label: "draft", detail: "Πρόχειρο" },
      { insert: "submitted", label: "submitted", detail: "Υποβλήθηκε" },
      { insert: "approved", label: "approved", detail: "Εγκρίθηκε" },
    ],
  },
  { name: "by", greek: "από", values: [{ insert: "@me", label: "@me", detail: "Εγώ" }, ...users] },
  {
    name: "submitted",
    greek: "υποβλήθηκε",
    values: [
      { insert: "2026-01-01..2026-03-31", label: "Q1 2026", detail: "2026-01-01..2026-03-31" },
      { insert: "2026-04-01..2026-06-30", label: "Q2 2026", detail: "2026-04-01..2026-06-30" },
    ],
  },
  {
    name: "sort",
    greek: "ταξινόμηση",
    values: [
      { insert: "submitted-asc", label: "submitted-asc", detail: "Παλαιότερα πρώτα" },
      { insert: "submitted-desc", label: "submitted-desc", detail: "Νεότερα πρώτα" },
    ],
  },
];

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function qualifierNamed(name: string): Qualifier | null {
  for (const qualifier of qualifiers) {
    if (qualifier.name === name) {
      return qualifier;
    }
  }

  return null;
}

/** The query's tokens: runs of non-space text, with a qualifier before a `:` that isn't first. */
export function reportTokens(query: string): OrigamiQueryToken[] {
  const tokens: OrigamiQueryToken[] = [];
  const pattern = /\S+/g;

  for (const match of query.matchAll(pattern)) {
    const start = match.index;
    const text = match[0];
    const end = start + text.length;
    const colon = text.indexOf(":");

    if (colon <= 0) {
      tokens.push({ start, end });

      continue;
    }

    const name = text.slice(0, colon);
    const qualifier: OrigamiQueryRange = { start, end: start + colon };

    if (qualifierNamed(name) === null) {
      tokens.push({ start, end, qualifier, error: `Άγνωστο φίλτρο «${name}»` });
    } else {
      tokens.push({ start, end, qualifier });
    }
  }

  return tokens;
}

/** The token whose range touches `caret`; tokens are separated by spaces, so at most one does. */
function touching(tokens: readonly OrigamiQueryToken[], caret: number): OrigamiQueryToken | null {
  for (const token of tokens) {
    if (token.start <= caret && caret <= token.end) {
      return token;
    }
  }

  return null;
}

/** What completes the caret's token: rows, the async `by:` user lookup, or nothing. */
export type ReportCompletion =
  | { readonly rows: readonly ReportSuggestion[] }
  | { readonly users: OrigamiQueryRange; readonly prefix: string }
  | null;

/** The completion at `caret` of `query`, whose tokens are `tokens`. */
export function reportCompletion(
  query: string,
  tokens: readonly OrigamiQueryToken[],
  caret: number,
): ReportCompletion {
  const token = touching(tokens, caret);

  if (token === null) {
    return null;
  }

  const qualifierRange = token.qualifier;

  if (qualifierRange === undefined) {
    return { rows: qualifierStarts(query, token, caret) };
  }

  const name = query.slice(qualifierRange.start, qualifierRange.end);
  const qualifier = qualifierNamed(name);

  if (caret <= qualifierRange.end) {
    if (qualifier === null) {
      return { rows: fixes(name, token, qualifierRange) };
    }

    const prefix = query.slice(qualifierRange.start, caret);
    const rows: ReportSuggestion[] = [];

    for (const known of qualifiers) {
      if (known.name.startsWith(prefix)) {
        rows.push({
          start: qualifierRange.start,
          end: qualifierRange.end,
          insert: known.name,
          label: known.name,
          detail: capitalized(known.greek),
        });
      }
    }

    return { rows };
  }

  if (qualifier === null) {
    return { rows: [] };
  }

  const value: OrigamiQueryRange = { start: qualifierRange.end + 1, end: token.end };
  const prefix = query.slice(value.start, caret);

  if (qualifier.name === "by") {
    return { users: value, prefix };
  }

  return { rows: valueRows(qualifier.values, value, prefix, query) };
}

/** Values starting with `prefix`, except one the value already is. */
export function valueRows(
  values: readonly ReportValue[],
  range: OrigamiQueryRange,
  prefix: string,
  query: string,
): ReportSuggestion[] {
  const rows: ReportSuggestion[] = [];
  const whole = query.slice(range.start, range.end);

  for (const value of values) {
    if (value.insert.startsWith(prefix) && value.insert !== whole) {
      rows.push({ ...range, insert: value.insert, label: value.label, detail: value.detail });
    }
  }

  return rows;
}

/** A free word completes to the qualifiers it starts, by their key or their Greek label. */
function qualifierStarts(
  query: string,
  token: OrigamiQueryToken,
  caret: number,
): ReportSuggestion[] {
  const prefix = query.slice(token.start, caret).toLowerCase();
  const rows: ReportSuggestion[] = [];

  if (prefix === "") {
    return rows;
  }

  for (const known of qualifiers) {
    const range = { start: token.start, end: token.end };

    if (known.name.startsWith(prefix)) {
      rows.push({ ...range, insert: `${known.name}:`, label: known.name, detail: known.greek });
    } else if (known.greek.startsWith(prefix)) {
      rows.push({ ...range, insert: `${known.name}:`, label: known.greek, detail: known.name });
    }
  }

  return rows;
}

/** An unknown qualifier's fixes: known ones with its first letter, then removing it. */
function fixes(
  name: string,
  token: OrigamiQueryToken,
  range: OrigamiQueryRange,
): ReportSuggestion[] {
  const rows: ReportSuggestion[] = [];

  for (const known of qualifiers) {
    if (known.name.charAt(0) === name.charAt(0)) {
      rows.push({
        ...range,
        insert: known.name,
        label: known.name,
        detail: capitalized(known.greek),
      });
    }
  }

  if (rows.length > 0) {
    rows.push({
      start: token.start,
      end: range.end + 1,
      insert: "",
      label: "Αφαίρεση φίλτρου",
      detail: "remove",
    });
  }

  return rows;
}

/**
 * The synchronous analysis: `by:` users come from the same list. A caret the consumer holds past
 * the query's end, just after a shorter query was written from outside, is published as null.
 */
export function reportAnalysis(query: string, held: number | null): ReportAnalysis {
  const tokens = reportTokens(query);
  let caret: number | null = null;

  if (held !== null && held <= query.length) {
    caret = held;
  }

  if (caret === null) {
    return { query, caret, tokens, suggestions: [] };
  }

  const completion = reportCompletion(query, tokens, caret);
  let suggestions: readonly ReportSuggestion[] = [];

  if (completion !== null && "rows" in completion) {
    suggestions = completion.rows;
  } else if (completion !== null) {
    suggestions = valueRows(
      qualifierNamed("by")?.values ?? [],
      completion.users,
      completion.prefix,
      query,
    );
  }

  return { query, caret, tokens, suggestions };
}
