import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import type { OrigamiQueryAnalysis, OrigamiQuerySuggestion } from "./query-analysis";

/**
 * Effective `ogQueryField` configuration, replaced as a whole rather than merged with unused
 * defaults. `S` is the consumer's suggestion type, which `state.suggestions()` returns.
 */
export abstract class OrigamiQueryFieldOptions<
  S extends OrigamiQuerySuggestion = OrigamiQuerySuggestion,
> {
  /**
   * Writable query, the input's whole text; the direct directive model defaults to `""`. Every
   * edit writes it in the edit's `input` event, before `caretChange`: typing, deleting, pasting,
   * undo, redo, a composition when it ends and a pick. A query written from outside shows in the
   * input after the next render, moves a focused input's caret to its end and closes the list.
   * It must not contain a line break: reading one throws `RangeError`.
   */
  abstract readonly query: WritableSignal<string>;
  /**
   * The consumer's analysis of the query at the caret, or null for none; the direct directive
   * input defaults to null. Its tokens apply while its `query` is the query, and its suggestions
   * while its `caret` is also the caret; reading a malformed one throws `RangeError` naming the
   * field.
   */
  abstract readonly analysis: Signal<OrigamiQueryAnalysis<S> | null>;
  /**
   * Natively disables the input and closes the list; no edit, pick or `search` happens. Direct
   * default false.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces query field Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting<S extends OrigamiQuerySuggestion>(
    type: () => Type<OrigamiQueryFieldOptions<S>> | AbstractType<OrigamiQueryFieldOptions<S>>,
  ): Provider {
    return { provide: OrigamiQueryFieldOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all query field Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `query`, `analysis` and
   *   `disabled`.
   * @returns A local provider. Ordinary writable signals don't emit an unused directive model's
   *   output.
   */
  static provideFactory<S extends OrigamiQuerySuggestion>(
    factory: () => OrigamiQueryFieldOptions<S>,
  ): Provider {
    return { provide: OrigamiQueryFieldOptions, useFactory: factory };
  }
}
