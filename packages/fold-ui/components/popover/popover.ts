import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiPopover } from "@loozo/origami-ui/popover";
import { cn } from "../cn";

/**
 * A non-modal panel over Origami's Popover: a PopoverTrigger and the PopoverContent it opens 4px
 * below itself. Escape, an outside click and the Trigger close it. The root is layout-transparent
 * (`display: contents`).
 *
 * @example
 * ```html
 * <div fold__Popover [(open)]="filtersOpen">
 *   <button fold__PopoverTrigger>Filters</button>
 *   <div fold__PopoverContent aria-labelledby="filters-title">
 *     <h2 id="filters-title">Filters</h2>
 *     …
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__Popover]",
  exportAs: "fold__Popover",
  hostDirectives: [
    {
      directive: OrigamiPopover,
      inputs: ["open", "disabled", "dismissible"],
      outputs: ["openChange"],
    },
  ],
  host: { "data-slot": "popover", "[class]": "classes()" },
})
export class Popover {
  readonly class = input("");

  /** Origami's readonly observation: `open`, `disabled` and `dismissible`. */
  readonly state = inject(OrigamiPopover).state;

  protected readonly classes = computed(() => cn("contents", this.class()));
}
