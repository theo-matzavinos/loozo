import {
  Directive,
  ElementRef,
  LOCALE_ID,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  linkedSignal,
  model,
  numberAttribute,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { injectDeferred } from "@loozo/origami-ui/utils";
import type { OrigamiCalendarDayRecord, OrigamiCalendarPeriodRecord } from "./calendar";
import { canonicalDay, monthOf } from "./calendar-date";
import { CalendarContext, CalendarRootOptions } from "./calendar-context";
import type { CalendarDaySpan } from "./calendar-context";
import { CalendarSeed } from "./calendar-seed";

/**
 * A range of days, `YYYY-MM-DD`, both ends included: `ogCalendarRange`'s value. A range the
 * Calendar writes has `start` on or before `end`; a one-day range has both equal.
 */
export type OrigamiDateRange = {
  /** The range's first day, `YYYY-MM-DD`. */
  readonly start: string;
  /** The range's last day, `YYYY-MM-DD`; in a range the Calendar writes, on or after `start`. */
  readonly end: string;
};

/**
 * Effective `ogCalendarRange` configuration, replaced as a whole rather than merged with unused
 * defaults. As `OrigamiCalendarOptions`, except that the value is a range.
 */
export abstract class OrigamiCalendarRangeOptions {
  /**
   * Writable chosen range, or null; the direct directive model defaults to null. Only a user's
   * second choice of an enabled day writes it, and not while the root is disabled or readonly:
   * the first choice sets a pending first day (State `anchor`), and the second writes a new
   * `{ start, end }` in chronological order, the same day allowed. The value is never half a
   * range. Days inside it may be disabled; only its ends must be enabled: when the bounds or
   * `dateDisabled` disable the pending first day before the second choice, that choice sets a new
   * first day and writes nothing. A value whose `start`
   * or `end` isn't a canonical day, or whose `end` is before its `start`, selects nothing and is
   * kept. External writes remain authoritative and drop a pending first day.
   */
  abstract readonly value: WritableSignal<OrigamiDateRange | null>;
  /**
   * Writable displayed month, `YYYY-MM`, or null (the direct directive model's default) to follow
   * the value: the Calendar then shows the month of the range's start, else today's. A choice
   * inside the displayed month that would move a followed display writes the displayed month here
   * instead, so the display and focus stay. Otherwise as `OrigamiCalendarOptions.month`.
   */
  abstract readonly month: WritableSignal<string | null>;
  /**
   * Writable view, `"days"` (the direct directive model's default), `"months"` or `"years"`, as
   * `OrigamiCalendarOptions.view`.
   */
  abstract readonly view: WritableSignal<"days" | "months" | "years">;
  /**
   * Earliest day that can be chosen or reached by keys, `YYYY-MM-DD`, or null for none (the
   * default), as `OrigamiCalendarOptions.minDate`; it bounds the range's ends.
   */
  abstract readonly minDate: Signal<string | null>;
  /** Latest day that can be chosen or reached by keys, as `minDate`; default null. */
  abstract readonly maxDate: Signal<string | null>;
  /**
   * Whether a day can't be chosen, called with each displayed day while rendering; the default
   * disables none. A disabled day can't be an end of the range, but can lie inside it. Otherwise
   * as `OrigamiCalendarOptions.dateDisabled`.
   */
  abstract readonly dateDisabled: Signal<(date: string) => boolean>;
  /**
   * The week's first day, an ISO weekday from 1 (Monday) to 7 (Sunday), or null (the default)
   * for the locale's, as `OrigamiCalendarOptions.weekStart`.
   */
  abstract readonly weekStart: Signal<1 | 2 | 3 | 4 | 5 | 6 | 7 | null>;
  /** BCP 47 locale of every label and of the default week start; the directive defaults to `LOCALE_ID`. */
  abstract readonly locale: Signal<string>;
  /**
   * Today, `YYYY-MM-DD`; the direct directive defaults to the seed, as
   * `OrigamiCalendarOptions.today`.
   */
  abstract readonly today: Signal<string>;
  /** Always six weeks, so the grid's height never changes between months; default false. */
  abstract readonly fixedWeeks: Signal<boolean>;
  /**
   * Columns of the months and years views, a whole number from 1 to 12; default 3, as
   * `OrigamiCalendarOptions.columns`.
   */
  abstract readonly columns: Signal<number>;
  /**
   * Blocks choosing, focus and the pointer, and drops a pending first day; default false.
   * `[formField]` writes it from the field's `disabled()` rules. External writes remain
   * authoritative.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * Browses without choosing: no first day is ever pending, and becoming readonly drops one;
   * default false. `[formField]` writes it from the field's `readonly()` rules.
   */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces range Calendar Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiCalendarRangeOptions> | AbstractType<OrigamiCalendarRangeOptions>,
  ): Provider {
    return { provide: OrigamiCalendarRangeOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all range Calendar Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every property.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiCalendarRangeOptions): Provider {
    return { provide: OrigamiCalendarRangeOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest `ogCalendarRange`; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiCalendarRangeState {
  readonly #options = injectDeferred(OrigamiCalendarRangeOptions);
  readonly #root = injectDeferred(CalendarRootOptions);
  readonly #context = inject(CalendarContext);

  /**
   * Effective range, including null and ranges that select nothing. Never half a range, even
   * while a first day is pending. No writable alias is exposed.
   */
  readonly value: Signal<OrigamiDateRange | null> = computed(() => this.#options().value());
  /**
   * The pending first day, `YYYY-MM-DD`, between a first and a second choice, else null. Set by
   * the first choice; dropped by the second, Escape, any write of the value, and the root
   * becoming readonly or disabled; kept when focus leaves the root. A second choice after the
   * bounds or `dateDisabled` disabled it sets a new one instead. Always null on the server.
   */
  readonly anchor: Signal<string | null> = computed(() => this.#root().anchor());
  /**
   * The displayed month, `YYYY-MM`: the `month` Option while it is canonical, else the month of
   * the range's start, else today's; held to 0001-02 through 9999-11.
   */
  readonly month: Signal<string> = this.#context.position;
  /** The effective view: `"days"`, `"months"` or `"years"`. */
  readonly view: Signal<"days" | "months" | "years"> = this.#context.view;
  /**
   * The displayed period in the locale, by view: "October 2026", "2026" or "2016 – 2027"; render
   * it in the Heading.
   */
  readonly heading: Signal<string> = this.#context.heading;
  /**
   * The seven weekday labels from the week start, for the header: `short` ("Tue") to show and
   * `long` ("Tuesday") for `abbr`.
   */
  readonly weekdays: Signal<readonly { readonly short: string; readonly long: string }[]> =
    this.#context.weekdays;
  /**
   * The displayed weeks, seven days each from the week start, including the neighbouring
   * months' days (`outside`); four to six weeks, six with `fixedWeeks`. Computed without any
   * cell mounted, on the server too.
   */
  readonly weeks: Signal<readonly (readonly OrigamiCalendarDayRecord[])[]> = this.#context.weeks;
  /** The twelve months of the displayed year, in rows of `columns`, for the months view. */
  readonly months: Signal<readonly (readonly OrigamiCalendarPeriodRecord[])[]> =
    this.#context.months;
  /** The displayed page of twelve years, in rows of `columns`, for the years view. */
  readonly years: Signal<readonly (readonly OrigamiCalendarPeriodRecord[])[]> = this.#context.years;
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/** The range `value` selects: both ends canonical days, in order; else null. */
function rangeOf(value: OrigamiDateRange | null): CalendarDaySpan | null {
  if (value === null) {
    return null;
  }

  const start = canonicalDay(value.start);
  const end = canonicalDay(value.end);

  if (start === null || end === null || end < start) {
    return null;
  }

  return { start, end };
}

function neverDisabled(): boolean {
  return false;
}

/**
 * Calendar root for one range of days: the `ogCalendar` grid, keys, bounds, locale and seed,
 * with a value of `{ start, end }`. The first choice (click, Enter or Space) of an enabled day
 * sets a pending first day, State `anchor`; while it is pending, the cells from it to the hovered
 * day, else the focused one, carry `data-preview`. The second choice writes `{ start, end }` in
 * chronological order, the same day allowed, and drops the anchor; Escape anywhere in the root,
 * Previous and Next included, drops it without writing; without one it returns from the months or
 * years view to the days, and is otherwise left to an enclosing Dialog or Popover. The value is never half a range: a pending first day is never written.
 * Disabled days can lie inside a range; only its ends must be enabled, so a second choice after
 * the bounds or `dateDisabled` disabled the anchor anchors anew. Any write of the value, and the root
 * becoming readonly or disabled, drop the anchor; focus leaving the root keeps it, so a range can
 * span months chosen with Previous and Next.
 *
 * In the days view the Grid is `aria-multiselectable="true"`, and every day has `aria-selected`:
 * `"true"` on the range's days, ends included, `"false"` elsewhere. Cells also carry `data-range-start`,
 * `data-range-end` and `data-in-range`. The grid's tab stop is the focused day, else the range's
 * start in the displayed month, else today, else the month's first enabled day. Render the same
 * parts as under `ogCalendar`, with the same months and years views, where the start's month and
 * year carry `data-selected`; the root's `state` is an `OrigamiCalendarRangeState`.
 *
 * Server rendering and hydration work as under `ogCalendar`: the root writes its seed to its
 * host (`data-today`, `data-week-start`), and a hydrating root keeps the server's. A pending
 * first day exists only in the browser.
 *
 * It is an Angular Signal Forms value control for an `OrigamiDateRange | null` field:
 * `[formField]` binds its `value` model, writes its `disabled` and `readonly` inputs and listens
 * to `touch`, which it emits when focus leaves the root; `focusBoundControl()` calls `focus()`.
 * Its Grid is the control of its nearest `ogField`.
 *
 * @example
 * ```html
 * <div ogCalendarRange [(value)]="period" #cal="ogCalendarRange">
 *   <h2 ogCalendarHeading>{{ cal.state.heading() }}</h2>
 *   <table ogCalendarGrid>
 *     <tbody>
 *       @for (week of cal.state.weeks(); track $index) {
 *         <tr>
 *           @for (day of week; track day.date) {
 *             <td ogCalendarCell [date]="day.date">{{ day.label }}</td>
 *           }
 *         </tr>
 *       }
 *     </tbody>
 *   </table>
 *   <p>{{ cal.state.anchor() ? "Choose the last day" : "Choose the first day" }}</p>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogCalendarRange]",
  exportAs: "ogCalendarRange",
  providers: [
    OrigamiCalendarRangeOptions.provideExisting(() => OrigamiCalendarRange),
    CalendarRootOptions.provideFactory(() => {
      const options = inject(OrigamiCalendarRangeOptions);
      const range = computed(() => rangeOf(options.value()));
      // Any change of the value, readonly or disabled drops the pending first day.
      const anchor = linkedSignal({
        source: () => ({
          value: options.value(),
          readonly: options.readonly(),
          disabled: options.disabled(),
        }),
        computation: (): string | null => null,
      });

      return {
        month: options.month,
        valueLevel: "days",
        view: options.view,
        setView: (view) => {
          options.view.set(view);
        },
        columns: options.columns,
        minDate: options.minDate,
        maxDate: options.maxDate,
        valueDisabled: options.dateDisabled,
        weekStart: options.weekStart,
        locale: options.locale,
        today: options.today,
        fixedWeeks: options.fixedWeeks,
        disabled: options.disabled,
        readonly: options.readonly,
        multiselectable: true,
        selected: (date) => {
          const current = range();

          return current !== null && current.start <= date && date <= current.end;
        },
        preferred: (month) => {
          const current = range();

          if (current !== null && monthOf(current.start) === month) {
            return current.start;
          }

          return null;
        },
        shown: () => range()?.start ?? null,
        choose: (date) => {
          const first = anchor();

          if (first === null) {
            anchor.set(date);

            return;
          }

          if (date < first) {
            options.value.set({ start: date, end: first });
          } else {
            options.value.set({ start: first, end: date });
          }

          anchor.set(null);
        },
        range,
        anchor,
        cancel: () => {
          if (anchor() === null) {
            return false;
          }

          anchor.set(null);

          return true;
        },
      };
    }),
    CalendarSeed,
    CalendarContext,
    OrigamiCalendarRangeState,
  ],
  host: {
    "[attr.data-today]": "seedToday",
    "[attr.data-week-start]": "seedWeekStart()",
    "(focusout)": "focusLeft($event)",
    "(keydown)": "keydown($event)",
  },
})
export class OrigamiCalendarRange
  implements OrigamiCalendarRangeOptions, FormValueControl<OrigamiDateRange | null>
{
  /**
   * Own chosen-range model, default null; `valueChange` emits each completed range written to
   * this model, never a pending first day, and `[formField]` binds it. Replaced Options supply
   * the effective value instead and do not fabricate this output.
   */
  readonly value = model<OrigamiDateRange | null>(null);
  /**
   * Own displayed-month model, default null (follow: the month of the range's start, else
   * today's); `monthChange` emits navigation and a choice that would move a followed display.
   * Replaced Options supply it instead.
   */
  readonly month = model<string | null>(null);
  /**
   * Own view model, default `"days"`; `viewChange` emits drill-downs and Escape. Replaced
   * Options supply the effective view instead.
   */
  readonly view = model<"days" | "months" | "years">("days");
  /** Own earliest-day input, default null; replaced Options supply the effective bound instead. */
  readonly minDate = input<string | null>(null);
  /** Own latest-day input, default null; replaced Options supply the effective bound instead. */
  readonly maxDate = input<string | null>(null);
  /** Own disabled-day predicate input, default none disabled; replaced Options supply it instead. */
  readonly dateDisabled = input<(date: string) => boolean>(neverDisabled);
  /** Own week-start input, 1 (Monday) to 7 (Sunday), default null for the locale's. */
  readonly weekStart = input<1 | 2 | 3 | 4 | 5 | 6 | 7 | null>(null);
  /** Own locale input, default Angular's `LOCALE_ID`; replaced Options supply it instead. */
  readonly locale = input(inject(LOCALE_ID));
  /**
   * Own today input, default the seed: the server's today while hydrating (`data-today`), else
   * the platform's clock in its own time zone. Replaced Options supply it instead.
   */
  readonly today = input(inject(CalendarSeed).today);
  /** Own six-weeks input, default false with boolean-attribute coercion. */
  readonly fixedWeeks = input(false, { transform: booleanAttribute });
  /** Own months and years columns input, default 3 with number-attribute coercion. */
  readonly columns = input(3, { transform: numberAttribute });
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
  readonly state = inject(OrigamiCalendarRangeState);

  readonly #context = inject(CalendarContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /**
   * Emits when focus leaves the root, not while it moves between cells or to Previous/Next, nor
   * when a move into another month replaces the focused cell; `[formField]` marks its field
   * touched. Leaving keeps a pending first day.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /** @internal The seed's today, `data-today`. */
  protected readonly seedToday = this.#context.seedToday;
  /** @internal The locale's week start, `data-week-start`. */
  protected readonly seedWeekStart = this.#context.localeWeekStart;

  /**
   * Focuses the cell holding the grid's tab stop, at once if it is mounted, else as soon as it
   * registers, as `OrigamiCalendar.focus()` does. Does nothing while disabled. Signal Forms'
   * `focusBoundControl()` calls it.
   * @param options - Passed to the cell's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }

  /** @internal Touch notification for Signal Forms, only when focus leaves the root's element. */
  protected focusLeft(event: FocusEvent): void {
    this.#context.focusOut(event, this.#element);
  }

  /**
   * @internal Escape anywhere in the root, Previous and Next included, drops a pending first day,
   * else returns to the days view.
   */
  protected keydown(event: KeyboardEvent): void {
    this.#context.escape(event);
  }
}
