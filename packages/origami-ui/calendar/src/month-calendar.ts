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
  numberAttribute,
  signal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { ɵrequestSingleSelection } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import type { OrigamiCalendarPeriodRecord } from "./calendar";
import { canonicalMonth, firstDayOf, lastDayOf } from "./calendar-date";
import type { Weekday } from "./calendar-date";
import { CalendarContext, CalendarRootOptions } from "./calendar-context";
import { CalendarSeed } from "./calendar-seed";

/**
 * Effective `ogMonthCalendar` configuration, replaced as a whole rather than merged with unused
 * defaults. Months are canonical `YYYY-MM` strings and years `YYYY`, Gregorian, 0001–9999; they
 * carry no time zone and compare chronologically with `<`.
 */
export abstract class OrigamiMonthCalendarOptions {
  /**
   * Writable chosen month, `YYYY-MM`; the direct directive model defaults to null. Only a user's
   * choice of an enabled month in the months view writes it, and not while the root is disabled
   * or readonly; choosing the chosen month keeps it. A value that isn't a canonical month
   * ("2026-13", "10/2026") selects nothing and is kept. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<string | null>;
  /**
   * Writable displayed position, `YYYY-MM`, or null (the direct directive model's default) to
   * follow the value: the months view then shows the value's year, else today's, and a value
   * write moves the display. The months view shows this month's year, and the years view the page
   * of twelve holding it (0012–0023 through 9984–9995). Keyboard moves into another year or page,
   * Previous/Next and choosing a year write it; any non-canonical string is treated as null.
   * `state.month()` is always the position actually shown.
   */
  abstract readonly month: WritableSignal<string | null>;
  /**
   * Writable view: `"months"` (the direct directive model's default) or `"years"`. Choosing a
   * year writes `"months"`, and focus follows to the months view's tab stop; Escape in the years
   * view writes `"months"` without changing `month`. Write it yourself, as from a heading button,
   * to switch views: focus stays where it is and the grid's tab stop moves to the displayed
   * period. Any other value counts as `"months"`.
   */
  abstract readonly view: WritableSignal<"months" | "years">;
  /**
   * Earliest month that can be chosen or reached by keys, `YYYY-MM`, or null for none (the
   * default). A non-canonical value is no bound. Months before it are disabled, and so are years
   * wholly before it; moves stop at it, and Previous is disabled when the year or page before lies
   * wholly before it. Not named `min`: Signal Forms reserves `min` and `max` on every `[formField]`
   * control.
   */
  abstract readonly minMonth: Signal<string | null>;
  /** Latest month that can be chosen or reached by keys, as `minMonth`; default null. */
  abstract readonly maxMonth: Signal<string | null>;
  /**
   * Whether a month can't be chosen, called with each displayed `YYYY-MM` month while rendering;
   * the default disables none. A disabled month still takes focus, with `aria-disabled="true"`.
   * It doesn't disable years. Validation stays in the form schema.
   */
  abstract readonly monthDisabled: Signal<(month: string) => boolean>;
  /**
   * BCP 47 locale of every label (`Intl.DateTimeFormat`, Gregorian calendar); the direct directive
   * defaults to Angular's `LOCALE_ID`.
   */
  abstract readonly locale: Signal<string>;
  /**
   * Today, `YYYY-MM-DD`: its month and year are marked `aria-current="date"`, and its month is
   * shown while neither `month` nor the value is set. The direct directive defaults to the seed,
   * the server's when the root hydrates (`data-today`), as `OrigamiCalendarOptions.today`.
   */
  abstract readonly today: Signal<string>;
  /**
   * Columns of the months and years views, a whole number from 1 to 12; default 3. Any other
   * value counts as 3.
   */
  abstract readonly columns: Signal<number>;
  /**
   * Blocks choosing, focus and the pointer: no cell takes focus and Previous/Next are natively
   * disabled; default false. `[formField]` writes it from the field's `disabled()` rules.
   * External writes remain authoritative.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * Browses without choosing: keys move focus, years drill down and Previous/Next step, but
   * nothing writes the value; default false. `[formField]` writes it from the field's
   * `readonly()` rules.
   */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces month Calendar Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMonthCalendarOptions> | AbstractType<OrigamiMonthCalendarOptions>,
  ): Provider {
    return { provide: OrigamiMonthCalendarOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all month Calendar Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every property.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiMonthCalendarOptions): Provider {
    return { provide: OrigamiMonthCalendarOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest `ogMonthCalendar`; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiMonthCalendarState {
  readonly #options = injectDeferred(OrigamiMonthCalendarOptions);
  readonly #context = inject(CalendarContext);

  /** Effective value, including null and non-canonical values. No writable alias is exposed. */
  readonly value: Signal<string | null> = computed(() => this.#options().value());
  /**
   * The displayed position, `YYYY-MM`: the `month` Option while it is canonical, else the
   * value, else today's month. The months view shows its year.
   */
  readonly month: Signal<string> = this.#context.position;
  /** The effective view: `"months"` or `"years"`. */
  readonly view: Signal<"months" | "years"> = computed(() => {
    if (this.#context.view() === "years") {
      return "years";
    }

    return "months";
  });
  /**
   * The displayed period in the locale, by view: the year ("2026") or the page of years ("2016 –
   * 2027"); render it in the Heading.
   */
  readonly heading: Signal<string> = this.#context.heading;
  /**
   * The twelve months of the displayed year, in rows of `columns`, for the months view. Computed
   * whatever the view, without any cell mounted, on the server too.
   */
  readonly months: Signal<readonly (readonly OrigamiCalendarPeriodRecord[])[]> =
    this.#context.months;
  /**
   * The displayed page of twelve years, aligned to a multiple of 12 (2016–2027), in rows of
   * `columns`, for the years view. Computed whatever the view, on the server too.
   */
  readonly years: Signal<readonly (readonly OrigamiCalendarPeriodRecord[])[]> = this.#context.years;
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

function neverDisabled(): boolean {
  return false;
}

/**
 * Calendar root for one month: an inline grid of the displayed year's months, with a years view
 * for choosing the year first. Its value is a `YYYY-MM` string or null. It renders with the same
 * parts as `ogCalendar`, without the days: an `ogCalendarGrid` table whose `ogCalendarCell` cells
 * come from `state.months()` or `state.years()` by `state.view()`, an `ogCalendarHeading` with
 * `state.heading()`, and `ogCalendarPrevious`/`ogCalendarNext` buttons.
 *
 * Clicking a month, Enter or Space chooses it; choosing a year shows its months, and focus
 * follows. The arrows move a month or year, Up and Down by `columns`, Home and End go to the row's
 * ends and PageUp/PageDown move a year or twelve, crossing into the next year or page; Escape in
 * the years view returns to the months view. The grid has one tab stop: the focused cell, else
 * the displayed month or year. Disabled months and years take focus but can't be chosen:
 * `minMonth` and `maxMonth` disable the months outside them and the years wholly outside them,
 * and stop moves; `monthDisabled` disables months alone. Previous and Next step a year or twelve.
 *
 * Server rendering and hydration: the root writes its seed's today to its host, `data-today`,
 * and a hydrating root keeps the server's, as `ogCalendar` does.
 *
 * It is an Angular Signal Forms value control for a `string | null` field: `[formField]` binds its
 * `value` model, writes its `disabled` and `readonly` inputs and listens to `touch`, which it emits
 * when focus leaves the root; `focusBoundControl()` calls `focus()`. Its Grid is the control of
 * its nearest `ogField`.
 *
 * @example
 * ```html
 * <div ogMonthCalendar [(value)]="month" #cal="ogMonthCalendar">
 *   <h2 ogCalendarHeading>{{ cal.state.heading() }}</h2>
 *   <table ogCalendarGrid>
 *     <tbody>
 *       @for (row of cal.state.months(); track $index) {
 *         <tr>
 *           @for (month of row; track month.date) {
 *             <td ogCalendarCell [date]="month.date">{{ month.label }}</td>
 *           }
 *         </tr>
 *       }
 *     </tbody>
 *   </table>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogMonthCalendar]",
  exportAs: "ogMonthCalendar",
  providers: [
    OrigamiMonthCalendarOptions.provideExisting(() => OrigamiMonthCalendar),
    CalendarRootOptions.provideFactory(() => {
      const options = inject(OrigamiMonthCalendarOptions);

      return {
        month: options.month,
        valueLevel: "months",
        view: options.view,
        setView: (view) => {
          if (view !== "days") {
            options.view.set(view);
          }
        },
        columns: options.columns,
        minDate: computed(() => {
          const month = canonicalMonth(options.minMonth());

          if (month === null) {
            return null;
          }

          return firstDayOf(month);
        }),
        maxDate: computed(() => {
          const month = canonicalMonth(options.maxMonth());

          if (month === null) {
            return null;
          }

          return lastDayOf(month);
        }),
        valueDisabled: options.monthDisabled,
        // A month grid has no weeks.
        weekStart: signal<Weekday | null>(1),
        locale: options.locale,
        today: options.today,
        fixedWeeks: signal(false),
        disabled: options.disabled,
        readonly: options.readonly,
        multiselectable: false,
        selected: (month) => options.value() === month,
        preferred: () => null,
        shown: () => options.value(),
        choose: (month) => {
          ɵrequestSingleSelection(options.value, month, true, false);
        },
        range: () => null,
        anchor: () => null,
        cancel: () => false,
      };
    }),
    CalendarSeed,
    CalendarContext,
    OrigamiMonthCalendarState,
  ],
  host: {
    "[attr.data-today]": "seedToday",
    "(focusout)": "focusLeft($event)",
    "(keydown)": "keydown($event)",
  },
})
export class OrigamiMonthCalendar
  implements OrigamiMonthCalendarOptions, FormValueControl<string | null>
{
  /**
   * Own chosen-month model, default null; `valueChange` emits user choices written to this model,
   * and `[formField]` binds it. Replaced Options supply the effective value instead and do not
   * fabricate this output.
   */
  readonly value = model<string | null>(null);
  /**
   * Own displayed-position model, default null (follow: the value, else today's month);
   * `monthChange` emits navigation. Replaced Options supply the effective position instead.
   */
  readonly month = model<string | null>(null);
  /**
   * Own view model, default `"months"`; `viewChange` emits drill-downs and Escape. Replaced
   * Options supply the effective view instead.
   */
  readonly view = model<"months" | "years">("months");
  /** Own earliest-month input, default null; replaced Options supply the effective bound instead. */
  readonly minMonth = input<string | null>(null);
  /** Own latest-month input, default null; replaced Options supply the effective bound instead. */
  readonly maxMonth = input<string | null>(null);
  /** Own disabled-month predicate input, default none disabled; replaced Options supply it instead. */
  readonly monthDisabled = input<(month: string) => boolean>(neverDisabled);
  /** Own locale input, default Angular's `LOCALE_ID`; replaced Options supply it instead. */
  readonly locale = input(inject(LOCALE_ID));
  /**
   * Own today input, `YYYY-MM-DD`, default the seed: the server's today while hydrating
   * (`data-today`), else the platform's clock in its own time zone. Replaced Options supply it
   * instead.
   */
  readonly today = input(inject(CalendarSeed).today);
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
  readonly state = inject(OrigamiMonthCalendarState);

  readonly #context = inject(CalendarContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /**
   * Emits when focus leaves the root, not while it moves between cells or to Previous/Next, nor
   * when a move into another year or a drill-down replaces the focused cell; `[formField]` marks
   * its field touched.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /** @internal The seed's today, `data-today`. */
  protected readonly seedToday = this.#context.seedToday;

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

  /** @internal Escape anywhere in the root, Previous and Next included, returns to the months view. */
  protected keydown(event: KeyboardEvent): void {
    this.#context.escape(event);
  }
}
