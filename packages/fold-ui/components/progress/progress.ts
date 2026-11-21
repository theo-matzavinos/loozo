import { Component, computed, inject, input } from "@angular/core";
import { OrigamiProgress } from "@loozo/origami-ui/progress";
import { cn } from "../cn";

// One string, built with +: Angular evaluates a template's interpolated constant statically.
const FILL =
  "block h-full w-(--og-progress-percent) bg-foreground forced-colors:bg-[CanvasText] " +
  // Unknown: a 40% segment pinned to the physical left, so the percent translate starts off the bar in LTR and RTL.
  "[[data-indeterminate]>&]:absolute [[data-indeterminate]>&]:inset-y-0 [[data-indeterminate]>&]:left-0 [[data-indeterminate]>&]:w-2/5 " +
  // Reduced motion: a still, full, half-opacity bar instead of the sweep.
  "motion-reduce:[[data-indeterminate]>&]:w-full motion-reduce:[[data-indeterminate]>&]:opacity-50";

/**
 * How much of a task is done, over Origami's Progress: a 2px neutral bar that fills with the
 * foreground color, or sweeps while there's no `value`. Name it with `aria-label` or
 * `aria-labelledby`, and make it thicker with a height class.
 *
 * @example
 * ```html
 * <div fold__Progress [value]="sent()" [max]="total()" aria-labelledby="upload-name"></div>
 * <div fold__Progress aria-label="Loading reservations" class="h-1"></div>
 * ```
 */
@Component({
  selector: "[fold__Progress]",
  exportAs: "fold__Progress",
  hostDirectives: [{ directive: OrigamiProgress, inputs: ["value", "max", "valueText"] }],
  host: { "data-slot": "progress", "[class]": "classes()" },
  template: `<span data-slot="progress-fill" aria-hidden="true" class="${FILL}"></span>`,
  // The sweep animates `translate`, so the fill's computed `transform` stays `none`. Unlayered, so
  // an ordinary animate-* class doesn't override it; animate-none! on the fill does.
  styles: `
    @keyframes progress-indeterminate {
      from {
        translate: -100%;
      }
      to {
        translate: 350%;
      }
    }

    :host([data-indeterminate]) > [data-slot="progress-fill"] {
      animation: progress-indeterminate 1.2s ease-in-out infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      :host([data-indeterminate]) > [data-slot="progress-fill"] {
        animation: none;
      }
    }
  `,
})
export class Progress {
  readonly class = input("");

  /** Origami's readonly observation: `value`, `percent`, `complete` and `valueText`. */
  readonly state = inject(OrigamiProgress).state;

  protected readonly classes = computed(() =>
    cn(
      "relative block h-0.5 w-full overflow-hidden rounded-full bg-border",
      // Opted out of forced colors (inherited by the fill) so the track and the fill both paint.
      "forced-color-adjust-none forced-colors:bg-[GrayText]",
      this.class(),
    ),
  );
}
