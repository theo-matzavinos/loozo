import { Directive, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectInstanceId,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { UiSelect } from "./select";

/** Core's `group` slot handles no events. */
const events = [] as const;

/**
 * How UiSelectGroup passes core's props, none of them inputs. `id` is internal: an id made for it
 * and rendered as `data-ui-sdk-id`, so hydration keeps it; its label and items read it.
 */
const classes = { internal: ["id"], fixed: [], excluded: [] } as const;

/**
 * A group of items inside the select's content, named by its `uiSelectGroupLabel`. Core never
 * hides it, even with no items.
 *
 * @example
 * ```html
 * <div uiSelectGroup>
 *   <div uiSelectGroupLabel>Citrus</div>
 *   <div [uiSelectItem]="'lemon'">Lemon</div>
 * </div>
 * ```
 */
@Directive({
  selector: "[uiSelectGroup]",
  exportAs: "uiSelectGroup",
  host: { "[attr.data-ui-sdk-id]": "renderedId" },
})
export class UiSelectGroup {
  /** The group's id, which its label and items take as core's `group`. Not public API. */
  readonly ɵid = ɵinjectInstanceId();
  protected readonly renderedId = this.ɵid;

  protected readonly slot = ɵinjectSlot(inject(UiSelect).ɵroot, "group", () => ({ id: this.ɵid }), {
    events,
  });
}

/** It takes no inputs. */
type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiSelectGroup>, never>>;

/** Every core prop is internal. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)["internal"][number], "id">>;
