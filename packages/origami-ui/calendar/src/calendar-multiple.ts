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
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { injectDeferred } from "@loozo/origami-ui/utils";
import type { OrigamiCalendarDayRecord } from "./calendar";
import { canonicalDay, monthOf } from "./calendar-date";
import { CalendarContext, CalendarRootOptions } from "./calendar-context";
import { CalendarSeed } from "./calendar-seed";

/**
 * Effective `ogCalendarMultiple` configuration, replaced as a whole rather than merged with
 * unused defaults. As `OrigamiCalendarOptions`, except that the value is several days.
 */
export abstract class OrigamiCalendarMultipleOptions {
  /**
   * Writable chosen days, `YYYY-MM-DD`; the direct directive model defaults to an empty array.
   * Only a user's choice of an enabled day writes it, and not while the root is disabled or
   * readonly: choosing a chosen day removes it, and choosing another adds it. Each choice writes
   * a new array: the canonical days in chronological order, each once, including days no cell
   * shows, then the entries that aren't canonical days, which select nothing, in their own
   * order. External writes remain authoritative and are kept as written until the next choice.
   */
  abstract readonly value: WritableSignal<readonly string[]>;
  /**
   * Writable displayed month, `YYYY-MM`, or null (the direct directive model's default) to follow
   * the value: the Calendar then shows the month of the value's first canonical day, else
   * today's. A choice inside the displayed month that would move a followed display, such as
   * removing the first day, writes the displayed month here instead, so the display and focus
   * stay. Otherwise as `OrigamiCalendarOptions.month`.
   */
  abstract readonly month: WritableSignal<string | null>;
  /**
   * Earliest day that can be chosen or reached by keys, `YYYY-MM-DD`, or null for none (the
   * default), as `OrigamiCalendarOptions.minDate`.
   */
  abstract readonly minDate: Signal<string | null>;
  /** Latest day that can be chosen or reached by keys, as `minDate`; default null. */
  abstract readonly maxDate: Signal<string | null>;
  /**
   * Whether a day can't be chosen, called with each displayed day while rendering; the default
   * disables none. As `OrigamiCalendarOptions.dateDisabled`.
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
   * Blocks choosing, focus and the pointer; default false. `[formField]` writes it from the
   * field's `disabled()` rules. External writes remain authoritative.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * Browses without choosing; default false. `[formField]` writes it from the field's
   * `readonly()` rules.
   */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces multiple Calendar Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiCalendarMultipleOptions> | AbstractType<OrigamiCalendarMultipleOptions>,
  ): Provider {
    return { provide: OrigamiCalendarMultipleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all multiple Calendar Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every property.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiCalendarMultipleOptions): Provider {
    return { provide: OrigamiCalendarMultipleOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest `ogCalendarMultiple`; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiCalendarMultipleState {
  readonly #options = injectDeferred(OrigamiCalendarMultipleOptions);
  readonly #context = inject(CalendarContext);

  /**
   * Effective chosen days as written, including entries no cell shows and entries that aren't
   * canonical days. No writable alias is exposed.
   */
  readonly value: Signal<readonly string[]> = computed(() => this.#options().value());
  /**
   * The displayed month, `YYYY-MM`: the `month` Option while it is canonical, else the month of
   * the value's first canonical day, else today's; held to 0001-02 through 9999-11.
   */
  readonly month: Signal<string> = this.#context.position;
  /** The displayed month and year in the locale, such as "October 2026"; render it in the Heading. */
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
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

function neverDisabled(): boolean {
  return false;
}

/**
 * `days` with `date` toggled, a new array: the canonical days in chronological order, each once,
 * without `date` if it was there and with it otherwise, then every entry that isn't a canonical
 * day in its original order.
 */
function toggled(days: readonly string[], date: string): readonly string[] {
  const chosen = new Set<string>();
  const others: string[] = [];
  let removed = false;

  for (const entry of days) {
    if (entry === date) {
      removed = true;

      continue;
    }

    if (canonicalDay(entry) === null) {
      others.push(entry);

      continue;
    }

    chosen.add(entry);
  }

  if (!removed) {
    chosen.add(date);
  }

  // Canonical days sort chronologically as strings.
  const result = [...chosen].sort();

  result.push(...others);

  return result;
}

/**
 * Calendar root for several days: the `ogCalendar` grid, keys, bounds, locale and seed, with a
 * value of several `YYYY-MM-DD` days. Clicking a day, Enter or Space toggles it, writing the
 * canonical days in chronological order, days no cell shows included, then the entries that
 * aren't canonical days. The Grid is `aria-multiselectable="true"`, and every day has `aria-selected`, `"true"`
 * or `"false"`. The grid's tab stop is the focused day, else the value's first day in the displayed
 * month, else today, else the month's first enabled day. Render the same parts as under
 * `ogCalendar`; the root's `state` is an `OrigamiCalendarMultipleState`.
 *
 * Server rendering and hydration work as under `ogCalendar`: the root writes its seed to its
 * host (`data-today`, `data-week-start`), and a hydrating root keeps the server's.
 *
 * It is an Angular Signal Forms value control for a `readonly string[]` field: `[formField]`
 * binds its `value` model, writes its `disabled` and `readonly` inputs and listens to `touch`,
 * which it emits when focus leaves the root; `focusBoundControl()` calls `focus()`. Its Grid is
 * the control of its nearest `ogField`.
 *
 * @example
 * ```html
 * <div ogCalendarMultiple [(value)]="days" #cal="ogCalendarMultiple">
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
 * </div>
 * ```
 */
@Directive({
  selector: "[ogCalendarMultiple]",
  exportAs: "ogCalendarMultiple",
  providers: [
    OrigamiCalendarMultipleOptions.provideExisting(() => OrigamiCalendarMultiple),
    CalendarRootOptions.provideFactory(() => {
      const options = inject(OrigamiCalendarMultipleOptions);
      // `===`, as the toggle compares, not `includes`.
      const selected = (date: string) => options.value().some((entry) => entry === date);

      return {
        month: options.month,
        minDate: options.minDate,
        maxDate: options.maxDate,
        dateDisabled: options.dateDisabled,
        weekStart: options.weekStart,
        locale: options.locale,
        today: options.today,
        fixedWeeks: options.fixedWeeks,
        disabled: options.disabled,
        readonly: options.readonly,
        multiselectable: true,
        selected,
        preferred: (month) => {
          for (const entry of options.value()) {
            const day = canonicalDay(entry);

            if (day !== null && monthOf(day) === month) {
              return day;
            }
          }

          return null;
        },
        shown: () => {
          for (const entry of options.value()) {
            const day = canonicalDay(entry);

            if (day !== null) {
              return day;
            }
          }

          return null;
        },
        choose: (date) => {
          options.value.set(toggled(options.value(), date));
        },
        range: () => null,
        anchor: () => null,
        cancel: () => false,
      };
    }),
    CalendarSeed,
    CalendarContext,
    OrigamiCalendarMultipleState,
  ],
  host: {
    "[attr.data-today]": "seedToday",
    "[attr.data-week-start]": "seedWeekStart()",
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiCalendarMultiple
  implements OrigamiCalendarMultipleOptions, FormValueControl<readonly string[]>
{
  /**
   * Own chosen-days model, default an empty array; `valueChange` emits user toggles written to
   * this model, and `[formField]` binds it. Replaced Options supply the effective value instead
   * and do not fabricate this output.
   */
  readonly value = model<readonly string[]>([]);
  /**
   * Own displayed-month model, default null (follow: the month of the value's first canonical
   * day, else today's); `monthChange` emits navigation and a choice that would move a followed
   * display. Replaced Options supply it instead.
   */
  readonly month = model<string | null>(null);
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
  readonly state = inject(OrigamiCalendarMultipleState);

  readonly #context = inject(CalendarContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /**
   * Emits when focus leaves the root, not while it moves between cells or to Previous/Next, nor
   * when a move into another month replaces the focused cell; `[formField]` marks its field
   * touched.
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
}
