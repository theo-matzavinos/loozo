import { Directive, computed, inject, input, numberAttribute } from "@angular/core";
import { ProgressContext } from "./progress-context";
import { OrigamiProgressOptions } from "./progress-options";
import { OrigamiProgressState } from "./progress-state";

/**
 * `numberAttribute` for the value, except that `undefined` and `null` leave it unknown; other
 * values that aren't numbers (`""`, `"abc"`) become `NaN`, which is indeterminate too.
 */
function valueAttribute(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return numberAttribute(value);
}

/**
 * Progress root: a `role="progressbar"` that reports how much of a task is done, from 0 to
 * `max`, or that its progress is unknown (indeterminate) while it has no value. A finite value
 * renders clamped to `[0, max]`; a non-finite value, and a `max` that isn't finite or is 0 or
 * less, render indeterminate. Nothing is validated, thrown or logged.
 *
 * Binds static `role="progressbar"` and `aria-valuemin="0"`, `aria-valuemax` (absent without a
 * valid `max`), `aria-valuenow` (the clamped value, absent while indeterminate) and
 * `aria-valuetext` (the consumer's `valueText`, else the percent formatted by
 * `Intl.NumberFormat` under the root's `LOCALE_ID`, absent while indeterminate without one). For
 * the consumer's CSS it binds the `--og-progress-percent` custom property, the value's position
 * from 0% to 100%, absent while indeterminate, and empty `data-complete` and
 * `data-indeterminate` markers, absent otherwise. Every one of them is in server HTML, and
 * hydration keeps them; a browser whose `Intl` formats the default percent differently from the
 * server's rewrites `aria-valuetext` at its first change detection, without a hydration error.
 * Use the `valueText` input rather than a static `aria-valuetext`, which the binding replaces.
 *
 * ARIA requires a name, and the root binds none: give it `aria-labelledby` naming a visible
 * title or an `aria-label`, statically, by binding or from a composer's `host`. The consumer owns
 * all markup, styling and animation: a fill element sized by `--og-progress-percent`, and the
 * indeterminate animation with its reduced-motion variant. ARIA makes a progressbar's children
 * presentational, so don't put headings or links inside it.
 *
 * @example
 * ```html
 * <div ogProgress [value]="step()" [max]="steps()" aria-labelledby="dialog-title" class="bar">
 *   <span class="fill"></span>
 * </div>
 * <div ogProgress aria-label="Loading reservations" class="loader"></div>
 * ```
 */
@Directive({
  selector: "[ogProgress]",
  exportAs: "ogProgress",
  providers: [
    OrigamiProgressOptions.provideExisting(() => OrigamiProgress),
    ProgressContext,
    OrigamiProgressState,
  ],
  host: {
    role: "progressbar",
    "aria-valuemin": "0",
    "[attr.aria-valuemax]": "maxAttribute()",
    "[attr.aria-valuenow]": "nowAttribute()",
    "[attr.aria-valuetext]": "valueTextAttribute()",
    "[style.--og-progress-percent]": "percentProperty()",
    "[attr.data-complete]": "completeAttribute()",
    "[attr.data-indeterminate]": "indeterminateAttribute()",
  },
})
export class OrigamiProgress implements OrigamiProgressOptions {
  /**
   * Own value, default null, which means unknown progress (indeterminate), with number-attribute
   * coercion (`value="2"`) that keeps `undefined` and `null` unknown and turns other non-numbers
   * into `NaN`, also indeterminate. A finite value renders clamped to `[0, max]`. Replaced
   * Options supply the effective value instead.
   */
  readonly value = input<number | null, unknown>(null, { transform: valueAttribute });
  /**
   * Own maximum, default 100, with number-attribute coercion (`max="4"`); the minimum is always
   * 0. A `max` that isn't finite or is 0 or less renders the bar indeterminate without
   * `aria-valuemax`. Replaced Options supply the effective maximum instead.
   */
  readonly max = input(100, { transform: numberAttribute });
  /**
   * Own value text, default null, which means the localized percent of the rendered value under
   * the root's `LOCALE_ID` while determinate and no `aria-valuetext` while indeterminate. A
   * string, the empty string included, is bound as given, also while indeterminate; the consumer
   * owns its translation. Replaced Options supply the effective text instead.
   */
  readonly valueText = input<string | null>(null);
  /** This root's readonly rendered observation, shared with its descendants. */
  readonly state = inject(OrigamiProgressState);

  readonly #context = inject(ProgressContext);

  /** @internal The effective max, absent without a valid one. */
  protected readonly maxAttribute = this.#context.max;
  /** @internal The clamped value, absent while indeterminate. */
  protected readonly nowAttribute = this.#context.value;
  /** @internal The effective value text, absent while null. */
  protected readonly valueTextAttribute = this.#context.valueText;
  /** @internal The value's position, a percentage the consumer's CSS reads; absent while indeterminate. */
  protected readonly percentProperty = computed(() => {
    const percent = this.#context.percent();

    if (percent === null) {
      return null;
    }

    return `${percent}%`;
  });
  /** @internal Present while the rendered value equals max. */
  protected readonly completeAttribute = computed(() => {
    if (this.#context.complete()) {
      return "";
    }

    return null;
  });
  /** @internal Present while the bar has no rendered value. */
  protected readonly indeterminateAttribute = computed(() => {
    if (this.#context.value() === null) {
      return "";
    }

    return null;
  });
}
