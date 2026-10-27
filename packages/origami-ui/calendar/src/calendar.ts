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
import { ɵrequestSingleSelection } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { canonicalDay, monthOf } from "./calendar-date";
import { CalendarContext, CalendarRootOptions } from "./calendar-context";
import { CalendarSeed } from "./calendar-seed";

/**
 * Effective `ogCalendar` configuration, replaced as a whole rather than merged with unused
 * defaults. Dates are canonical ISO strings: days `YYYY-MM-DD` and months `YYYY-MM`, Gregorian,
 * years 0001–9999; they carry no time zone, and with four-digit years they compare
 * chronologically with `<`.
 */
export abstract class OrigamiCalendarOptions {
  /**
   * Writable chosen day, `YYYY-MM-DD`; the direct directive model defaults to null. Only a
   * user's choice of an enabled day writes it, and not while the root is disabled or readonly;
   * choosing the chosen day keeps it. A value that isn't a canonical day ("2026-02-31",
   * "27/10/2026") selects nothing and is kept. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<string | null>;
  /**
   * Writable displayed month, `YYYY-MM`, or null (the direct directive model's default) to follow
   * the value: the Calendar then shows the value's month, else today's, and a value write moves
   * the display. A canonical month shows that month; any other string is treated as null.
   * Keyboard moves into another month and Previous/Next write it; choosing a day outside the
   * displayed month writes it unless the display already follows the chosen value there. The
   * Calendar shows 0001-02 through 9999-11, whose weeks are whole: a month before or after them
   * shows the nearest. `state.month()` is always the month actually shown.
   */
  abstract readonly month: WritableSignal<string | null>;
  /**
   * Earliest day that can be chosen or reached by keys, `YYYY-MM-DD`, or null for none (the
   * default). A non-canonical value is no bound. Days before it are disabled, moves stop at it
   * and Previous is disabled when the month before lies wholly before it. Not named `min`:
   * Signal Forms reserves `min` and `max` on every `[formField]` control for its own number and
   * `Date` metadata.
   */
  abstract readonly minDate: Signal<string | null>;
  /** Latest day that can be chosen or reached by keys, as `minDate`; default null. */
  abstract readonly maxDate: Signal<string | null>;
  /**
   * Whether a day can't be chosen, called with each displayed `YYYY-MM-DD` day while rendering;
   * the default disables none. A disabled day still takes focus, with `aria-disabled="true"`,
   * so the seven-column grid keeps its geometry; it only stops choosing. Validation stays in the
   * form schema.
   */
  abstract readonly dateDisabled: Signal<(date: string) => boolean>;
  /**
   * The week's first day, an ISO weekday from 1 (Monday) to 7 (Sunday), or null (the default)
   * for the locale's: `Intl.Locale#getWeekInfo()` where the engine has it, else Monday.
   */
  abstract readonly weekStart: Signal<1 | 2 | 3 | 4 | 5 | 6 | 7 | null>;
  /**
   * BCP 47 locale of every label (`Intl.DateTimeFormat`, Gregorian calendar) and of the default
   * week start; the direct directive defaults to Angular's `LOCALE_ID`.
   */
  abstract readonly locale: Signal<string>;
  /**
   * Today, `YYYY-MM-DD`: the day marked `aria-current="date"` and shown while neither `month`
   * nor the value is set. The direct directive defaults to the seed: the platform's clock in its
   * own time zone, the server's when the root hydrates (`data-today`). Pass the user's today to
   * pin their time zone. A non-canonical value marks no day. Not refreshed at midnight.
   */
  abstract readonly today: Signal<string>;
  /** Always six weeks, so the grid's height never changes between months; default false. */
  abstract readonly fixedWeeks: Signal<boolean>;
  /**
   * Blocks choosing, focus and the pointer: no cell takes focus and Previous/Next are natively
   * disabled; default false. `[formField]` writes it from the field's `disabled()` rules.
   * External writes remain authoritative.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * Browses without choosing: keys move focus and change months, but nothing writes the value;
   * default false. `[formField]` writes it from the field's `readonly()` rules.
   */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces Calendar Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiCalendarOptions> | AbstractType<OrigamiCalendarOptions>,
  ): Provider {
    return { provide: OrigamiCalendarOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Calendar Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every property.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiCalendarOptions): Provider {
    return { provide: OrigamiCalendarOptions, useFactory: factory };
  }
}

/** One day of `OrigamiCalendarState.weeks()`: what a cell renders. */
export interface OrigamiCalendarDayRecord {
  /** The day, `YYYY-MM-DD`: bind it to the cell's `date` and track the `@for` by it. */
  readonly date: string;
  /** The localized day number, such as "7". */
  readonly label: string;
  /** Whether the day belongs to the previous or next month, completing a week. */
  readonly outside: boolean;
}

/** Locally provided readonly facade for the nearest `ogCalendar`; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiCalendarState {
  readonly #options = injectDeferred(OrigamiCalendarOptions);
  readonly #context = inject(CalendarContext);

  /** Effective value, including null and non-canonical values. No writable alias is exposed. */
  readonly value: Signal<string | null> = computed(() => this.#options().value());
  /**
   * The displayed month, `YYYY-MM`: the `month` Option while it is canonical, else the value's
   * month, else today's; held to 0001-02 through 9999-11.
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
 * Calendar root for one day: an inline month grid, the APG date-picker grid without a dialog.
 * The consumer renders the markup from `state`: an `ogCalendarGrid` table whose `ogCalendarCell`
 * cells come from `state.weeks()`, an `ogCalendarHeading` with `state.heading()`, and
 * `ogCalendarPrevious`/`ogCalendarNext` buttons. Origami computes the dates, labels, keys,
 * focus and ARIA; it generates no markup.
 *
 * The value is a `YYYY-MM-DD` string or null, never a `Date`, so no time zone can shift it.
 * Clicking a day, Enter or Space chooses it; arrows, Home/End and PageUp/PageDown (with Shift,
 * a year) move focus in date arithmetic, crossing months as they go (APG keys; Left and Right
 * swap in right-to-left text). The grid has one tab stop: the focused day, else the chosen day
 * in the displayed month, else today, else the month's first enabled day. Disabled days take
 * focus but can't be chosen; `minDate` and `maxDate` stop moves.
 *
 * Server rendering and hydration: the root writes its seed to its host, `data-today` (the
 * default today) and `data-week-start` (the locale's week start). A hydrating root reads them
 * from its server element and keeps them, so the server's month, today and rows survive
 * hydration whatever the browser's time zone or `Intl` week data; a root the browser creates
 * computes both itself. There is no midnight refresh.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model, writes its
 * `disabled` and `readonly` inputs and listens to `touch`, which it emits when focus leaves the
 * root; `focusBoundControl()` calls `focus()`, which focuses the tab-stop cell. Its Grid is the
 * control of its nearest `ogField`.
 *
 * @example
 * ```html
 * <div ogCalendar [(value)]="day" #cal="ogCalendar">
 *   <button ogCalendarPrevious aria-label="Previous month">‹</button>
 *   <h2 ogCalendarHeading>{{ cal.state.heading() }}</h2>
 *   <button ogCalendarNext aria-label="Next month">›</button>
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
  selector: "[ogCalendar]",
  exportAs: "ogCalendar",
  providers: [
    OrigamiCalendarOptions.provideExisting(() => OrigamiCalendar),
    CalendarRootOptions.provideFactory(() => {
      const options = inject(OrigamiCalendarOptions);

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
        multiselectable: false,
        selected: (date) => options.value() === date,
        preferred: (month) => {
          const value = canonicalDay(options.value());

          if (value !== null && monthOf(value) === month) {
            return value;
          }

          return null;
        },
        shown: () => options.value(),
        choose: (date) => {
          ɵrequestSingleSelection(options.value, date, true, false);
        },
      };
    }),
    CalendarSeed,
    CalendarContext,
    OrigamiCalendarState,
  ],
  host: {
    "[attr.data-today]": "seedToday",
    "[attr.data-week-start]": "seedWeekStart()",
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiCalendar implements OrigamiCalendarOptions, FormValueControl<string | null> {
  /**
   * Own chosen-day model, default null; `valueChange` emits user choices written to this model,
   * and `[formField]` binds it. Replaced Options supply the effective value instead and do not
   * fabricate this output.
   */
  readonly value = model<string | null>(null);
  /**
   * Own displayed-month model, default null (follow: the value's month, else today's);
   * `monthChange` emits navigation. Replaced Options supply the effective month instead.
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
  readonly state = inject(OrigamiCalendarState);

  readonly #context = inject(CalendarContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /**
   * Emits when focus leaves the root, not while it moves between cells or to Previous/Next, nor
   * when a move into another month replaces the focused cell; `[formField]` marks its field
   * touched. On engines where a click doesn't focus a button (macOS Safari), clicking
   * Previous/Next from a cell moves focus to nothing first, so it emits.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /** @internal The seed's today, `data-today`. */
  protected readonly seedToday = this.#context.seedToday;
  /** @internal The locale's week start, `data-week-start`. */
  protected readonly seedWeekStart = this.#context.localeWeekStart;

  /**
   * Focuses the cell holding the grid's tab stop, at once if it is mounted, else as soon as it
   * registers, unless focus has moved to another element since, even if it came back (Previous
   * and Next included; focus falling to nothing doesn't count), or Previous or Next has stepped
   * by then. Does nothing while disabled. Signal Forms'
   * `focusBoundControl()` calls it.
   * @param options - Passed to the cell's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }

  /** @internal Touch notification for Signal Forms, only when focus leaves the root's element. */
  protected focusLeft(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (next instanceof Node && this.#element.contains(next)) {
      return;
    }

    if (next instanceof Element) {
      this.#context.left(next);

      return;
    }

    this.#context.left(null);
  }
}
