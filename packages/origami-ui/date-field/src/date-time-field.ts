import { Directive, LOCALE_ID, booleanAttribute, inject, input, model } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { DateFieldContext } from "./date-field-context";
import { DateFieldDraft } from "./date-field-draft";
import { DateFieldRoot } from "./date-field-root";
import { OrigamiDateFieldState } from "./date-field-state";
import { OrigamiDateTimeFieldOptions } from "./date-time-field-options";
import { dateTimeValue } from "./date-time-value";
import { hourCycleAttribute } from "./hour-cycle-attribute";

/**
 * Date-time field root: a local date and time, `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`, typed
 * as locale-ordered segments. It shares the date field's parts and State: the consumer renders
 * the markup from `state.segments()`, an `ogDateFieldInput` group holding an `ogDateFieldSegment`
 * per unit and the literals between them as plain `aria-hidden` text, in the locale's order
 * (`Intl.DateTimeFormat#formatToParts` over the date and time units together, so the locale
 * orders the halves and the literal between them). Origami computes the order, the unit and day
 * period names, keys, focus and ARIA; it generates no markup.
 *
 * The value is a string or null, never a `Date`: the date and time on the wall, with no time
 * zone. The field never reads or writes a zone, an offset or `Z`, and never reads the runtime's
 * time zone; a value carrying one isn't canonical. An app that stores instants converts at its
 * own boundary, in the zone it chooses. `precision` `"minute"` (the default) writes
 * `YYYY-MM-DDTHH:mm`; `"second"` adds the second segment and writes `YYYY-MM-DDTHH:mm:ss`. A
 * value of the other precision shows, and the next edit writes the root's. `hourCycle` 12, 24 or
 * null (the locale's, the default) works as on `ogTimeField`. A half-typed draft is kept per
 * root: a complete draft naming a real day commits at once; emptying every unit commits null;
 * anything else keeps the last value and reports a parse error, `dateTimeIncomplete` while some
 * units are empty or `dateInvalid` for a date that doesn't exist (31 February), shown as typed.
 * Writing the value, a Signal Forms `reset()` included, replaces the draft; `reset()` also does so
 * to the value already committed. `clear()` discards the draft and commits null, also over a null
 * value. There are no bounds on the field: put them in the form schema.
 *
 * Server rendering and hydration, Signal Forms, Field membership and composing it through
 * `hostDirectives` work as for `ogDateField`: the root writes its resolved layout to its host as
 * `data-layout`, and a hydrating root keeps the server's until `locale`, `precision` or
 * `hourCycle` changes.
 *
 * @example
 * ```html
 * <div ogDateTimeField [(value)]="startsAt" #startsAt="ogDateTimeField">
 *   <div ogDateFieldInput aria-label="Starts at">
 *     @for (part of startsAt.state.segments(); track part.key) {
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
  selector: "[ogDateTimeField]",
  exportAs: "ogDateTimeField",
  providers: [
    OrigamiDateTimeFieldOptions.provideExisting(() => OrigamiDateTimeField),
    DateFieldRoot.provideFactory(() => {
      const options = inject(OrigamiDateTimeFieldOptions);

      return {
        value: options.value,
        locale: options.locale,
        disabled: options.disabled,
        readonly: options.readonly,
        hourCycle: options.hourCycle,
        shape: dateTimeValue(options.precision),
      };
    }),
    DateFieldDraft,
    DateFieldContext,
    OrigamiDateFieldState,
  ],
  host: { "[attr.data-layout]": "layout()" },
})
export class OrigamiDateTimeField
  implements OrigamiDateTimeFieldOptions, FormValueControl<string | null>
{
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
