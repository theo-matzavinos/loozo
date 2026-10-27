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
import { canonicalDay, canonicalMonth, monthOf } from "./calendar-date";
import type { Weekday } from "./calendar-date";
import {
  cellDisabled,
  displayedPosition,
  moveTarget,
  stepTarget,
  tabStop,
  weeksOf,
} from "./calendar-grid-model";
import type { GridConfig, GridMove } from "./calendar-grid-model";
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

/** A span of canonical days, `start` on or before `end`. */
export interface CalendarDaySpan {
  readonly start: string;
  readonly end: string;
}

/** What a cell registers from its `ngOnInit`. */
export interface CalendarCellRegistration {
  readonly element: HTMLElement;
  /** The cell's effective canonical date, or null while its `date` isn't one. */
  readonly date: Signal<string | null>;
}

/**
 * Configuration of the Calendar Context, supplied by the root that provides it: the shared
 * configuration every root mode has, and what the mode means by "selected" and "choose", so the
 * single, multiple and range roots share the Context and its parts.
 */
export abstract class CalendarRootOptions {
  /** The displayed month, written by navigation; null or a non-canonical value follows below. */
  abstract readonly month: WritableSignal<string | null>;
  abstract readonly minDate: Signal<string | null>;
  abstract readonly maxDate: Signal<string | null>;
  abstract readonly dateDisabled: Signal<(date: string) => boolean>;
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
  /** The selection's day whose month is shown while `month` follows (null), or null; tracked. */
  abstract shown(): string | null;
  /** Applies the mode's write rule to a chosen, enabled day. */
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
 * @internal The Calendar's private owner: the effective displayed month, the grid model's
 * periods and labels, cell and Heading registrations, the focused and hovered dates, pending
 * focus requests, a pending range's preview, keyboard moves, choices, Previous/Next steps and
 * the touch notification. It reads the root's Signal Forms binding (`FORM_FIELD` on the root's
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
  /** The date of the cell that last took focus inside the grid. */
  readonly #focused = signal<string | null>(null);
  /** The date of the cell under the pointer since focus last moved, or null. */
  readonly #hovered = signal<string | null>(null);
  readonly #request = signal<FocusRequest | null>(null);
  #destroyed = false;

  readonly disabled = computed(() => this.#root().disabled());
  readonly readonly = computed(() => this.#root().readonly());
  readonly multiselectable = computed(() => this.#root().multiselectable);
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
  /**
   * The displayed month: the `month` Option while it is a canonical month, else the selection's
   * month, else today's, else the seed's today's; held to 0001-02 … 9999-11, whose weeks are whole.
   */
  readonly position = computed(() => displayedPosition("days", this.#followedMonth()));
  readonly #config = computed<GridConfig>(() => ({
    weekStart: this.weekStart(),
    columns: 3,
    min: this.min(),
    max: this.max(),
  }));
  readonly #labels = computed(() => new CalendarLabels(this.locale()));
  readonly heading = computed(() => this.#labels().month(this.position()));
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

    const target = this.#hovered() ?? this.#focused() ?? anchor;

    if (target < anchor) {
      return { start: target, end: anchor };
    }

    return { start: anchor, end: target };
  });
  /** The registered Heading's effective ID, or null before it registers. */
  readonly headingId = computed(() => this.#heading()?.() ?? null);
  /** The date of the cell holding the grid's tab stop; null while the root is disabled. */
  readonly tabStop = computed(() => {
    if (this.disabled()) {
      return null;
    }

    const position = this.position();
    let focused = this.#focused();

    if (focused !== null && this.#cellOf(focused) === null) {
      focused = null;
    }

    return tabStop(
      "days",
      { focused, selected: this.#root().preferred(position), today: this.today(), position },
      this.#config(),
      this.#dateDisabled(),
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

  /** Whether `date` is today; tracked. */
  isToday(date: string): boolean {
    return date === this.today();
  }

  /** Whether `date` is outside the displayed month; tracked. */
  isOutside(date: string): boolean {
    return monthOf(date) !== this.position();
  }

  /** Whether `date` can't be chosen: out of bounds or `dateDisabled`; tracked. */
  isDateDisabled(date: string): boolean {
    return cellDisabled("days", date, this.#config(), this.#dateDisabled());
  }

  /** Whether `date` is selected; tracked. */
  isSelected(date: string): boolean {
    return this.#root().selected(date);
  }

  /** Whether `date` starts the committed range; tracked. */
  isRangeStart(date: string): boolean {
    return this.#range()?.start === date;
  }

  /** Whether `date` ends the committed range; tracked. */
  isRangeEnd(date: string): boolean {
    return this.#range()?.end === date;
  }

  /** Whether `date` lies in the committed range, its ends included; tracked. */
  isInRange(date: string): boolean {
    const range = this.#range();

    return range !== null && range.start <= date && date <= range.end;
  }

  /** Whether `date` lies in the pending range's preview, its ends included; tracked. */
  isPreviewed(date: string): boolean {
    const preview = this.#preview();

    return preview !== null && preview.start <= date && date <= preview.end;
  }

  /** The full date, a cell's accessible name; tracked. */
  label(date: string): string {
    return this.#labels().date(date);
  }

  /** Whether Previous (-1) or Next (+1) can step: not wholly outside the bounds. */
  canStep(direction: -1 | 1): boolean {
    return stepTarget("days", this.position(), direction, this.#config()) !== null;
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

  /** The pointer entered the cell of `date`. */
  pointerEntered(date: string): void {
    this.#hovered.set(date);
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

    if (move === null) {
      return;
    }

    event.preventDefault();

    const target = moveTarget("days", date, move, this.#config());

    if (target !== date) {
      this.#navigate(target);
    }
  }

  /**
   * A keydown anywhere in a range root's element, its cells and Previous/Next included: Escape
   * drops a pending first day and prevents its default, and is left alone without one, so an
   * enclosing layer takes it then. Keys with Alt, Ctrl or Meta, keys already `defaultPrevented`
   * and keys during IME composition are ignored.
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
    }
  }

  /**
   * A user's choice of a mounted cell, by click, Enter or Space: written by the root's mode
   * unless the root is disabled or readonly or the day can't be chosen. Choosing a day outside
   * the displayed month also shows its month, and focus follows to its cell. Choosing a day
   * inside it keeps the display there: when `month` follows the selection and the choice would
   * move it, the displayed month is written to `month`, so the chosen cell keeps focus.
   */
  choose(date: string): void {
    if (this.#destroyed || this.disabled() || this.readonly() || this.isDateDisabled(date)) {
      return;
    }

    // Read first: while `month` follows the value, the choice itself can change the display.
    const outside = this.isOutside(date);
    const position = this.position();
    const following = canonicalMonth(this.#root().month()) === null;
    const anchor = this.#root().anchor();

    // A pending first day the bounds or `dateDisabled` have disabled since can't end a range:
    // this choice starts a new one instead.
    if (anchor !== null && this.isDateDisabled(anchor)) {
      this.#root().cancel();
    }

    this.#root().choose(date);

    if (outside) {
      this.#show(date);

      return;
    }

    if (following && this.position() !== position) {
      this.#root().month.set(position);
    }
  }

  /**
   * Previous (-1) or Next (+1): shows the neighbouring month; focus stays where it is, so a
   * pending focus request is dropped.
   */
  step(direction: -1 | 1): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    const target = stepTarget("days", this.position(), direction, this.#config());

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

  /** Focus moves to `target`, showing its month first when it is outside the displayed one. */
  #navigate(target: string): void {
    if (this.isOutside(target)) {
      this.#show(target);

      return;
    }

    this.#focused.set(target);
    this.#focusDate(target, undefined);
  }

  /**
   * Focus moves to `target` while the display changes to its month, or the nearest month that
   * can be shown: written to `month` unless the display already shows it, such as by following
   * the selection there. Focus waits for the cell the new month renders: a cell showing `target`
   * now, as an outside day, may go with the old month.
   */
  #show(target: string): void {
    const month = displayedPosition("days", monthOf(target));

    this.#focused.set(target);

    if (month !== this.position()) {
      this.#root().month.set(month);
    }

    this.#request.set({ date: target, origin: this.#document.activeElement, options: undefined });
  }

  /** The `month` Option while it is a canonical month, else the selection's, else today's. */
  #followedMonth(): string {
    const month = canonicalMonth(this.#root().month());

    if (month !== null) {
      return month;
    }

    const shown = canonicalDay(this.#root().shown());

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

  #dateDisabled(): (date: string) => boolean {
    return this.#root().dateDisabled();
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
