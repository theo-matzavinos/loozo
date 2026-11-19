import { Directive, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  type ɵUiSdkToolbarScope,
  optionalBoolean,
  ɵUI_SDK_TOOLBAR,
  ɵinjectInstanceId,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { ToolbarGroupProps, ToolbarGroupState } from "@ui-sdk/core/toolbar";
import { UiToolbar } from "./toolbar";

/** Core's `group` slot handles no events. */
const events = [] as const;

/** How UiToolbarGroup passes core's props that aren't inputs. `id` is internal: a key made for it. */
const classes = { internal: ["id"], fixed: [], excluded: [] } as const;

/** A group of related items in a toolbar. `disabled` disables every item in it. */
@Directive({
  selector: "[uiToolbarGroup]",
  exportAs: "uiToolbarGroup",
  providers: [
    {
      provide: ɵUI_SDK_TOOLBAR,
      useFactory: () =>
        groupScope(inject(UiToolbarGroup), inject(ɵUI_SDK_TOOLBAR, { skipSelf: true })),
    },
  ],
})
export class UiToolbarGroup {
  /** Disables every item in it; they stay focusable with `aria-disabled`. */
  readonly disabled = input(undefined, { transform: optionalBoolean });

  readonly #key = ɵinjectInstanceId();

  protected readonly slot = ɵinjectSlot<ToolbarGroupState>(
    inject(UiToolbar).ɵroot,
    "group",
    () => ({ id: this.#key, disabled: this.disabled() }),
    { events },
  );

  /** Whether it's disabled, by itself or the toolbar, and the toolbar's orientation. */
  readonly state: Signal<ToolbarGroupState> = this.slot.state;
}

function groupScope(group: UiToolbarGroup, toolbar: ɵUiSdkToolbarScope): ɵUiSdkToolbarScope {
  return {
    groupDisabled: () => !!group.disabled(),
    scopeIn: (groupDisabled) => toolbar.scopeIn(groupDisabled),
  };
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiToolbarGroup>,
    Exclude<keyof ToolbarGroupProps | "id", (typeof classes)[keyof typeof classes][number]>
  >
>;
