import { Directive, type OnInit, type Signal, input, output } from "@angular/core";
import {
  type UiSdkEvent,
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  optionalChecked,
  ɵinjectRoot,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import {
  type CheckboxController,
  type CheckboxOptions,
  type CheckboxState,
  type CheckedState,
  checkbox,
} from "@ui-sdk/core/checkbox";

/** The event types core's `root` slot handles, declared below as static host listeners. */
const events = ["keydown", "keyup", "click"] as const;

/**
 * How UiCheckbox passes core's options that aren't inputs. `group` is internal: core reads it
 * from a CheckboxGroup, which this package doesn't ship yet; `parent` only works inside one.
 */
const classes = { internal: ["group"], fixed: [], excluded: ["parent"] } as const;

/**
 * A checkbox, on the `<button>` it's applied to. Inputs are core's `checkbox` options; `checked`
 * controls it and `checkedChange` reports a change, so `[(checked)]` binds both. To submit it with
 * a form, give it a `name` and write its input beside it: `<input [uiCheckboxInput]="ref" />`.
 *
 * @example
 * ```html
 * <label>
 *   <button uiCheckbox #terms="uiCheckbox" name="terms" [(checked)]="accepted">
 *     <span uiCheckboxIndicator>✓</span>
 *   </button>
 *   <input [uiCheckboxInput]="terms" />
 *   Accept the terms
 * </label>
 * ```
 */
@Directive({
  selector: "[uiCheckbox]",
  exportAs: "uiCheckbox",
  host: {
    "[attr.data-ui-sdk-id]": "instanceId",
    "(blur)": "blurred()",
    "(keydown)": 'slot.dispatch("keydown", $event)',
    "(keyup)": 'slot.dispatch("keyup", $event)',
    "(click)": 'slot.dispatch("click", $event)',
  },
})
export class UiCheckbox implements OnInit {
  /**
   * Whether it's checked: `true`, `false` or `"indeterminate"`. Set it to control the checkbox;
   * leave it unset for core to own it.
   */
  readonly checked = input(undefined, { transform: optionalChecked });
  /** Whether it starts checked, when uncontrolled; also what a form reset returns to. */
  readonly defaultChecked = input(undefined, { transform: optionalChecked });
  /** Disables it like a native control: not focusable, not changed, not submitted. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Keeps it focusable and submitted, but stops changes. Written `readonly`, like a native input's. */
  readonly readOnly = input(undefined, { alias: "readonly", transform: optionalBoolean });
  /** Blocks form submission until it's checked. */
  readonly required = input(undefined, { transform: optionalBoolean });
  /** The name it submits under, through its input. Without one, it submits nothing. */
  readonly name = input<string | undefined>(undefined);
  /** The value it submits while checked; `"on"` when unset. */
  readonly value = input<string | undefined>(undefined);
  /** The id of the form it belongs to, when it isn't inside that form. */
  readonly form = input<string | undefined>(undefined);
  /** Checks it from anywhere; create one with `createCheckboxController()`. */
  readonly controller = input<CheckboxController | undefined>(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /** A press or a form reset wants to change `checked`. Call `details.cancel()` to refuse it. */
  readonly checkedChangeRequest =
    output<UiSdkEvent<NonNullable<CheckboxOptions["onCheckedChange"]>>>();
  /** `checked` changed, after no `checkedChangeRequest` listener canceled it. */
  readonly checkedChange = output<CheckedState>();
  /**
   * Focus left the button, so the user is done with it. Signal Forms' `[formField]` marks the field
   * touched on it. A blur before Angular set its inputs doesn't emit.
   */
  readonly touch = output<void>();

  /** The core instance; the part directives read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    checkbox,
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
      group: undefined,
      onCheckedChange: (checked, details) => {
        this.checkedChangeRequest.emit({ value: checked, details });

        if (details.canceled) {
          return;
        }

        this.checkedChange.emit(checked);
      },
    }),
    "uiCheckbox",
    { slot: "input", markup: '<input [uiCheckboxInput]="ref" /> beside it' },
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot<CheckboxState>(this.ɵroot, "root", () => ({}), {
    events,
  });

  /** Whether it's checked or indeterminate, disabled, read-only and required. */
  readonly state: Signal<CheckboxState> = this.slot.state;

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
    ɵBoundNames<UiCheckbox>,
    Exclude<keyof CheckboxOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
