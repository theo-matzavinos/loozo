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
import {
  type CheckboxGroupOptions,
  type CheckboxGroupState,
  checkboxGroup,
} from "@ui-sdk/core/checkbox";

/** Core's `group` slot handles no events; its checkboxes handle presses. */
const events = [] as const;

/** UiCheckboxGroup takes every core option as an input or output. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * Checkboxes that share one value, the checked checkboxes' values, on an element around them.
 * Inputs are core's `checkboxGroup` options; `value` controls it, and `valueChange` reports a
 * change, so `[(value)]` binds both. Each checkbox inside names its `value`; one with `parent`
 * checks or unchecks the others. Each checkbox submits through its own `uiCheckboxInput`, under
 * the group's `name`; `required` needs `<input uiCheckboxGroupInput />` inside the group.
 *
 * @example
 * ```html
 * <div uiCheckboxGroup name="toppings" [(value)]="toppings" aria-label="Toppings">
 *   @for (topping of all; track topping) {
 *     <label>
 *       <button uiCheckbox #box="uiCheckbox" [value]="topping"></button>
 *       <input [uiCheckboxInput]="box" />
 *       {{ topping }}
 *     </label>
 *   }
 * </div>
 * ```
 */
@Directive({
  selector: "[uiCheckboxGroup]",
  exportAs: "uiCheckboxGroup",
  host: { "[attr.data-ui-sdk-id]": "instanceId" },
})
export class UiCheckboxGroup<T extends string = string> implements OnInit {
  /** The checked checkboxes' values. Set it to control the group. */
  readonly value = input<T[] | undefined>(undefined);
  /** The values checked at first, when uncontrolled; also what a form reset returns to. */
  readonly defaultValue = input<T[] | undefined>(undefined);
  /** Every value a parent checkbox checks. Set it so the parent renders right on the server. */
  readonly allValues = input<T[] | undefined>(undefined);
  /** Disables every checkbox like native ones: not focusable, not changed, not submitted. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Keeps the checkboxes focusable and submitted, but stops changes. Written `readonly`, like a native input's. */
  readonly readOnly = input(undefined, { alias: "readonly", transform: optionalBoolean });
  /** Blocks form submission until a checkbox is checked, through `uiCheckboxGroupInput`. */
  readonly required = input(undefined, { transform: optionalBoolean });
  /** The name every checkbox in the group submits under, through its own input. */
  readonly name = input<string | undefined>(undefined);
  /** The id of the form it belongs to, when it isn't inside that form. */
  readonly form = input<string | undefined>(undefined);
  /** Checks values from anywhere; create one with `createCheckboxGroupController()`. */
  readonly controller: InputSignal<CheckboxGroupOptions<T>["controller"]> =
    input<CheckboxGroupOptions<T>["controller"]>(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /** A press or a form reset wants to change `value`. Call `details.cancel()` to refuse it. */
  readonly valueChangeRequest =
    output<UiSdkEvent<NonNullable<CheckboxGroupOptions<T>["onValueChange"]>>>();
  /** `value` changed, after no `valueChangeRequest` listener canceled it. */
  readonly valueChange = output<T[]>();

  /** The core instance; the checkboxes inside read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    checkboxGroup,
    () => ({
      value: this.value(),
      defaultValue: this.defaultValue(),
      allValues: this.allValues(),
      disabled: this.disabled(),
      readOnly: this.readOnly(),
      required: this.required(),
      name: this.name(),
      form: this.form(),
      controller: this.controller() as CheckboxGroupOptions["controller"],
      debug: this.debug(),
      onValueChange: (value, details) => {
        this.valueChangeRequest.emit({ value: value as T[], details });

        if (details.canceled) {
          return;
        }

        this.valueChange.emit(value as T[]);
      },
    }),
    "uiCheckboxGroup",
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot<CheckboxGroupState>(this.ɵroot, "group", () => ({}), {
    events,
  });

  /** The checked values, and whether it's disabled, read-only and required. */
  readonly state: Signal<CheckboxGroupState> = this.slot.state;

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiCheckboxGroup>,
    Exclude<keyof CheckboxGroupOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
