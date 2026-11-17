import { Component, computed, inject, input } from "@angular/core";
import { OrigamiSlider, OrigamiSliderTrack } from "@loozo/origami-ui/slider";
import { cn } from "../cn";

/**
 * A single-thumb horizontal slider over Origami's Slider: a 4px neutral rail, a fill up to the
 * thumb, and a 24px-tall press area. Write its SliderThumb inside it; the thumb stays within the
 * slider's box at both ends.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <div class="flex items-baseline justify-between">
 *     <span fold__FieldLabel>Zoom</span>
 *     <output class="tabular-nums">{{ form.zoom().value() }}%</output>
 *   </div>
 *   <div fold__Slider [formField]="form.zoom" step="10">
 *     <div fold__SliderThumb [attr.aria-valuetext]="form.zoom().value() + '%'"></div>
 *   </div>
 * </div>
 * ```
 */
@Component({
  selector: "[fold__Slider]",
  exportAs: "fold__Slider",
  imports: [OrigamiSliderTrack],
  hostDirectives: [
    {
      directive: OrigamiSlider,
      inputs: ["value", "min", "max", "step", "disabled"],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: { "data-slot": "slider", "[class]": "classes()" },
  // The Track is the content box, which the thumb's center travels; the rail, the fill and the
  // press area reach 8px past it on each side, to the root's edges.
  template: `
    <div
      ogSliderTrack
      data-slot="slider-track"
      class="relative h-6 w-full cursor-pointer touch-pan-y before:absolute before:inset-y-0 before:-inset-x-2 group-data-disabled/slider:cursor-not-allowed has-[[aria-readonly=true]]:cursor-default group-data-dragging/slider:cursor-grabbing"
    >
      <span
        data-slot="slider-rail"
        aria-hidden="true"
        class="absolute inset-y-0 -inset-x-2 my-auto h-1 rounded-full bg-input forced-color-adjust-none forced-colors:bg-[GrayText]"
      ></span>
      <span
        data-slot="slider-fill"
        aria-hidden="true"
        class="absolute inset-y-0 -start-2 my-auto h-1 w-[calc(var(--og-slider-percent)+0.5rem)] rounded-full bg-foreground forced-color-adjust-none forced-colors:bg-[CanvasText]"
      ></span>
      <ng-content />
    </div>
  `,
})
export class Slider {
  readonly class = input("");

  readonly #slider = inject(OrigamiSlider);

  /** Origami's readonly observation: `value`, `percent`, `disabled` and `dragging`. */
  readonly state = this.#slider.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the thumb. */
  focus(options?: FocusOptions): void {
    this.#slider.focus(options);
  }

  protected readonly classes = computed(() =>
    cn(
      "group/slider relative flex w-full items-center px-2 data-disabled:opacity-50",
      this.class(),
    ),
  );
}
