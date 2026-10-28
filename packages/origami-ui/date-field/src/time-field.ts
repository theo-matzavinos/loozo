import { Directive, LOCALE_ID, booleanAttribute, inject, input, model } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { DateFieldContext } from "./date-field-context";
import { DateFieldDraft } from "./date-field-draft";
import { DateFieldRoot } from "./date-field-root";
import { OrigamiDateFieldState } from "./date-field-state";
import { hourCycleAttribute } from "./hour-cycle-attribute";
import { OrigamiTimeFieldOptions } from "./time-field-options";
import { timeValue } from "./time-value";

/**
 * Time field root: a wall-clock time, `HH:mm` or `HH:mm:ss`, typed as locale-ordered segments.
 * It shares the date field's parts and State: the consumer renders the markup from
 * `state.segments()`, an `ogDateFieldInput` group holding an `ogDateFieldSegment` per unit and the
 * literals between them as plain `aria-hidden` text, in the locale's order
 * (`Intl.DateTimeFormat#formatToParts`). Origami computes the order, the unit and day period
 * names, keys, focus and ARIA; it generates no markup.
 *
 * The value is a string or null, never a `Date`: the time on the wall, with no date and no time
 * zone. `precision` `"minute"` (the default) lays out hour and minute and writes `HH:mm`;
 * `"second"` adds the second and writes `HH:mm:ss`. A value of the other precision shows, and
 * the next edit writes the root's. `hourCycle` 12 shows the hour 1 to 12 and a day period
 * segment, AM or PM in the locale's words, with midnight 12 AM and noon 12 PM; 24 shows 0 to 23
 * without one; null, the default, follows the locale. The layout follows both. A half-typed
 * draft is kept per root: a complete time commits at once; emptying every unit commits null;
 * anything else keeps the last value and reports the parse error `timeIncomplete`. Writing the
 * value, a Signal Forms `reset()` included, replaces the draft; `reset()` also does so to the
 * value already committed. `clear()` discards the draft and commits null, also over a null value.
 *
 * Server rendering and hydration, Signal Forms, Field membership and composing it through
 * `hostDirectives` work as for `ogDateField`: the root writes its resolved layout, the hour cycle
 * and the day period names included, to its host as `data-layout`, and a hydrating root keeps the
 * server's until `locale`, `precision` or `hourCycle` changes, so a browser whose `Intl` puts a
 * different space before "PM" still hydrates the server's markup.
 *
 * @example
 * ```html
 * <div ogTimeField [(value)]="opensAt" hourCycle="24" #time="ogTimeField">
 *   <div ogDateFieldInput aria-label="Opens at">
 *     @for (part of time.state.segments(); track part.key) {
 *       @if (part.type === "literal") {
 *         <span aria-hidden="true">{{ part.text }}</span>
 *       } @else {
 *         <span [ogDateFieldSegment]="part.type"></span>
 *       }
 *     }
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogTimeField]",
  exportAs: "ogTimeField",
  providers: [
    OrigamiTimeFieldOptions.provideExisting(() => OrigamiTimeField),
    DateFieldRoot.provideFactory(() => {
      const options = inject(OrigamiTimeFieldOptions);

      return {
        value: options.value,
        locale: options.locale,
        disabled: options.disabled,
        readonly: options.readonly,
        hourCycle: options.hourCycle,
        shape: timeValue(options.precision),
      };
    }),
    DateFieldDraft,
    DateFieldContext,
    OrigamiDateFieldState,
  ],
  host: { "[attr.data-layout]": "layout()" },
})
export class OrigamiTimeField implements OrigamiTimeFieldOptions, FormValueControl<string | null> {
  /**
   * Own value model, default null; `valueChange` emits values the user commits to this model,
   * and `[formField]` binds it. Replaced Options supply the effective value instead and do not
   * fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own locale input, default `LOCALE_ID`; replaced Options supply the effective locale instead. */
  readonly locale = input(inject(LOCALE_ID));
  /** Own precision input, default `"minute"`; replaced Options supply the effective one instead. */
  readonly precision = input<"minute" | "second">("minute");
  /**
   * Own hour cycle input, default null (the locale's), also from a static `hourCycle="12"` or
   * `"24"` attribute; replaced Options supply the effective one instead.
   */
  readonly hourCycle = input(null, { transform: hourCycleAttribute });
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Own readonly input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `readonly()` rules. Replaced Options supply effective policy instead.
   */
  readonly readonly = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiDateFieldState);

  readonly #context = inject(DateFieldContext);

  /**
   * Emits when focus leaves the root's `ogDateFieldInput`, not when it moves between segments;
   * `[formField]` marks its field touched.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /** @internal The resolved layout, the hydration seed. */
  protected readonly layout = this.#context.layoutAttribute;

  /**
   * Focuses the first segment in DOM order, or, before any segment is mounted, the first one to
   * mount once it renders; nothing while disabled. Signal Forms' `focusBoundControl()` calls it.
   * @param options - Passed to the segment's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }

  /**
   * Empties the field: discards the draft, half-typed units included, and the typing session, and
   * commits null to the effective value. `valueChange` emits, and Signal Forms sees the write,
   * only if the value wasn't null already; the parse errors clear and every segment shows its
   * placeholder. Writing null to `value` doesn't do this while the value is already null, since
   * nothing changes, and Signal Forms' `reset()` also resets touched and dirty. A programmatic
   * write: it applies whatever `disabled` and `readonly` say. A segment keeping focus starts its
   * unit over with the next digit.
   */
  clear(): void {
    this.#context.clear();
  }
}
