import { Directive, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectInstanceId,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { ToolbarInputProps, ToolbarInputState } from "@ui-sdk/core/toolbar";
import { UiToolbar } from "./toolbar";
import { UiToolbarGroup } from "./toolbar-group";

/** Core's `input` slot handles no events through listeners. */
const events = [] as const;

/**
 * How UiToolbarInput passes core's props that aren't inputs. `id` and `groupDisabled` are
 * internal: a key made for it, and the `disabled` of the ToolbarGroup around it.
 */
const classes = { internal: ["id", "groupDisabled"], fixed: [], excluded: [] } as const;

/** A text field in a toolbar. Arrow keys move its caret, and leave it only from the end they point at. */
@Directive({
  selector: "[uiToolbarInput]",
  exportAs: "uiToolbarInput",
})
export class UiToolbarInput {
  /** Stops it being used; it stays focusable with `aria-disabled` unless `focusableWhenDisabled` is off. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Whether a disabled field stays reachable with arrow keys; core's default is `true`. */
  readonly focusableWhenDisabled = input(undefined, { transform: optionalBoolean });

  readonly #key = ɵinjectInstanceId();
  readonly #group = inject(UiToolbarGroup, { optional: true });

  protected readonly slot = ɵinjectSlot<ToolbarInputState>(
    inject(UiToolbar).ɵroot,
    "input",
    () => ({
      id: this.#key,
      disabled: this.disabled(),
      focusableWhenDisabled: this.focusableWhenDisabled(),
      groupDisabled: this.#group?.disabled(),
    }),
    { events },
  );

  /** Whether it's disabled, by itself, its group or the toolbar, and the toolbar's orientation. */
  readonly state: Signal<ToolbarInputState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiToolbarInput>,
    Exclude<
      keyof ToolbarInputProps | "id" | "groupDisabled",
      (typeof classes)[keyof typeof classes][number]
    >
  >
>;
