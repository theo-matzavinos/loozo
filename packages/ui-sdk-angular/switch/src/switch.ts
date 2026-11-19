import {
  Directive,
  type InputSignal,
  type OnInit,
  type OutputEmitterRef,
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
import {
  type SwitchController,
  type SwitchOptions,
  type SwitchState,
  switchPrimitive,
} from "@ui-sdk/core/switch";

/** The event types core's `root` slot handles, declared below as static host listeners. */
const events = ["keydown", "keyup", "click"] as const;

/** UiSwitch takes every core option as an input or output. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * An on/off switch, on the `<button>` it's applied to. Inputs are core's `switchPrimitive`
 * options; `checked` controls it and `checkedChange` reports a change, so `[(checked)]` binds
 * both. To submit it with a form, give it a `name` and write its input beside it:
 * `<input [uiSwitchInput]="ref" />`.
 *
 * @example
 * ```html
 * <button uiSwitch #wifi="uiSwitch" name="wifi" [(checked)]="wifiOn" aria-label="Wi-Fi">
 *   <span uiSwitchThumb></span>
 * </button>
 * <input [uiSwitchInput]="wifi" />
 * ```
 */
@Directive({
  selector: "[uiSwitch]",
  exportAs: "uiSwitch",
  host: {
    "[attr.data-ui-sdk-id]": "instanceId",
    "(blur)": "blurred()",
    "(keydown)": 'slot.dispatch("keydown", $event)',
    "(keyup)": 'slot.dispatch("keyup", $event)',
    "(click)": 'slot.dispatch("click", $event)',
  },
})
export class UiSwitch implements OnInit {
  /** Whether it's on. Set it to control the switch; leave it unset for core to own it. */
  readonly checked = input(undefined, { transform: optionalBoolean });
  /** Whether it starts on, when uncontrolled; also what a form reset returns to. */
  readonly defaultChecked = input(undefined, { transform: optionalBoolean });
  /** Disables it like a native control: not focusable, not changed, not submitted. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Keeps it focusable and submitted, but stops changes. Written `readonly`, like a native input's. */
  readonly readOnly = input(undefined, { alias: "readonly", transform: optionalBoolean });
  /** Blocks form submission until it's on. */
  readonly required = input(undefined, { transform: optionalBoolean });
  /** The name it submits under, through its input. Without one, it submits nothing. */
  readonly name = input<string | undefined>(undefined);
  /** The value it submits while on; `"on"` when unset. */
  readonly value = input<string | undefined>(undefined);
  /** The id of the form it belongs to, when it isn't inside that form. */
  readonly form = input<string | undefined>(undefined);
  /** Turns it on or off from anywhere; create one with `createSwitchController()`. */
  readonly controller: InputSignal<SwitchController | undefined> = input<
    SwitchController | undefined
  >(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /** A press or a form reset wants to change `checked`. Call `details.cancel()` to refuse it. */
  readonly checkedChangeRequest: OutputEmitterRef<
    UiSdkEvent<NonNullable<SwitchOptions["onCheckedChange"]>>
  > = output<UiSdkEvent<NonNullable<SwitchOptions["onCheckedChange"]>>>();
  /** `checked` changed, after no `checkedChangeRequest` listener canceled it. */
  readonly checkedChange = output<boolean>();
  /**
   * Focus left the button, so the user is done with it. Signal Forms' `[formField]` marks the field
   * touched on it. A blur before Angular set its inputs doesn't emit.
   */
  readonly touch = output<void>();

  /** The core instance; the part directives read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    switchPrimitive,
    () => ({
      checked: this.checked(),
      defaultChecked: this.defaultChecked(),
      disabled: this.disabled(),
      readOnly: this.readOnly(),
      required: this.required(),
      name: this.name(),
      value: this.value(),
      form: this.form(),
      controller: this.controller(),
      debug: this.debug(),
      onCheckedChange: (checked, details) => {
        this.checkedChangeRequest.emit({ value: checked, details });

        if (details.canceled) {
          return;
        }

        this.checkedChange.emit(checked);
      },
    }),
    "uiSwitch",
    { slot: "input", markup: '<input [uiSwitchInput]="ref" /> beside it' },
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot<SwitchState>(this.ɵroot, "root", () => ({}), { events });

  /** Whether it's on, disabled, read-only and required. */
  readonly state: Signal<SwitchState> = this.slot.state;

  protected blurred(): void {
    if (!this.ɵroot.isReady()) {
      return;
    }

    this.touch.emit();
  }

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiSwitch>,
    Exclude<keyof SwitchOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
