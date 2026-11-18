import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiTooltip } from "@loozo/origami-ui/tooltip";
import { cn } from "../cn";

/**
 * A short description of a control over Origami's Tooltip, shown on hover and keyboard focus:
 * a TooltipTrigger on the control itself and a TooltipContent beside it. The root is
 * layout-transparent (`display: contents`), so the control stays the flex or grid item.
 *
 * @example
 * ```html
 * <span fold__Tooltip>
 *   <button fold__Button size="icon" variant="ghost" aria-label="Copy link" fold__TooltipTrigger>…</button>
 *   <span fold__TooltipContent>Copies the address of this page</span>
 * </span>
 * ```
 */
@Directive({
  selector: "[fold__Tooltip]",
  exportAs: "fold__Tooltip",
  hostDirectives: [
    {
      directive: OrigamiTooltip,
      inputs: ["open", "disabled", "openDelay"],
      outputs: ["openChange"],
    },
  ],
  host: { "data-slot": "tooltip", "[class]": "classes()" },
})
export class Tooltip {
  readonly class = input("");

  /** Origami's readonly observation: `open` and `disabled`. */
  readonly state = inject(OrigamiTooltip).state;

  protected readonly classes = computed(() => cn("contents", this.class()));
}
