import {
  Directive,
  type InputSignal,
  type OnInit,
  type Signal,
  input,
  output,
} from "@angular/core";
import {
  type UiSdkEvent,
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectRoot,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { type RadioGroupOptions, type RadioGroupState, radioGroup } from "@ui-sdk/core/radio";

/** Core's `group` slot handles no events through listeners; it binds its own. */
const events = [] as const;

/** UiRadioGroup takes every core option as an input or output. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * A set of radios, on an element around them. Inputs are core's `radioGroup` options; `value`
 * controls it when set, and `null` checks nothing and stays controlled. `valueChange` reports a
 * change, so `[(value)]` binds both. To submit it with a form, give it a `name` and write each
 * radio's input: `<input [uiRadioInput]="radio" />`.
 *
 * @example
 * ```html
 * <div uiRadioGroup name="size" [(value)]="size" aria-label="Size">
 *   @for (option of sizes; track option) {
 *     <button uiRadio #radio="uiRadio" [value]="option"><span uiRadioIndicator></span>{{ option }}</button>
 *     <input [uiRadioInput]="radio" />
 *   }
 * </div>
 * ```
 */
@Directive({
  selector: "[uiRadioGroup]",
  exportAs: "uiRadioGroup",
  host: { "[attr.data-ui-sdk-id]": "instanceId" },
})
export class UiRadioGroup<T extends string = string> implements OnInit {
  /** The checked radio's value; `null` checks none. Set it to control the group. */
  readonly value = input<T | null | undefined>(undefined);
  /** The value checked at first, when uncontrolled; also what a form reset returns to. */
  readonly defaultValue = input<T | null | undefined>(undefined);
  /** Disables every radio like native radios: not focusable, not changed, not submitted. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Keeps the radios focusable and submitted, but stops changes. */
  readonly readOnly = input(undefined, { transform: optionalBoolean });
  /** Blocks form submission until a radio is checked. */
  readonly required = input(undefined, { transform: optionalBoolean });
  /** The name the checked radio submits under, through its input. */
  readonly name = input<string | undefined>(undefined);
  /** The id of the form it belongs to, when it isn't inside that form. */
  readonly form = input<string | undefined>(undefined);
  /** Whether arrow keys wrap from the last radio to the first; core's default is `true`. */
  readonly loop = input(undefined, { transform: optionalBoolean });
  /** Checks a radio from anywhere; create one with `createRadioGroupController()`. */
  readonly controller: InputSignal<RadioGroupOptions<T>["controller"]> =
    input<RadioGroupOptions<T>["controller"]>(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /** A press, an arrow key or a form reset wants to change `value`. Call `details.cancel()` to refuse it. */
  readonly valueChangeRequest =
    output<UiSdkEvent<NonNullable<RadioGroupOptions<T>["onValueChange"]>>>();
  /** `value` changed, after no `valueChangeRequest` listener canceled it. */
  readonly valueChange = output<T | null>();

  /** The core instance; the radio directives read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    radioGroup,
    () => ({
      value: this.value(),
      defaultValue: this.defaultValue(),
      disabled: this.disabled(),
      readOnly: this.readOnly(),
      required: this.required(),
      name: this.name(),
      form: this.form(),
      loop: this.loop(),
      controller: this.controller() as RadioGroupOptions["controller"],
      debug: this.debug(),
      onValueChange: (value, details) => {
        this.valueChangeRequest.emit({ value: value as T | null, details });

        if (details.canceled) {
          return;
        }

        this.valueChange.emit(value as T | null);
      },
    }),
    "uiRadioGroup",
    { slot: "input", markup: '<input [uiRadioInput]="radio" /> beside each radio' },
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot<RadioGroupState>(this.ɵroot, "group", () => ({}), {
    events,
  });

  /** The checked value, and whether the group is disabled, read-only and required. */
  readonly state: Signal<RadioGroupState> = this.slot.state;

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiRadioGroup>,
    Exclude<keyof RadioGroupOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
