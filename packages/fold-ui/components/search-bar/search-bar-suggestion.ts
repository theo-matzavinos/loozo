import type { OrigamiQueryAnalysis, OrigamiQuerySuggestion } from "@loozo/origami-ui/query-field";

/**
 * A SearchBar suggestion: the range and `insert` Origami applies, plus what its row shows. The
 * label may differ from the insert, such as a Greek `κατάσταση` that inserts `status:`.
 */
export interface SearchBarSuggestion extends OrigamiQuerySuggestion {
  readonly label: string;
  /** Muted text at the row's end. */
  readonly detail?: string;
}

/** Your analysis of the query at the caret, with SearchBar's suggestions. */
export type SearchBarAnalysis = OrigamiQueryAnalysis<SearchBarSuggestion>;
