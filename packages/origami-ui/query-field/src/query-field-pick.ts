import type { OrigamiQueryAnalysis, OrigamiQuerySuggestion } from "./query-analysis";

/** What a pick reads and drives on the Input. */
export interface QueryFieldPickTarget {
  readonly element: HTMLInputElement;
  /** The root's query, which must still be the input's text and the analysis's query. */
  readonly query: string;
  /** Whether the root is disabled or a composition is open: nothing is picked. */
  readonly blocked: boolean;
  /**
   * Runs the browser's insertion with the Input's pick token set, and returns what it returned and
   * whether the Input saw its `input` event meanwhile.
   */
  readonly insert: (command: () => boolean) => {
    readonly returned: boolean;
    readonly seen: boolean;
  };
}

/**
 * How a pick ended: `refused` by a guard, `equal` text (no edit), `success`, `none` (no edit
 * happened) or `different` (another edit than the expected one happened).
 */
export type QueryFieldPickOutcome = "refused" | "equal" | "success" | "none" | "different";

/**
 * Replaces `[start, end)` of the input's text with the suggestion's `insert` through the
 * browser's own insertion (`execCommand`), so it lands in the native undo history. Only while the
 * input is enabled, writable, focused and not composing, its text is the query and the analysis's
 * query, and its selection is collapsed at the analysis's caret. Equal text moves the caret to
 * the range's end instead; an insertion that edits nothing restores the selection, direction
 * included.
 */
export function applyPick(
  target: QueryFieldPickTarget,
  suggestion: OrigamiQuerySuggestion,
  analysis: OrigamiQueryAnalysis,
): QueryFieldPickOutcome {
  const element = target.element;
  const value = element.value;

  if (
    target.blocked ||
    element.disabled ||
    element.readOnly ||
    !element.matches(":focus") ||
    value !== target.query ||
    value !== analysis.query ||
    element.selectionStart !== analysis.caret ||
    element.selectionEnd !== analysis.caret
  ) {
    return "refused";
  }

  const { start, end, insert } = suggestion;

  if (value.slice(start, end) === insert) {
    element.setSelectionRange(end, end);

    return "equal";
  }

  const selection = {
    start: element.selectionStart,
    end: element.selectionEnd,
    direction: element.selectionDirection ?? undefined,
  };
  const expected = value.slice(0, start) + insert + value.slice(end);

  element.setSelectionRange(start, end);

  const { returned, seen } = target.insert(() => {
    if (insert === "") {
      return element.ownerDocument.execCommand("delete");
    }

    return element.ownerDocument.execCommand("insertText", false, insert);
  });

  if (element.value === value) {
    element.setSelectionRange(selection.start, selection.end, selection.direction);

    return "none";
  }

  if (returned && seen && element.value === expected) {
    return "success";
  }

  return "different";
}
