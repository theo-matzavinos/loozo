import { Directive, type OnInit, type Signal, inject, input } from "@angular/core";
import {
  type ɵBoundNames,
  type ɵExpect,
  type ɵSameNames,
  optionalBoolean,
  ɵinjectPresence,
  ɵinjectSlot,
} from "@loozo/ui-sdk-angular";
import type { CollapsiblePanelProps, CollapsiblePanelState } from "@ui-sdk/core/collapsible";
import { UiCollapsible } from "./collapsible";

/** Core's `panel` slot handles no events. */
const events = [] as const;

/** UiCollapsiblePanel takes every core prop as an input. */
const classes = { internal: [], fixed: [], excluded: [] } as const;

/**
 * The content the trigger shows and hides. It's structural: write it with `*` on the panel's
 * element, which is in the page while core has it there (open, closing, kept or findable). Its
 * template renders exactly one element; put every `@if` and `@for` inside it. For `keepMounted`
 * or `hiddenUntilFound`, write the `<ng-template>` form.
 *
 * @example
 * ```html
 * <div *uiCollapsiblePanel>…</div>
 * <ng-template uiCollapsiblePanel hiddenUntilFound><div>…</div></ng-template>
 * ```
 */
@Directive({ selector: "[uiCollapsiblePanel]", exportAs: "uiCollapsiblePanel" })
export class UiCollapsiblePanel implements OnInit {
  /** Keeps the closed panel in the page, hidden, so its content keeps its state. */
  readonly keepMounted = input(undefined, { transform: optionalBoolean });
  /** Keeps the closed panel in the page as `hidden="until-found"`, so find in page opens it. */
  readonly hiddenUntilFound = input(undefined, { transform: optionalBoolean });

  protected readonly slot = ɵinjectSlot<CollapsiblePanelState>(
    inject(UiCollapsible).ɵroot,
    "panel",
    () => ({ keepMounted: this.keepMounted(), hiddenUntilFound: this.hiddenUntilFound() }),
    { events, mounts: true },
  );
  readonly #presence = ɵinjectPresence(this.slot, "uiCollapsiblePanel");

  /** Whether the collapsible is open, and whether it's disabled. */
  readonly state: Signal<CollapsiblePanelState> = this.slot.state;

  ngOnInit(): void {
    this.#presence.sync();
  }
}

type _Parity = ɵExpect<
  ɵSameNames<
    ɵBoundNames<UiCollapsiblePanel>,
    Exclude<keyof CollapsiblePanelProps, (typeof classes)[keyof typeof classes][number]>
  >
>;
