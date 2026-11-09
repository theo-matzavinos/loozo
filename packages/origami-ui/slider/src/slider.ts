import {
  Directive,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  numberAttribute,
} from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { SliderContext } from "./slider-context";
import { OrigamiSliderOptions } from "./slider-options";
import { OrigamiSliderState } from "./slider-state";

/**
 * `numberAttribute` for a bound, except that `undefined` and `null` leave it unset: Signal Forms
 * writes `undefined` once a `min()` or `max()` rule stops applying.
 */
function boundAttribute(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return numberAttribute(value);
}

/**
 * Slider root: one value on a horizontal range, set by keys and by dragging a Thumb along a
 * Track. Allowed values are `min + k·step` up to `max`, rounded to the decimal places of `step`
 * and `min`; `max` itself is allowed only when it lies on that grid. Only user input writes the
 * value, and only an allowed one; an external value is never normalized or written back, and an
 * out-of-range or non-finite one only renders clamped. User writes are dropped while disabled,
 * while the `[formField]` on the root is readonly, under an invalid configuration and when they
 * equal the current value.
 *
 * Binds the `--og-slider-percent` custom property, the clamped value's position from 0% to 100%,
 * for the consumer's CSS to place the Thumb and fill a range, and empty `data-disabled` and
 * `data-dragging` markers. It binds no role; a consumer may add `role="group"`. Requires an
 * `ogSliderThumb`, the focusable `role="slider"`, and an `ogSliderTrack` around it for pointer
 * input; the consumer owns markup, styling, `touch-action` and the Thumb's `aria-valuetext`.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model, writes its
 * `disabled`, `min` and `max` inputs from the field's `disabled()`, `min()` and `max()` rules and
 * listens to `touch`, which it emits when focus leaves the Thumb; `focusBoundControl()` calls
 * `focus()`, which focuses the Thumb. Binding `[min]` or `[max]` next to such a rule is
 * unsupported: both write the same input. The Thumb joins the nearest `ogField`. It has no
 * `name` or native form value.
 *
 * @example
 * ```html
 * <div ogSlider [(value)]="zoom" min="20" max="180" step="10">
 *   <div ogSliderTrack class="track">
 *     <div ogSliderThumb class="thumb" aria-label="Zoom"></div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogSlider]",
  exportAs: "ogSlider",
  providers: [
    OrigamiSliderOptions.provideExisting(() => OrigamiSlider),
    SliderContext,
    OrigamiSliderState,
  ],
  host: {
    "[style.--og-slider-percent]": "percentProperty()",
    "[attr.data-disabled]": "disabledAttribute()",
    "[attr.data-dragging]": "draggingAttribute()",
  },
})
export class OrigamiSlider implements OrigamiSliderOptions, FormValueControl<number> {
  /**
   * Own value model, default 0; `valueChange` emits user key and pointer writes to this model,
   * and `[formField]` binds it. Replaced Options supply the effective value instead and do not
   * fabricate this output.
   */
  readonly value = model(0);
  /**
   * Own lowest value, default `undefined`, which means 0, with number-attribute coercion
   * (`min="20"`) that keeps `undefined` and `null` unset; `[formField]` writes it from the field's
   * `min()` rules. Replaced Options supply the effective bound instead.
   */
  readonly min = input(undefined, { transform: boundAttribute });
  /**
   * Own highest value, default `undefined`, which means 100, with number-attribute coercion
   * (`max="180"`) that keeps `undefined` and `null` unset; `[formField]` writes it from the
   * field's `max()` rules. Replaced Options supply the effective bound instead.
   */
  readonly max = input(undefined, { transform: boundAttribute });
  /**
   * Own step, default 1, counted from `min`, with number-attribute coercion (`step="10"`).
   * Replaced Options supply the effective step instead.
   */
  readonly step = input(1, { transform: numberAttribute });
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiSliderState);

  readonly #context = inject(SliderContext);

  /** Emits when focus leaves the Thumb; `[formField]` marks its field touched. */
  readonly touch = outputFromObservable(this.#context.touches);

  /** @internal The clamped value's position, a percentage the consumer's CSS reads. */
  protected readonly percentProperty = computed(() => `${this.#context.percent()}%`);
  /** @internal Present while disabled. */
  protected readonly disabledAttribute = computed(() => {
    if (this.#context.disabled()) {
      return "";
    }

    return null;
  });
  /** @internal Present while a pointer drag is live. */
  protected readonly draggingAttribute = computed(() => {
    if (this.#context.dragging()) {
      return "";
    }

    return null;
  });

  /**
   * Focuses the Thumb once it has registered, in its `ngOnInit`; does nothing before and while
   * disabled. Signal Forms' `focusBoundControl()` calls it.
   * @param options - Passed to the Thumb's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }
}
