import { Directive, ElementRef, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { UiSelect } from "./select";

/** Core's `form-input` slot handles no events; core listens on the textarea itself. */
const events = [] as const;

/** Core's `form-input` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * The hidden textarea that submits, resets, validates and autofills its select's value with a
 * form, as core's own renderers render it. Write it empty, inside the select's element; give the
 * select a `name`.
 *
 * @example
 * ```html
 * <div uiSelect name="fruit" [(value)]="fruit">
 *   …
 *   <textarea uiSelectFormInput></textarea>
 * </div>
 * ```
 */
@Directive({ selector: "textarea[uiSelectFormInput]", exportAs: "uiSelectFormInput" })
export class UiSelectFormInput {
  readonly #element = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;

  protected readonly slot = ɵinjectSlot(inject(UiSelect).ɵroot, "form-input", () => ({}), {
    events,
    // A textarea's default, which a native reset returns to, is its text, not a `value` attribute.
    // Keep it at core's value, as an input's `value` attribute is: a reset then never submits a key
    // the Select no longer has. On the server core's value write has already made it the text.
    afterWrite: ({ value = "" }) => {
      if (this.#element.defaultValue !== value) {
        this.#element.defaultValue = value;
      }
    },
  });
}

type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiSelectFormInput>, never>>;

/** Core's slot takes no props, so nothing is classified. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)[keyof typeof classes][number], never>>;
