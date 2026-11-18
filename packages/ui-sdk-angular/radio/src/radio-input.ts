import { Directive, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { RadioProps } from "@ui-sdk/core/radio";
import { UiRadio } from "./radio";

/** Core's `input` slot handles no events; core listens on the input itself. */
const events = [] as const;

/** How UiRadioInput passes core's props: `value` and `disabled` are internal, its radio's. */
const classes = { internal: ["value", "disabled"], fixed: [], excluded: [] } as const;

/**
 * The hidden native radio that submits, resets and validates its radio with a form. Write it
 * beside the radio's button and name the radio: `[uiRadioInput]="radio"`,
 * where `radio` is `#radio="uiRadio"`. The reference is read once.
 */
@Directive({ selector: "input[uiRadioInput]", exportAs: "uiRadioInput" })
export class UiRadioInput {
  /** The radio this input submits. */
  readonly uiRadioInput = input.required<UiRadio>();

  protected readonly slot = ɵinjectSlot(
    () => this.uiRadioInput().ɵgroup.ɵroot,
    "input",
    () => ({ value: this.uiRadioInput().value(), disabled: this.uiRadioInput().disabled() }),
    { events },
  );
}

/** Its one input is the reference, not a core prop: every core prop is internal. */
type _Parity = ɵExpect<
  ɵSameNames<
    Exclude<ɵBoundNames<UiRadioInput>, "uiRadioInput">,
    Exclude<keyof RadioProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
