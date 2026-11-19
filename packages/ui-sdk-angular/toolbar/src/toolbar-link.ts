import { Directive, type Signal, inject } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  ɵinjectInstanceId,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { ToolbarLinkState } from "@ui-sdk/core/toolbar";
import { UiToolbar } from "./toolbar";
import { UiToolbarGroup } from "./toolbar-group";

/** Core's `link` slot handles no events. */
const events = [] as const;

/**
 * How UiToolbarLink passes core's props, none of them inputs. `id` and `groupDisabled` are
 * internal: a key made for it, and the `disabled` of the ToolbarGroup around it.
 */
const classes = { internal: ["id", "groupDisabled"], fixed: [], excluded: [] } as const;

/** A link in a toolbar, on an `<a>`. Arrow keys move between it and the toolbar's other items. */
@Directive({ selector: "[uiToolbarLink]", exportAs: "uiToolbarLink" })
export class UiToolbarLink {
  readonly #key = ɵinjectInstanceId();
  readonly #group = inject(UiToolbarGroup, { optional: true });

  protected readonly slot = ɵinjectSlot<ToolbarLinkState>(
    inject(UiToolbar).ɵroot,
    "link",
    () => ({ id: this.#key, groupDisabled: this.#group?.disabled() }),
    { events },
  );

  /** Whether it's disabled, by its group or the toolbar, and the toolbar's orientation. */
  readonly state: Signal<ToolbarLinkState> = this.slot.state;
}

/** It takes no inputs. */
type _Parity = ɵExpect<ɵSameNames<ɵBoundNames<UiToolbarLink>, never>>;

/** Every core prop is internal. */
type _Classes = ɵExpect<ɵSameNames<(typeof classes)["internal"][number], "id" | "groupDisabled">>;
