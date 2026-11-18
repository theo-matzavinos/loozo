import { Directive, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { UiSwitch } from "./switch";

/** Core's `input` slot handles no events; core listens on the input itself. */
const events = [] as const;

/** Core's `input` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * The hidden native checkbox that submits, resets and validates its switch with a form. Write it
 * beside the switch's button and name the switch: `[uiSwitchInput]="ref"`, where `ref` is
 * `#ref="uiSwitch"`. The reference is read once.
 */
@Directive({ selector: "input[uiSwitchInput]", exportAs: "uiSwitchInput" })
export class UiSwitchInput {
  /** The switch this input submits. */
  readonly uiSwitchInput = input.required<UiSwitch>();

  protected readonly slot = ɵinjectSlot(
    () => this.uiSwitchInput().ɵroot,
    "input",
    () => ({}),
    {
      events,
    },
  );
}

/** Its one input is the reference, not a core prop. */
type _Parity = ɵExpect<ɵSameNames<Exclude<ɵBoundNames<UiSwitchInput>, "uiSwitchInput">, never>>;

/** Core's slot takes no props, so nothing is classified. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)[keyof typeof classes][number], never>>;
