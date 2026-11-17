import { Directive, computed, input } from "@angular/core";
import { OrigamiSliderThumb } from "@loozo/origami-ui/slider";
import { cn } from "../cn";

/**
 * The slider's focusable 16px thumb, `role="slider"`; write it inside a Slider. Put
 * `aria-valuetext` on it, and `aria-label` when no Field label names it.
 */
@Directive({
  selector: "[fold__SliderThumb]",
  hostDirectives: [OrigamiSliderThumb],
  host: { "data-slot": "slider-thumb", "[class]": "classes()" },
})
export class SliderThumb {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "absolute inset-y-0 start-(--og-slider-percent) -ms-2 my-auto size-4 cursor-grab rounded-full border border-foreground bg-surface shadow-edge",
      "transition-[border-color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
      // No base outline-none, so the ring's outline-style stays solid.
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      "aria-invalid:border-destructive-text",
      "aria-readonly:cursor-default aria-readonly:border-dashed",
      "group-data-disabled/slider:cursor-not-allowed group-data-dragging/slider:cursor-grabbing",
      // Opted out of forced colors so its center and border paint; every state color is then a
      // system color, the invalid border and the focus ring included.
      "forced-color-adjust-none forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:focus-visible:outline-[CanvasText]",
      "forced-colors:aria-invalid:border-[CanvasText]",
      this.class(),
    ),
  );
}
