import { DestroyRef, Directive, computed, inject, input } from "@angular/core";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { QueryFieldContentScope } from "./query-field-content";
import { QueryFieldContext } from "./query-field-context";

/**
 * The message row inside an `ogQueryFieldContent`, above the rows: render the caret token's error
 * in it, usually behind `@if (qf.state.caretToken()?.error; as error)`. While it's mounted and the
 * caret's token is invalid the list presents it, also without suggestions, and each row's
 * `aria-describedby` names it. It is `aria-hidden="true"`: screen readers get the message from the
 * input's and the rows' descriptions. Its `id` is authored or generated; it is `hidden` while the
 * caret's token isn't invalid. Without one, an invalid token with no suggestions shows no popup;
 * its error is still in the input's description. Outside an `ogQueryFieldContent` of its own query
 * field it throws at construction; a second mounted Message fails.
 */
@Directive({
  selector: "[ogQueryFieldMessage]",
  exportAs: "ogQueryFieldMessage",
  host: {
    "aria-hidden": "true",
    "[id]": "id()",
    "[attr.hidden]": "hidden()",
  },
})
export class OrigamiQueryFieldMessage {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. */
  readonly id = input(injectUniqueId("query-field-message"));

  readonly #context = inject(QueryFieldContext);
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Hidden while the caret's token isn't invalid. */
  protected readonly hidden = computed(() => {
    if (this.#context.caretToken()?.error !== undefined) {
      return null;
    }

    return "";
  });

  constructor() {
    const scope = inject(QueryFieldContentScope, { optional: true });

    if (scope === null || scope.context !== this.#context) {
      throw new Error("ogQueryFieldMessage must be inside ogQueryFieldContent.");
    }
  }

  /** @internal Registers the Message once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerMessage({ id: this.id }, this.#destroyRef);
  }
}
