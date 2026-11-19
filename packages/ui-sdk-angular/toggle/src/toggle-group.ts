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
  ɵinjectToolbarScope,
} from "@loozo/ui-sdk-angular";
import { type ToggleGroupOptions, type ToggleGroupState, toggleGroup } from "@ui-sdk/core/toggle";

/** Core's `group` slot handles no events through listeners; its toggles handle the keys. */
const events = [] as const;

/** How UiToggleGroup passes core's options that aren't inputs. `toolbar` is internal: from a Toolbar around it. */
const classes = { internal: ["toolbar"], fixed: [], excluded: [] } as const;

/**
 * Toggles that share one value, with one tab stop and arrow keys between them, on an element
 * around them. Inputs are core's `toggleGroup` options; `value` controls it, and `valueChange`
 * reports a change, so `[(value)]` binds both. Each toggle inside names its `value`.
 *
 * @example
 * ```html
 * <div uiToggleGroup [(value)]="align" aria-label="Alignment">
 *   <button uiToggle value="left">Left</button>
 *   <button uiToggle value="center">Center</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[uiToggleGroup]",
  exportAs: "uiToggleGroup",
  host: { "[attr.data-ui-sdk-id]": "instanceId" },
})
export class UiToggleGroup<T extends string = string> implements OnInit {
  /** The pressed toggles' values. Set it to control the group. */
  readonly value = input<T[] | undefined>(undefined);
  /** The toggles pressed at first, when uncontrolled. */
  readonly defaultValue = input<T[] | undefined>(undefined);
  /** Lets several toggles be pressed at once. */
  readonly multiple = input(undefined, { transform: optionalBoolean });
  /** Whether the pressed toggle can be unpressed, when only one may be pressed; core's default is `true`. */
  readonly deselectable = input(undefined, { transform: optionalBoolean });
  /** Stops every toggle from being pressed; they stay focusable with `aria-disabled`. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Which arrow keys move between toggles. */
  readonly orientation: InputSignal<ToggleGroupOptions<T>["orientation"]> =
    input<ToggleGroupOptions<T>["orientation"]>(undefined);
  /** Whether arrow keys wrap from the last toggle to the first; core's default is `true`. */
  readonly loop = input(undefined, { transform: optionalBoolean });
  /** Presses toggles from anywhere; create one with `createToggleGroupController()`. */
  readonly controller: InputSignal<ToggleGroupOptions<T>["controller"]> =
    input<ToggleGroupOptions<T>["controller"]>(undefined);
  /** Logs every state change with its reason, in development builds. */
  readonly debug = input(undefined, { transform: optionalBoolean });
  /** A toggle wants to change `value`. Call `details.cancel()` to refuse it. */
  readonly valueChangeRequest =
    output<UiSdkEvent<NonNullable<ToggleGroupOptions<T>["onValueChange"]>>>();
  /** `value` changed, after no `valueChangeRequest` listener canceled it. */
  readonly valueChange = output<T[]>();

  readonly #toolbar = ɵinjectToolbarScope();

  /** The core instance; the toggles inside read it. Not public API. */
  readonly ɵroot = ɵinjectRoot(
    toggleGroup,
    () => ({
      value: this.value(),
      defaultValue: this.defaultValue(),
      multiple: this.multiple(),
      deselectable: this.deselectable(),
      disabled: this.disabled(),
      orientation: this.orientation(),
      loop: this.loop(),
      controller: this.controller() as ToggleGroupOptions["controller"],
      debug: this.debug(),
      toolbar: this.#toolbar(),
      onValueChange: (value, details) => {
        this.valueChangeRequest.emit({ value: value as T[], details });

        if (details.canceled) {
          return;
        }

        this.valueChange.emit(value as T[]);
      },
    }),
    "uiToggleGroup",
  );
  protected readonly instanceId = this.ɵroot.id;
  protected readonly slot = ɵinjectSlot<ToggleGroupState>(this.ɵroot, "group", () => ({}), {
    events,
  });

  /** The pressed values, whether several can be pressed, and whether it's disabled. */
  readonly state: Signal<ToggleGroupState> = this.slot.state;

  ngOnInit(): void {
    this.ɵroot.ready();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiToggleGroup>,
    Exclude<keyof ToggleGroupOptions, (typeof classes)[keyof typeof classes][number]>
  >
>;
