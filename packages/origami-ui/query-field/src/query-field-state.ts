import { Service, computed, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import type { Observable } from "rxjs";
import type {
  OrigamiQuerySegment,
  OrigamiQuerySuggestion,
  OrigamiQueryToken,
} from "./query-analysis";
import { QueryFieldContext } from "./query-field-context";

/**
 * Locally provided readonly facade for the nearest query field root; nested roots have
 * independent owners. `S` is the consumer's suggestion type: inject it as
 * `inject<OrigamiQueryFieldState<MySuggestion>>(OrigamiQueryFieldState)`.
 */
@Service({ autoProvided: false })
export class OrigamiQueryFieldState<S extends OrigamiQuerySuggestion = OrigamiQuerySuggestion> {
  readonly #context = inject(QueryFieldContext);

  /** The effective query, the input's text outside a composition. */
  readonly query: Signal<string> = this.#context.query;
  /**
   * The focused input's collapsed caret, in UTF-16 code units; null while the input isn't focused,
   * for a range selection, before it attaches, after it's destroyed and on the server. Held during
   * a composition. A native observation: just after a query is written from outside it can be
   * briefly greater than the new query's length, until the input reports the caret at its end.
   */
  readonly caret: Signal<number | null> = this.#context.caret;
  /** The analysis's tokens while it was computed for the query; `[]` otherwise. */
  readonly tokens: Signal<readonly OrigamiQueryToken[]> = this.#context.tokens;
  /**
   * The query in runs for drawing marks: one `text` run while no tokens are current, `[]` for an
   * empty query.
   */
  readonly segments: Signal<readonly OrigamiQuerySegment[]> = this.#context.segments;
  /** The current token at the caret, by the boundary rule; null while the caret is null or between tokens. */
  readonly caretToken: Signal<OrigamiQueryToken | null> = this.#context.caretToken;
  /** Whether a current token is invalid; the input's `aria-invalid`. */
  readonly invalid: Signal<boolean> = this.#context.invalid;
  /**
   * The analysis's suggestions while they apply: its query and caret are the live ones and no
   * composition is open; `[]` otherwise and while they're loading. Render a row for each.
   */
  readonly suggestions: Signal<readonly S[]> = computed(
    // The root's Options are typed by `S`, so its analysis's suggestions are `S` values.
    () => this.#context.suggestions() as readonly S[],
  );
  /** Whether the list is Shown: requested and actually presented. False on the server. */
  readonly open: Signal<boolean> = this.#context.shown;
  /** The input's horizontal scroll offset in CSS pixels; translate the mark layer by its negative. */
  readonly scrollLeft: Signal<number> = this.#context.scrollLeft;
  /** Whether an IME composition is open in the input; hide the mark layer meanwhile. */
  readonly composing: Signal<boolean> = this.#context.composing;
  /** The root's effective disabled policy. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** Emits each caret change, synchronously, as the root's `caretChange` output does. */
  readonly caretChange: Observable<number | null> = this.#context.caretChanges;
  /** Emits the query on Enter with no highlighted suggestion, as the root's `search` output does. */
  readonly search: Observable<string> = this.#context.searches;
}
