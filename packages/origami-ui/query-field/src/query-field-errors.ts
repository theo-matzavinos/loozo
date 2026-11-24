import { DestroyRef, Directive, inject, input } from "@angular/core";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { QueryFieldContext } from "./query-field-context";

/**
 * The element holding every invalid token's message, which the input's `aria-describedby` names
 * while a current token is invalid: render it `hidden`, with one element per token error. A
 * hidden element named by `aria-describedby` still contributes its text, and browse mode doesn't
 * read it twice. Its `id` is authored, else generated and kept through hydration. Requires a nearest
 * query field root; a second mounted Errors fails.
 *
 * @example
 * ```html
 * <div ogQueryFieldErrors hidden>
 *   @for (token of qf.state.tokens(); track token.start) {
 *     @if (token.error) { <p>{{ token.error }}</p> }
 *   }
 * </div>
 * ```
 */
@Directive({
  selector: "[ogQueryFieldErrors]",
  exportAs: "ogQueryFieldErrors",
  host: { "[id]": "id()" },
})
export class OrigamiQueryFieldErrors {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. */
  readonly id = input(injectUniqueId("query-field-errors"));

  readonly #context = inject(QueryFieldContext);
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Registers the Errors once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerErrors({ id: this.id }, this.#destroyRef);
  }
}
