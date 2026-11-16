import { Directive, type OnInit, type Signal, input, output } from "@angular/core";
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
  type ToggleController,
  type ToggleOptions,
  type ToggleState,
  toggle,
} from "@ui-sdk/core/toggle";

/** The event types core's `root` slot handles, declared below as static host listeners. */
const events = ["keydown", "keyup", "click"] as const;

/**
 * How UiToggle passes core's options that aren't inputs. `group` and `toolbar` are internal:
 * core reads them from a ToggleGroup or Toolbar, which this package doesn't ship yet.
 */
const classes = { internal: ["group", "toolbar"], fixed: [], excluded: [] } as const;

/**
 * A two-state button, on the element it's applied to. Inputs are core's `toggle` options;
 * `pressed` controls it and `pressedChange` reports a change, so `[(pressed)]` binds both.
 *
 * @example
 * ```html
 * <button uiToggle [(pressed)]="bold" aria-label="Bold">B</button>
 * ```
 */
@Directive({
  selector: "[uiToggle]",
  exportAs: "uiToggle",
  host: {
    "[attr.data-ui-sdk-id]": "root.id",
    "(keydown)": 'slot.dispatch("keydown", $event)',
    "(keyup)": 'slot.dispatch("keyup", $event)',
    "(click)": 'slot.dispatch("click", $event)',
  },
})
export class UiToggle implements OnInit {
  /** Whether it's pressed. Set it to control the toggle; leave it unset for core to own it. */
  readonly pressed = input(undefined, { transform: optionalBoolean });
  /** Whether it starts pressed, when uncontrolled. */
  readonly defaultPressed = input(undefined, { transform: optionalBoolean });
  /** Identifies the toggle inside a group. */
  readonly value = input<string | undefined>(undefined);
  /** Stops presses. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Keeps a disabled toggle focusable, with `aria-disabled`. */
  readonly focusableWhenDisabled = input(undefined, { transform: optionalBoolean });
  /** Presses it from anywhere; create one with `createToggleController()`. */
  readonly controller = input<ToggleController | undefined>(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /** A press wants to change `pressed`. Call `details.cancel()` to refuse it. */
  readonly pressedChangeRequest =
    output<UiSdkEvent<NonNullable<ToggleOptions["onPressedChange"]>>>();
  /** `pressed` changed, after no `pressedChangeRequest` listener canceled it. */
  readonly pressedChange = output<boolean>();

  protected readonly root = ɵinjectRoot(
    toggle,
    () => ({
      pressed: this.pressed(),
      defaultPressed: this.defaultPressed(),
      value: this.value(),
      disabled: this.disabled(),
      focusableWhenDisabled: this.focusableWhenDisabled(),
      controller: this.controller(),
      debug: this.debug(),
      group: undefined,
      toolbar: undefined,
      onPressedChange: (pressed, details) => {
        this.pressedChangeRequest.emit({ value: pressed, details });

        if (details.canceled) {
          return;
        }

        this.pressedChange.emit(pressed);
      },
    }),
    "uiToggle",
  );
  protected readonly slot = ɵinjectSlot<ToggleState>(this.root, "root", () => ({}), { events });

  /** What core renders the toggle from. Read it from another element, a descendant or a host binding. */
  readonly state: Signal<ToggleState> = this.slot.state;

  ngOnInit(): void {
    this.root.ready();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiToggle>,
    Exclude<keyof ToggleOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
