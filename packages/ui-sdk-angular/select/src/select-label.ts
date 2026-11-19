import { Directive, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { UiSelect } from "./select";

/** The event types core's `label` slot handles, declared below as static host listeners. */
const events = ["click"] as const;

/** Core's `label` slot takes no props. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * The select's visible label, inside its root. It names the trigger, and pressing it focuses the
 * trigger without opening the popup, like a native select's label.
 *
 * @example
 * ```html
 * <div uiSelect>
 *   <span uiSelectLabel>Fruit</span>
 *   <button uiSelectTrigger>…</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[uiSelectLabel]",
  exportAs: "uiSelectLabel",
  host: { "(click)": 'slot.dispatch("click", $event)' },
})
export class UiSelectLabel {
  protected readonly slot = ɵinjectSlot(inject(UiSelect).ɵroot, "label", () => ({}), { events });
}

/** It takes no inputs. */
type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiSelectLabel>, never>>;

/** Core's slot takes no props, so nothing is classified. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)[keyof typeof classes][number], never>>;
