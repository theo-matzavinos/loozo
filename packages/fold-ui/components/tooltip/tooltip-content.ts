import { Directive, computed, input } from "@angular/core";
import {
  OrigamiTooltipContent,
  OrigamiTooltipContentOptions,
  type OrigamiTooltipAlign,
  type OrigamiTooltipSide,
} from "@loozo/origami-ui/tooltip";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { cn } from "../cn";
import { popupMotionClasses } from "../popup";

/**
 * The Tooltip's text, in the top layer: an inverted 12px chip, 6px above its Trigger by default and
 * up to 256px wide. Keep it to text; it can't hold anything interactive.
 */
@Directive({
  selector: "[fold__TooltipContent]",
  hostDirectives: [OrigamiTooltipContent],
  // fold's own Content Options, replacing Origami's as a whole, so the chip sits 6px from the Trigger.
  providers: [OrigamiTooltipContentOptions.provideExisting(() => TooltipContent)],
  host: { "data-slot": "tooltip-content", "[class]": "classes()" },
})
export class TooltipContent implements OrigamiTooltipContentOptions {
  readonly id = input(injectUniqueId("tooltip-content"));
  readonly side = input<OrigamiTooltipSide>("block-start");
  readonly align = input<OrigamiTooltipAlign>("center");
  readonly gap = input(6);
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "box-border max-w-64 overflow-visible rounded-option border border-transparent bg-foreground px-2 py-1",
      "text-label font-normal text-pretty text-background shadow-popover",
      // Forced colors drop the fill and shadow; the transparent border then paints the chip's edge.
      "forced-colors:border-[CanvasText]",
      popupMotionClasses,
      this.class(),
    ),
  );
}
