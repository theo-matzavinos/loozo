import { Directive, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { UiSelect } from "./select";

/** Core's `form-input` slot handles no events; core listens on the input itself. */
const events = [] as const;

/** Core's `form-input` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * The hidden text input that submits, resets, validates and autofills its select's value with a
 * form. Write it inside the select's element; give the select a `name`.
 *
 * @example
 * ```html
 * <div uiSelect name="fruit" [(value)]="fruit">
 *   …
 *   <input uiSelectFormInput />
 * </div>
 * ```
 */
@Directive({ selector: "input[uiSelectFormInput]", exportAs: "uiSelectFormInput" })
export class UiSelectFormInput {
  protected readonly slot = ɵinjectSlot(inject(UiSelect).ɵroot, "form-input", () => ({}), {
    events,
  });
}

type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiSelectFormInput>, never>>;

/** Core's slot takes no props, so nothing is classified. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)[keyof typeof classes][number], never>>;
