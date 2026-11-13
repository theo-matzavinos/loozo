import { Directive, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  optionalNumber,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { SelectItemProps, SelectItemState } from "@ui-sdk/core/select";
import { UiSelect } from "./select";

/** The event types core's `item` slot handles, declared below as static host listeners. */
const events = ["pointermove", "pointerdown", "mousedown", "click"] as const;

/**
 * How UiSelectItem passes core's props that aren't inputs. `group` is internal: core reads it
 * from a SelectGroup, which this package doesn't ship yet.
 */
const classes = { internal: ["group"], fixed: [], excluded: [] } as const;

/**
 * One option. Its value is the directive's own input, `[uiSelectItem]`, of any type; give
 * object values an `itemToValue` on the root.
 *
 * @example
 * ```html
 * <div [uiSelectItem]="option.value" [label]="option.label" [disabled]="option.soldOut">{{ option.label }}</div>
 * ```
 */
@Directive({
  selector: "[uiSelectItem]",
  exportAs: "uiSelectItem",
  host: {
    "(pointermove)": 'slot.dispatch("pointermove", $event)',
    "(pointerdown)": 'slot.dispatch("pointerdown", $event)',
    "(mousedown)": 'slot.dispatch("mousedown", $event)',
    "(click)": 'slot.dispatch("click", $event)',
  },
})
export class UiSelectItem<T = string> {
  /** The item's value, core's `value` prop. */
  readonly uiSelectItem = input.required<T>();
  /** The label typeahead and the value read, when it isn't the item's text. */
  readonly label = input<string | undefined>(undefined);
  /** Stops it being highlighted by pointer or selected. */
  readonly disabled = input(undefined, { transform: optionalBoolean });
  /** Its position, for items that aren't all rendered. */
  readonly index = input(undefined, { transform: optionalNumber });

  protected readonly slot = ɵinjectSlot<SelectItemState>(
    inject(UiSelect).ɵroot,
    "item",
    () => ({
      value: this.uiSelectItem(),
      label: this.label(),
      disabled: this.disabled(),
      index: this.index(),
      group: undefined,
    }),
    { events, keyProp: "value" },
  );

  /** Whether it's highlighted, selected and disabled. */
  readonly state: Signal<SelectItemState> = this.slot.state;
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiSelectItem, { uiSelectItem: "value" }>,
    Exclude<keyof SelectItemProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
