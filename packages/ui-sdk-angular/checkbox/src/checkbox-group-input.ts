import { Directive, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { UiCheckboxGroup } from "./checkbox-group";

/** Core's `group-input` slot handles no events; core listens on the input itself. */
const events = [] as const;

/** Core's `group-input` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * The hidden native checkbox that makes a `required` checkbox group block form submission until
 * a checkbox is checked. Write it inside the group. It submits nothing; each checkbox submits
 * through its own `uiCheckboxInput`.
 */
@Directive({ selector: "input[uiCheckboxGroupInput]", exportAs: "uiCheckboxGroupInput" })
export class UiCheckboxGroupInput {
  protected readonly slot = ɵinjectSlot(inject(UiCheckboxGroup).ɵroot, "group-input", () => ({}), {
    events,
  });
}

/** It takes no inputs. */
type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiCheckboxGroupInput>, never>>;

/** Core's slot takes no props, so nothing is classified. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)[keyof typeof classes][number], never>>;
