import { Directive, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectInstanceId,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { ToolbarButtonProps, ToolbarButtonState } from "@ui-sdk/core/toolbar";
import { UiToolbar } from "./toolbar";
import { UiToolbarGroup } from "./toolbar-group";

/** The event types core's `button` slot handles, declared below as static host listeners. */
const events = ["keydown", "keyup"] as const;

/**
 * How UiToolbarButton passes core's props that aren't inputs. `id` and `groupDisabled` are
 * internal: a key made for it, and the `disabled` of the ToolbarGroup around it.
 */
const classes = { internal: ["id", "groupDisabled"], fixed: [], excluded: [] } as const;

/** A button in a toolbar. Arrow keys move between it and the toolbar's other items. */
@Directive({
  selector: "[uiToolbarButton]",
  exportAs: "uiToolbarButton",
  host: {
    "(keydown)": 'slot.dispatch("keydown", $event)',
    "(keyup)": 'slot.dispatch("keyup", $event)',
  },
})
export class UiToolbarButton {
  /** Stops it being used; it stays focusable with `aria-disabled` unless `focusableWhenDisabled` is off. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Whether a disabled button stays reachable with arrow keys; core's default is `true`. */
  readonly focusableWhenDisabled = input(undefined, { transform: optionalBoolean });

  readonly #key = ɵinjectInstanceId();
  readonly #group = inject(UiToolbarGroup, { optional: true });

  protected readonly slot = ɵinjectSlot<ToolbarButtonState>(
    inject(UiToolbar).ɵroot,
    "button",
    () => ({
      id: this.#key,
      disabled: this.disabled(),
      focusableWhenDisabled: this.focusableWhenDisabled(),
      groupDisabled: this.#group?.disabled(),
    }),
    { events },
  );

  /** Whether it's disabled, by itself, its group or the toolbar, and the toolbar's orientation. */
  readonly state: Signal<ToolbarButtonState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiToolbarButton>,
    Exclude<
      keyof ToolbarButtonProps | "id" | "groupDisabled",
      (typeof classes)[keyof typeof classes][number]
    >
  >
>;
