import { Directive, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import { UiSelect } from "./select";
import { UiSelectGroup } from "./select-group";

/** Core's `group-label` slot handles no events. */
const events = [] as const;

/**
 * How UiSelectGroupLabel passes core's props, none of them inputs. `id` and `group` are internal:
 * the id of the `uiSelectGroup` it's inside.
 */
const classes = { internal: ["id", "group"], fixed: [], excluded: [] } as const;

/** The heading of a `uiSelectGroup`, inside it, which names the group. */
@Directive({ selector: "[uiSelectGroupLabel]", exportAs: "uiSelectGroupLabel" })
export class UiSelectGroupLabel {
  readonly #group = inject(UiSelectGroup);

  protected readonly slot = ɵinjectSlot(
    inject(UiSelect).ɵroot,
    "group-label",
    () => ({ id: this.#group.ɵid, group: this.#group.ɵid }),
    { events },
  );
}

/** It takes no inputs. */
type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiSelectGroupLabel>, never>>;

/** Every core prop is internal. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)["internal"][number], "id" | "group">>;
