import { Directive, booleanAttribute, computed, inject, input, model } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import {
  OrigamiPopover,
  OrigamiPopoverOptions,
  ɵOrigamiPopoverInputOwner,
} from "@loozo/origami-ui/popover";
import type { OrigamiQueryAnalysis, OrigamiQuerySuggestion } from "./query-analysis";
import { QueryFieldContext } from "./query-field-context";
import { OrigamiQueryFieldOptions } from "./query-field-options";
import { OrigamiQueryFieldState } from "./query-field-state";

/**
 * Query field root: one native single-line input whose text is a query of tokens, such as
 * `report status:submitted by:@me`, with a popup list of suggestions for the token at the caret.
 * You parse the query and look suggestions up; the query field applies your analysis to the text
 * and caret it was computed for, marks nothing itself (draw marks from `state.segments()` behind
 * the input), and edits the query in place when a suggestion is picked, through the browser's own
 * insertion, so undo works.
 *
 * `[(query)]` updates on every edit, synchronously in its `input` event, then `caretChange`
 * reports the caret. Bind `[analysis]` to a `computed` of both: parse synchronously, load only
 * suggestions asynchronously, and stamp what you computed with the query and caret it's for.
 * Enter with no highlighted suggestion emits `search` with the query and leaves the key's default,
 * so a form still submits.
 *
 * The list opens when you edit, on ArrowDown, ArrowUp or Alt+ArrowDown while it has current
 * suggestions, and when the caret moves into another invalid token; never on focus alone. It
 * shows the rows you render for `state.suggestions()` and, while the caret is in an invalid
 * token, your `ogQueryFieldMessage`. The root composes `ogPopover`: the list is a native top-layer
 * Popover anchored to the input, nested in an enclosing Dialog or Popover. Escape closes it and
 * keeps the text; Tab closes it and moves focus.
 *
 * `S` is your suggestion type, inferred from `[analysis]`; `state.suggestions()` returns it.
 *
 * @example
 * ```html
 * <div ogQueryField #qf="ogQueryField" [(query)]="query" (caretChange)="caret.set($event)"
 *      [analysis]="analysis()" (search)="run($event)">
 *   <input ogQueryFieldInput aria-label="Search reports" />
 *   <div ogQueryFieldContent>
 *     @if (qf.state.caretToken()?.error; as error) { <p ogQueryFieldMessage>{{ error }}</p> }
 *     @for (suggestion of qf.state.suggestions(); track $index) {
 *       <div ogQueryFieldSuggestion [suggestion]="suggestion">{{ suggestion.label }}</div>
 *     }
 *   </div>
 *   <div ogQueryFieldErrors hidden>
 *     @for (token of qf.state.tokens(); track token.start) {
 *       @if (token.error) { <p>{{ token.error }}</p> }
 *     }
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogQueryField]",
  exportAs: "ogQueryField",
  hostDirectives: [OrigamiPopover],
  providers: [
    OrigamiQueryFieldOptions.provideExisting(() => OrigamiQueryField),
    QueryFieldContext,
    OrigamiQueryFieldState,
    OrigamiPopoverOptions.provideFactory(() => {
      const context = inject(QueryFieldContext);

      return {
        open: context.popoverOpen,
        disabled: context.disabled,
        dismissible: computed(() => true),
      };
    }),
    {
      provide: ɵOrigamiPopoverInputOwner,
      useFactory: () => ({ input: inject(QueryFieldContext).ownerInput }),
    },
  ],
})
export class OrigamiQueryField<
  S extends OrigamiQuerySuggestion = OrigamiQuerySuggestion,
> implements OrigamiQueryFieldOptions<S> {
  /**
   * Own query model, default `""`; `queryChange` emits every edit's text in its `input` event,
   * before `caretChange`, and the text typed into a server-rendered input before hydration.
   * Replaced Options supply the effective query instead and don't fabricate this output.
   */
  readonly query = model("");
  /**
   * Own analysis input, default null: nothing marked, no suggestions. Replaced Options supply the
   * effective analysis instead.
   */
  readonly analysis = input<OrigamiQueryAnalysis<S> | null>(null);
  /**
   * Own disabled input, default false with boolean-attribute coercion. Replaced Options supply
   * the effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject<OrigamiQueryFieldState<S>>(OrigamiQueryFieldState);

  readonly #context = inject(QueryFieldContext);

  /**
   * Emits the query on Enter while no suggestion is highlighted, the list closed or open; the key
   * keeps its default, so a form submits too. Also with invalid tokens; never during a composition.
   * Once after a highlight the user saw lapsed (the caret moved, its row was replaced, the
   * analysis went stale or started loading) Enter does nothing instead, its default prevented.
   */
  readonly search = outputFromObservable(this.#context.searches);
  /**
   * Emits each change of the input's collapsed caret, in UTF-16 code units, synchronously: after
   * `queryChange` for an edit, after a caret move, focus, a pick or a query written from outside;
   * null on blur, for a range selection and when the input is destroyed.
   */
  readonly caretChange = outputFromObservable(this.#context.caretChanges);

  /**
   * Focuses the input once it has registered; does nothing before.
   * @param options - Passed to the input's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }
}
