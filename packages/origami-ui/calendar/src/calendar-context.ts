import {
  DOCUMENT,
  DestroyRef,
  Service,
  afterRenderEffect,
  computed,
  inject,
  linkedSignal,
  signal,
  untracked,
} from "@angular/core";
import type { Provider, Signal, WritableSignal } from "@angular/core";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";
import {
  canonicalDay,
  canonicalMonth,
  formatMonth,
  formatYear,
  monthOf,
  parseMonth,
  parseYear,
  yearOf,
} from "./calendar-date";
import type { Weekday } from "./calendar-date";
import {
  cellDisabled,
  displayedPosition,
  inPeriod,
  monthsOf,
  moveTarget,
  pageStart,
  stepTarget,
  tabStop,
  weeksOf,
  yearsOf,
  yearsPerPage,
} from "./calendar-grid-model";
import type { GridConfig, GridLevel, GridMove } from "./calendar-grid-model";
import { CalendarLabels, localeWeekStart } from "./calendar-locale";
import type { WeekdayLabel } from "./calendar-locale";
import { CalendarSeed } from "./calendar-seed";
import { mayTakeFocus } from "./pending-focus";
import type { FocusRequest } from "./pending-focus";

/** A day in the displayed weeks: what `OrigamiCalendarDayRecord` publishes. */
export interface CalendarDayRecord {
  readonly date: string;
  readonly label: string;
  readonly outside: boolean;
}

/** A month or a year in the months and years views: what `OrigamiCalendarPeriodRecord` publishes. */
export interface CalendarPeriodRecord {
  readonly date: string;
  readonly label: string;
}

/** A span of canonical days, `start` on or before `end`. */
export interface CalendarDaySpan {
  readonly start: string;
  readonly end: string;
}

/** What a cell registers from its `ngOnInit`. */
export interface CalendarCellRegistration {
  readonly element: HTMLElement;
  /**
   * The cell's effective canonical date while it is one at the current view's level, else null
   * (an inert cell).
   */
  readonly date: Signal<string | null>;
}

/**
 * Configuration of the Calendar Context, supplied by the root that provides it: the shared
 * configuration every root mode has, and what the mode means by "selected" and "choose", so the
 * single, multiple, range and month roots share the Context and its parts.
 */
export abstract class CalendarRootOptions {
  /** The displayed month, written by navigation; null or a non-canonical value follows below. */
  abstract readonly month: WritableSignal<string | null>;
  /** The level of the value: days for the day roots, months for the month root. */
  abstract readonly valueLevel: "days" | "months";
  /** The `view` Option; a level the root doesn't have counts as `valueLevel`. */
  abstract readonly view: Signal<GridLevel>;
  /** Writes the `view` Option; never called with a level finer than `valueLevel`. */
  abstract setView(view: GridLevel): void;
  /** Columns of the months and years views. */
  abstract readonly columns: Signal<number>;
  /** Earliest day, `YYYY-MM-DD`; the month root converts its earliest month to its first day. */
  abstract readonly minDate: Signal<string | null>;
  /** Latest day, `YYYY-MM-DD`; the month root converts its latest month to its last day. */
  abstract readonly maxDate: Signal<string | null>;
  /** Whether a date at `valueLevel` can't be chosen: `dateDisabled`, or `monthDisabled`. */
  abstract readonly valueDisabled: Signal<(date: string) => boolean>;
  abstract readonly weekStart: Signal<Weekday | null>;
  abstract readonly locale: Signal<string>;
  abstract readonly today: Signal<string>;
  abstract readonly fixedWeeks: Signal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly readonly: Signal<boolean>;
  /** Whether several days can be selected: the Grid's `aria-multiselectable`. */
  abstract readonly multiselectable: boolean;
  /** Whether `date` is selected; tracked. */
  abstract selected(date: string): boolean;
  /** The selection's day the tab stop prefers in `month`, or null; tracked. */
  abstract preferred(month: string): string | null;
  /**
   * The selection's date at `valueLevel` (a day, or the month root's month) whose month is shown
   * while `month` follows (null) and whose month and year coarser views mark selected, or null;
   * tracked. It may be non-canonical, which selects nothing.
   */
  abstract shown(): string | null;
  /** Applies the mode's write rule to a chosen, enabled date at `valueLevel`. */
  abstract choose(date: string): void;
  /** The committed range while the value is one, else null; tracked. Null for the other modes. */
  abstract range(): CalendarDaySpan | null;
  /** The range's pending first day, else null; tracked. Null for the other modes. */
  abstract anchor(): string | null;
  /**
   * Drops a pending first day without writing, on Escape or before a choice once it can't be
   * chosen any more; whether there was one.
   */
  abstract cancel(): boolean;

  /**
   * Provides the root Options beside the Context.
   * @param factory - Runs in the root's injection context the first time the Context reads it.
   * @returns A local provider.
   */
  static provideFactory(factory: () => CalendarRootOptions): Provider {
    return { provide: CalendarRootOptions, useFactory: factory };
  }
}

/**
 * @internal The Calendar's private owner: the effective view and displayed month, the grid
 * model's periods and labels, cell and Heading registrations, the focused and hovered dates,
 * pending focus requests, a pending range's preview, keyboard moves, choices and drill-downs,
 * Escape, Previous/Next steps and the touch notification. It reads the root's Signal Forms binding (`FORM_FIELD` on the root's
 * element) for Field membership.
 */
@Service({ autoProvided: false })
export class CalendarContext {
  readonly #root = injectDeferred(CalendarRootOptions);
  readonly #seed = inject(CalendarSeed);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #document = inject(DOCUMENT);
  readonly #touches = new Subject<void>();
  readonly #cells = signal<readonly CalendarCellRegistration[]>([]);
  readonly #heading = signal<Signal<string> | null>(null);
  /**
   * The date of the cell that last took focus inside the grid, in the current view. Any change of
   * the view clears it, so a view written from outside puts the tab stop on its displayed period;
   * a drill-down or Escape sets its target after changing the view.
   */
  readonly #focused = linkedSignal<GridLevel, string | null>({
    source: () => this.view(),
    computation: () => null,
  });
  /**
   * The date of the cell under the pointer since focus last moved, or null. Any change of the view
   * clears it, since its cell goes with that view's cells.
   */
  readonly #hovered = linkedSignal<GridLevel, string | null>({
    source: () => this.view(),
    computation: () => null,
  });
  /**
   * The pending focus request, for the current view. Any change of the view drops it, so a view
   * written from outside never revives an older view's request; a drill-down or Escape makes its
   * request after changing the view.
   */
  readonly #request = linkedSignal<GridLevel, FocusRequest | null>({
    source: () => this.view(),
    computation: () => null,
  });
  #destroyed = false;

  readonly disabled = computed(() => this.#root().disabled());
  readonly readonly = computed(() => this.#root().readonly());
  /**
   * The effective view: the `view` Option while it is one of the root's levels, else the value's
   * own level.
   */
  readonly view = computed<GridLevel>(() => {
    const root = this.#root();
    const view = root.view();

    if (view === "months" || view === "years" || (view === "days" && root.valueLevel === "days")) {
      return view;
    }

    return root.valueLevel;
  });
  /** Whether the view is the value's own: only there does a cell carry `aria-selected`. */
  readonly valueView = computed(() => this.view() === this.#root().valueLevel);
  /** Whether several days can be selected in the current view: the Grid's `aria-multiselectable`. */
  readonly multiselectable = computed(() => this.#root().multiselectable && this.view() === "days");
  readonly locale = computed(() => this.#root().locale());
  /** Effective today, or null while the `today` Option isn't a canonical day. */
  readonly today = computed(() => canonicalDay(this.#root().today()));
  readonly min = computed(() => canonicalDay(this.#root().minDate()));
  readonly max = computed(() => canonicalDay(this.#root().maxDate()));
  /** The seed's today, written to the root host as `data-today`. */
  readonly seedToday = this.#seed.today;
  /**
   * The locale's week start, written to the root host as `data-week-start`: the seed's for the
   * locale the root starts with, while hydrating; computed again when the locale changes.
   */
  readonly localeWeekStart = linkedSignal<string, Weekday>({
    source: this.locale,
    computation: (locale, previous) => {
      if (previous === undefined && this.#seed.weekStart !== null) {
        return this.#seed.weekStart;
      }

      return localeWeekStart(locale);
    },
  });
  readonly weekStart = computed(() => this.#root().weekStart() ?? this.localeWeekStart());
  /** The month the display follows: the canonical `month` Option, else the selection's, else today's. */
  readonly #followed = computed(() => this.#followedMonth());
  /**
   * The displayed month: the `month` Option while it is a canonical month, else the selection's
   * month, else today's, else the seed's today's; under the day roots held to 0001-02 … 9999-11,
   * whose weeks are whole.
   */
  readonly position = computed(() => {
    if (this.#root().valueLevel === "days") {
      return displayedPosition("days", this.#followed());
    }

    return this.#followed();
  });
  /** The displayed year: the months view's period. */
  readonly #year = computed(() => yearOf(this.position()));
  /** A year of the displayed page, the years view's period: the displayed year's, held to 0012 … 9995. */
  readonly #page = computed(() => displayedPosition("years", this.#year()));
  /** Columns of the months and years views: the `columns` Option while it is 1 to 12, else 3. */
  readonly #columns = computed(() => {
    const columns = this.#root().columns();

    if (Number.isInteger(columns) && columns >= 1 && columns <= 12) {
      return columns;
    }

    return 3;
  });
  readonly #config = computed<GridConfig>(() => ({
    weekStart: this.weekStart(),
    columns: this.#columns(),
    min: this.min(),
    max: this.max(),
  }));
  readonly #labels = computed(() => new CalendarLabels(this.locale()));
  /** The displayed period in the locale, by view: "October 2026", "2026" or "2016 – 2027". */
  readonly heading = computed(() => {
    const labels = this.#labels();
    const view = this.view();

    if (view === "days") {
      return labels.month(this.position());
    }

    if (view === "months") {
      return labels.year(this.#year());
    }

    const first = pageStart(parseYear(this.#page())!);

    return labels.years(formatYear(first), formatYear(first + yearsPerPage - 1));
  });
  readonly weekdays = computed<readonly WeekdayLabel[]>(() =>
    this.#labels().weekdays(this.weekStart()),
  );
  readonly weeks = computed<readonly (readonly CalendarDayRecord[])[]>(() => {
    const labels = this.#labels();
    const position = this.position();
    const weeks: CalendarDayRecord[][] = [];

    for (const week of weeksOf(position, this.weekStart(), this.#root().fixedWeeks())) {
      const records: CalendarDayRecord[] = [];

      for (const date of week) {
        records.push({ date, label: labels.day(date), outside: monthOf(date) !== position });
      }

      weeks.push(records);
    }

    return weeks;
  });
  /** The months of the displayed year, in rows of `columns`. */
  readonly months = computed<readonly (readonly CalendarPeriodRecord[])[]>(() => {
    const labels = this.#labels();
    const rows: CalendarPeriodRecord[][] = [];

    for (const row of monthsOf(this.#year(), this.#columns())) {
      const records: CalendarPeriodRecord[] = [];

      for (const date of row) {
        records.push({ date, label: labels.monthShort(date) });
      }

      rows.push(records);
    }

    return rows;
  });
  /** The displayed page of twelve years, in rows of `columns`. */
  readonly years = computed<readonly (readonly CalendarPeriodRecord[])[]>(() => {
    const labels = this.#labels();
    const rows: CalendarPeriodRecord[][] = [];

    for (const row of yearsOf(this.#page(), this.#columns())) {
      const records: CalendarPeriodRecord[] = [];

      for (const date of row) {
        records.push({ date, label: labels.year(date) });
      }

      rows.push(records);
    }

    return rows;
  });
  /** The committed range, or null. */
  readonly #range = computed(() => this.#root().range());
  /**
   * While a range's first day is pending, the days the next choice would span: from it to the
   * hovered day, else the focused day, else itself. Null otherwise.
   */
  readonly #preview = computed<CalendarDaySpan | null>(() => {
    const anchor = this.#root().anchor();

    if (anchor === null) {
      return null;
    }

    // A month or year cell focused in a coarser view is no preview target.
    const target = this.#hovered() ?? canonicalDay(this.#focused()) ?? anchor;

    if (target < anchor) {
      return { start: target, end: anchor };
    }

    return { start: anchor, end: target };
  });
  /** The registered Heading's effective ID, or null before it registers. */
  readonly headingId = computed(() => this.#heading()?.() ?? null);
  /**
   * The date of the cell holding the grid's tab stop in the current view; null while the root is
   * disabled. Days: the focused day while a mounted cell has it, else the selection's preferred
   * day, else today, else the first enabled day. Months and years: the focused period, else the
   * displayed month or year, else the first enabled cell.
   */
  readonly tabStop = computed(() => {
    if (this.disabled()) {
      return null;
    }

    const view = this.view();
    let focused = this.#focused();

    if (focused !== null && this.#cellOf(focused) === null) {
      focused = null;
    }

    if (view === "days") {
      const position = this.position();

      return tabStop(
        "days",
        { focused, selected: this.#root().preferred(position), today: this.today(), position },
        this.#config(),
        this.#disabledAt("days"),
      );
    }

    let displayed = this.position();

    if (view === "years") {
      displayed = this.#year();
    }

    return tabStop(
      view,
      { focused, selected: displayed, today: null, position: this.#period() },
      this.#config(),
      this.#disabledAt(view),
    );
  });
  /** Emits synchronously when focus leaves the root's element; the root reports it as `touch`. */
  readonly touches = this.#touches.asObservable();

  constructor() {
    // A request is dropped for good once focus moves to another element, in or outside the root,
    // even if it comes back later. Focus falling to nothing, as when the focused cell leaves with
    // its month, fires no `focusin`, so a keyboard move into another month still lands.
    const focusMoved = (event: FocusEvent): void => {
      const request = untracked(this.#request);

      if (request !== null && event.target !== request.origin) {
        this.#request.set(null);
      }
    };

    this.#document.addEventListener("focusin", focusMoved, true);
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#document.removeEventListener("focusin", focusMoved, true);
      this.#touches.complete();
    });

    // Browser-only: render effects never run on the server. A request waits until a mounted
    // cell has its date: after a move into another month, the new month's cells register in
    // `ngOnInit` during the render that shows them, and the old ones are gone by now.
    afterRenderEffect(() => {
      const request = this.#request();

      if (request === null) {
        return;
      }

      const cell = this.#cellOf(request.date);

      if (cell === null) {
        return;
      }

      untracked(() => {
        this.#request.set(null);

        const active = this.#document.activeElement;

        if (mayTakeFocus(request, active, this.#document.body)) {
          cell.element.focus(request.options);
        }
      });
    });
  }

  /** The Signal Forms state bound on the root's element, or null without `[formField]`. */
  formState(): FieldState<unknown> | null {
    return this.#binding?.state() ?? null;
  }

  /**
   * Whether `date`, a cell of the current view, is today, or today's month or year; tracked.
   */
  isToday(date: string): boolean {
    return date === this.#at(this.view(), this.today());
  }

  /** Whether `date`, a day of the days view, is outside the displayed month; tracked. */
  isOutside(date: string): boolean {
    return this.view() === "days" && monthOf(date) !== this.position();
  }

  /**
   * Whether `date`, a cell of the current view, can't be chosen: wholly outside the bounds, or,
   * at the value's own level, `dateDisabled` or `monthDisabled`; tracked.
   */
  isCellDisabled(date: string): boolean {
    const view = this.view();

    return cellDisabled(view, date, this.#config(), this.#disabledAt(view));
  }

  /**
   * Whether `date`, a cell of the current view, is selected: in the value's own view, by the
   * root's rule; in a coarser one, when it holds the selection's shown date; tracked.
   */
  isSelected(date: string): boolean {
    const view = this.view();

    if (view === this.#root().valueLevel) {
      return this.#root().selected(date);
    }

    return date === this.#at(view, this.#shown());
  }

  /** Whether `date`, a month or year cell, is the displayed month or year; tracked. */
  isCurrent(date: string): boolean {
    const view = this.view();

    if (view === "months") {
      return date === this.position();
    }

    if (view === "years") {
      return date === this.#year();
    }

    return false;
  }

  /** Whether `date` starts the committed range, in the days view; tracked. */
  isRangeStart(date: string): boolean {
    return this.view() === "days" && this.#range()?.start === date;
  }

  /** Whether `date` ends the committed range, in the days view; tracked. */
  isRangeEnd(date: string): boolean {
    return this.view() === "days" && this.#range()?.end === date;
  }

  /** Whether `date` lies in the committed range, its ends included, in the days view; tracked. */
  isInRange(date: string): boolean {
    const range = this.#range();

    return this.view() === "days" && range !== null && range.start <= date && date <= range.end;
  }

  /** Whether `date` lies in the pending range's preview, its ends included, in the days view; tracked. */
  isPreviewed(date: string): boolean {
    const preview = this.#preview();

    return (
      this.view() === "days" && preview !== null && preview.start <= date && date <= preview.end
    );
  }

  /**
   * A cell's accessible name, by view: the full date, the month and year, or the year; tracked.
   */
  label(date: string): string {
    const labels = this.#labels();
    const view = this.view();

    if (view === "days") {
      return labels.date(date);
    }

    if (view === "months") {
      return labels.month(date);
    }

    return labels.year(date);
  }

  /**
   * Whether Previous (-1) or Next (+1) can step a month, a year or a page of years, by view:
   * not wholly outside the bounds nor past the periods the view can display.
   */
  canStep(direction: -1 | 1): boolean {
    return this.#stepped(direction) !== null;
  }

  /** Registers a cell from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerCell(cell: CalendarCellRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#cells.update((cells) => [...cells, cell]);
    destroyRef.onDestroy(() => {
      const remaining: CalendarCellRegistration[] = [];

      for (const mounted of this.#cells()) {
        if (mounted !== cell) {
          remaining.push(mounted);
        }
      }

      this.#cells.set(remaining);
    });
  }

  /**
   * Registers the Heading's effective ID from its `ngOnInit`; `destroyRef` removes it. A second
   * mounted Heading fails.
   */
  registerHeading(id: Signal<string>, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (this.#heading() !== null) {
      throw new Error("Calendar supports only one mounted Heading.");
    }

    this.#heading.set(id);
    destroyRef.onDestroy(() => {
      if (this.#heading() === id) {
        this.#heading.set(null);
      }
    });
  }

  /** A cell took focus: it, not the pointer's last cell, is now what a pending range previews to. */
  focused(date: string): void {
    this.#focused.set(date);
    this.#hovered.set(null);
  }

  /** The pointer entered the cell of `date`; only days preview. */
  pointerEntered(date: string): void {
    if (untracked(this.view) === "days") {
      this.#hovered.set(date);
    }
  }

  /** The pointer left the cell of `date`. */
  pointerLeft(date: string): void {
    if (untracked(this.#hovered) === date) {
      this.#hovered.set(null);
    }
  }

  /**
   * Focuses the tab-stop cell, at once if it is mounted, else once it registers. Does nothing
   * while the root is disabled.
   */
  focus(options?: FocusOptions): void {
    const date = this.tabStop();

    if (this.#destroyed || date === null) {
      return;
    }

    this.#focusDate(date, options);
  }

  /** A cell's keys. Handled keys prevent their default, such as Space scrolling the page. */
  keydown(date: string, element: HTMLElement, event: KeyboardEvent): void {
    if (
      this.#destroyed ||
      this.disabled() ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    const key = event.key;

    if (key === "Enter" || key === " ") {
      if (event.shiftKey) {
        return;
      }

      event.preventDefault();
      this.choose(date);

      return;
    }

    const move = this.#moveOf(key, event.shiftKey, element);
    const view = this.view();

    // Shift+PageUp/PageDown step a year in the days view alone.
    if (move === null || (view !== "days" && (move === "superPrevious" || move === "superNext"))) {
      return;
    }

    event.preventDefault();

    const target = moveTarget(view, date, move, this.#config());

    if (target !== date) {
      this.#navigate(target);
    }
  }

  /**
   * A keydown anywhere in a root's element, its cells and Previous/Next included. Escape drops a
   * range's pending first day; else, in a view coarser than the value's, it shows the value's own
   * view without changing `month`, and focus follows to that view's tab stop when it was on a
   * cell. Either prevents its default; otherwise Escape is left alone, so an enclosing layer takes
   * it. Keys with Alt, Ctrl or Meta, keys already `defaultPrevented` and keys during IME
   * composition are ignored, and so is Escape while the root is disabled, beyond dropping an
   * anchor.
   */
  escape(event: KeyboardEvent): void {
    if (
      this.#destroyed ||
      event.key !== "Escape" ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    if (this.#root().cancel()) {
      event.preventDefault();

      return;
    }

    const level = this.#root().valueLevel;

    if (this.disabled() || this.view() === level) {
      return;
    }

    event.preventDefault();

    const target = event.target;
    let fromCell = false;

    for (const cell of this.#cells()) {
      if (target instanceof Node && cell.element.contains(target)) {
        fromCell = true;
      }
    }

    this.#root().setView(level);

    if (fromCell) {
      this.#focusTabStop();
    }
  }

  /**
   * A user's choice of a mounted cell of the current view, by click, Enter or Space, unless the
   * root is disabled or the cell can't be chosen. In a view coarser than the value's, it drills
   * down, readonly too: a year shows its months and a month its days, and focus follows. At the
   * value's own level the root's mode writes it, unless the root is readonly. Choosing a day
   * outside the displayed month also shows its month, and focus follows to its cell. Choosing a
   * cell inside the displayed period keeps the display there: when `month` follows the selection
   * and the choice would move it, the displayed month is written to `month`, so the chosen cell
   * keeps focus.
   */
  choose(date: string): void {
    if (this.#destroyed || this.disabled() || this.isCellDisabled(date)) {
      return;
    }

    const view = this.view();

    if (view !== this.#root().valueLevel) {
      this.#drillDown(view, date);

      return;
    }

    if (this.readonly()) {
      return;
    }

    // Read first: while `month` follows the value, the choice itself can change the display.
    const outside = this.isOutside(date);
    const position = this.position();
    const period = this.#period();
    const following = canonicalMonth(this.#root().month()) === null;
    const anchor = this.#root().anchor();

    // A pending first day the bounds or `dateDisabled` have disabled since can't end a range:
    // this choice starts a new one instead.
    if (anchor !== null && this.isCellDisabled(anchor)) {
      this.#root().cancel();
    }

    this.#root().choose(date);

    if (outside) {
      this.#show(date);

      return;
    }

    if (following && this.#period() !== period) {
      this.#root().month.set(position);
    }
  }

  /**
   * Previous (-1) or Next (+1): shows the neighbouring month, year or page of years, by view;
   * focus stays where it is, so a pending focus request is dropped.
   */
  step(direction: -1 | 1): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    const target = this.#stepped(direction);

    if (target !== null) {
      this.#request.set(null);
      this.#root().month.set(target);
    }
  }

  /**
   * The root element's `focusout`: a touch when focus leaves `root`, not when it moves inside it.
   * Losing focus to nothing while a focus request is pending is the focused cell leaving with its
   * month, not the user leaving. A pending range's first day is kept.
   */
  focusOut(event: FocusEvent, root: HTMLElement): void {
    const next = event.relatedTarget;

    if (next instanceof Node && root.contains(next)) {
      return;
    }

    if (!(next instanceof Element) && this.#request() !== null) {
      return;
    }

    this.#touches.next();
  }

  /**
   * Focus moves to `target`, a cell of the current view, showing its month, year or page first
   * when it is outside the displayed one.
   */
  #navigate(target: string): void {
    if (!inPeriod(this.view(), target, this.#period())) {
      this.#show(target);

      return;
    }

    this.#focused.set(target);
    this.#focusDate(target, undefined);
  }

  /**
   * Focus moves to `target`, a cell of the current view, while the display changes to its month,
   * year or page, or the nearest month that can be shown: the month is written to `month` unless
   * the display already shows it, such as by following the selection there. A year keeps the
   * displayed month's number. Focus waits for the cell the new period renders: a cell showing
   * `target` now, as an outside day, may go with the old month.
   */
  #show(target: string): void {
    const view = this.view();
    let month = target;

    if (view === "days") {
      month = displayedPosition("days", monthOf(target));
    } else if (view === "years") {
      month = this.#inYear(parseYear(target)!);
    }

    this.#focused.set(target);

    if (month !== this.position()) {
      this.#root().month.set(month);
    }

    this.#request.set({ date: target, origin: this.#document.activeElement, options: undefined });
  }

  /**
   * Choosing `date` in `view`, coarser than the value's: a year shows its months with the
   * displayed month's number, a month its days. `month` is written unless the display already
   * follows there; focus follows to the new view's tab stop.
   */
  #drillDown(view: GridLevel, date: string): void {
    let month = date;
    let next: GridLevel = "days";

    if (view === "years") {
      month = this.#inYear(parseYear(date)!);
      next = "months";
    }

    if (month !== this.#followed()) {
      this.#root().month.set(month);
    }

    this.#root().setView(next);
    this.#focusTabStop();
  }

  /**
   * After the view changed: focus moves to the new view's tab stop, at once if its cell is
   * mounted, else once it registers, as the old view's cells go.
   */
  #focusTabStop(): void {
    const target = this.tabStop();

    if (target === null) {
      return;
    }

    this.#focused.set(target);
    this.#focusDate(target, undefined);
  }

  /**
   * The month Previous (-1) or Next (+1) writes in the current view: the neighbouring month; the
   * same month of the neighbouring year; or the same month of the year twelve years away, on the
   * neighbouring page. Null when that period lies wholly outside the bounds or can't be shown.
   */
  #stepped(direction: -1 | 1): string | null {
    const view = this.view();
    const config = this.#config();

    if (view === "days") {
      return stepTarget("days", this.position(), direction, config);
    }

    if (view === "months") {
      const year = stepTarget("months", this.#year(), direction, config);

      if (year === null) {
        return null;
      }

      return this.#inYear(parseYear(year)!);
    }

    const first = stepTarget("years", this.#page(), direction, config);

    if (first === null) {
      return null;
    }

    const year = parseYear(this.#year())!;

    return this.#inYear(parseYear(first)! + year - pageStart(year));
  }

  /** The displayed month's number in `year`. */
  #inYear(year: number): string {
    return formatMonth(year, parseMonth(this.position())!.month);
  }

  /** The displayed period of the current view: the month (days), its year (months) or a year of the page (years). */
  #period(): string {
    const view = this.view();

    if (view === "days") {
      return this.position();
    }

    if (view === "months") {
      return this.#year();
    }

    return this.#page();
  }

  /** The selection's shown date while it is canonical at the value's level, else null. */
  #shown(): string | null {
    const shown = this.#root().shown();

    if (this.#root().valueLevel === "days") {
      return canonicalDay(shown);
    }

    return canonicalMonth(shown);
  }

  /** `date`, a canonical day or month, at `level`: itself, its month or its year; null stays null. */
  #at(level: GridLevel, date: string | null): string | null {
    if (date === null || level === "days") {
      return date;
    }

    if (level === "months") {
      return monthOf(date);
    }

    return yearOf(date);
  }

  /** The `month` Option while it is a canonical month, else the selection's, else today's. */
  #followedMonth(): string {
    const month = canonicalMonth(this.#root().month());

    if (month !== null) {
      return month;
    }

    const shown = this.#shown();

    if (shown !== null) {
      return monthOf(shown);
    }

    return monthOf(this.today() ?? this.#seed.today);
  }

  #focusDate(date: string, options: FocusOptions | undefined): void {
    const cell = this.#cellOf(date);

    if (cell !== null) {
      this.#request.set(null);
      cell.element.focus(options);

      return;
    }

    this.#request.set({ date, origin: this.#document.activeElement, options });
  }

  #cellOf(date: string): CalendarCellRegistration | null {
    for (const cell of this.#cells()) {
      if (cell.date() === date) {
        return cell;
      }
    }

    return null;
  }

  /** The value level's disabled predicate at `level`, else none. */
  #disabledAt(level: GridLevel): ((date: string) => boolean) | null {
    if (level === this.#root().valueLevel) {
      return this.#root().valueDisabled();
    }

    return null;
  }

  /** The grid move of a key, reading the cell's text direction at key time; null for others. */
  #moveOf(key: string, shift: boolean, element: HTMLElement): GridMove | null {
    if (key === "PageUp" || key === "PageDown") {
      if (shift) {
        if (key === "PageUp") {
          return "superPrevious";
        }

        return "superNext";
      }

      if (key === "PageUp") {
        return "pagePrevious";
      }

      return "pageNext";
    }

    if (shift) {
      return null;
    }

    switch (key) {
      case "ArrowUp":
        return "up";
      case "ArrowDown":
        return "down";
      case "Home":
        return "rowStart";
      case "End":
        return "rowEnd";
    }

    if (key !== "ArrowLeft" && key !== "ArrowRight") {
      return null;
    }

    const rtl = getComputedStyle(element).direction === "rtl";

    if ((key === "ArrowRight") !== rtl) {
      return "next";
    }

    return "previous";
  }
}
