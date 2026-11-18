import { Directive, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { UiCheckbox } from "./checkbox";

/** Core's `input` slot handles no events; core listens on the input itself. */
const events = [] as const;

/** Core's `input` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * The hidden native checkbox that submits, resets and validates its checkbox with a form. Write it
 * beside the checkbox's button and name the checkbox: `[uiCheckboxInput]="ref"`, where `ref` is
 * `#ref="uiCheckbox"`. The reference is read once.
 */
@Directive({ selector: "input[uiCheckboxInput]", exportAs: "uiCheckboxInput" })
export class UiCheckboxInput {
  /** The checkbox this input submits. */
  readonly uiCheckboxInput = input.required<UiCheckbox>();

  protected readonly slot = ɵinjectSlot(
    () => this.uiCheckboxInput().ɵroot,
    "input",
    () => ({}),
    {
      events,
    },
  );
}

/** Its one input is the reference, not a core prop. */
type _Parity = ɵExpect<ɵSameNames<Exclude<ɵBoundNames<UiCheckboxInput>, "uiCheckboxInput">, never>>;

/** Core's slot takes no props, so nothing is classified. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)[keyof typeof classes][number], never>>;
