import {
  DestroyRef,
  Directive,
  ElementRef,
  ErrorHandler,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { CalendarContext } from "./calendar-context";
import { levelOf } from "./calendar-grid-model";

/**
 * Effective cell configuration. Other parts read it only once the cell has registered in
 * `ngOnInit`, after Angular set its inputs, so replacement Options may use required inputs.
 */
export abstract class OrigamiCalendarCellOptions {
  /**
   * The cell's date at the level of the root's current view: a day `YYYY-MM-DD` (days), a month
   * `YYYY-MM` (months) or a year `YYYY` (years), usually the `date` of a `state.weeks()`,
   * `state.months()` or `state.years()` record. Required: there is no default. A value that isn't
   * a canonical date of the current view's level is reported through Angular's `ErrorHandler`
   * when the cell registers, and the cell is inert while its level isn't the view's.
   */
  abstract readonly date: Signal<string>;

  /**
   * Replaces cell Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiCalendarCellOptions> | AbstractType<OrigamiCalendarCellOptions>,
  ): Provider {
    return { provide: OrigamiCalendarCellOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all cell Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `date`.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiCalendarCellOptions): Provider {
    return { provide: OrigamiCalendarCellOptions, useFactory: factory };
  }
}

/** The date shape each view's cells take. */
const patterns = { days: "YYYY-MM-DD", months: "YYYY-MM", years: "YYYY" } as const;

function marker(value: boolean): "" | null {
  if (value) {
    return "";
  }

  return null;
}

/**
 * A day, month or year of a Calendar root's grid, usually a `<td>`: one focusable
 * `role="gridcell"` (a consumer's static `role` overrides it), named by its full localized date
 * (`aria-label`: "Tuesday, October 27, 2026", "October 2026" or "2026"), so screen readers needn't
 * announce column headers. Put the day number, the short month or the year inside; the label
 * replaces it as the name. Its `date`'s level must be the root's current view's: render days in
 * the days view, months in the months view and years in the years view.
 *
 * Host semantics: `tabindex="0"` on the grid's single tab stop and `"-1"` on every other cell,
 * none while the root is disabled; `aria-current="date"` and `data-today` on today, today's
 * month or today's year; `aria-disabled="true"` and `data-disabled` while the cell can't be
 * chosen (wholly outside the bounds, `dateDisabled` for days, `monthDisabled` for an
 * `ogMonthCalendar` month, or the root disabled). In the value's own view (days; months under
 * `ogMonthCalendar`), `aria-selected="true"` and `data-selected` on a selected day or month
 * (under `ogCalendarRange`, every day of the range), and `aria-selected="false"` on the others
 * under `ogCalendarMultiple` and `ogCalendarRange`. In a coarser view, no `aria-selected`:
 * `data-selected` marks the month or year holding the value (a range's start; several days'
 * first), and `data-current` the displayed month or year. Days only: `data-outside` on a day of
 * the previous or next month and, under `ogCalendarRange`, `data-range-start` and
 * `data-range-end` on the range's first and last day, `data-in-range` on every day of it, ends
 * included, and, while its first day is pending, `data-preview` on the days the next choice
 * would span: from that day to the hovered one, else the focused one. Style from these
 * attributes; no State read is needed.
 *
 * Click, Enter and Space choose the cell: a day (or `ogMonthCalendar`'s month) is written, and a
 * coarser month or year drills down to its days or months; the arrows, Home/End and
 * PageUp/PageDown move focus (see `ogCalendar`). A disabled cell takes focus but isn't chosen.
 * To leave outside days blank, keep their `<td>` and skip `ogCalendarCell` on it. Requires a
 * nearest Calendar root: `ogCalendar`, `ogCalendarMultiple`, `ogCalendarRange` or
 * `ogMonthCalendar`.
 */
@Directive({
  selector: "[ogCalendarCell]",
  providers: [OrigamiCalendarCellOptions.provideExisting(() => OrigamiCalendarCell)],
  host: {
    role: "gridcell",
    "[attr.tabindex]": "tabIndex()",
    "[attr.aria-label]": "ariaLabel()",
    "[attr.aria-selected]": "ariaSelected()",
    "[attr.aria-current]": "ariaCurrent()",
    "[attr.aria-disabled]": "ariaDisabled()",
    "[attr.data-selected]": "selected()",
    "[attr.data-today]": "today()",
    "[attr.data-current]": "current()",
    "[attr.data-outside]": "outside()",
    "[attr.data-disabled]": "disabledAttribute()",
    "[attr.data-range-start]": "rangeStart()",
    "[attr.data-range-end]": "rangeEnd()",
    "[attr.data-in-range]": "inRange()",
    "[attr.data-preview]": "preview()",
    "(keydown)": "keydown($event)",
    "(click)": "clicked()",
    "(focus)": "focused()",
  },
})
export class OrigamiCalendarCell implements OrigamiCalendarCellOptions {
  /**
   * Own required date input, `YYYY-MM-DD`, `YYYY-MM` or `YYYY` by the root's view; replaced
   * Options supply the effective date instead.
   */
  readonly date = input.required<string>();

  readonly #options = injectDeferred(OrigamiCalendarCellOptions);
  readonly #context = inject(CalendarContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #errorHandler = inject(ErrorHandler);
  /** The effective date while it is canonical at the current view's level; an inert cell's is null. */
  readonly #date = computed(() => {
    const date = this.#options().date();

    if (levelOf(date) !== this.#context.view()) {
      return null;
    }

    return date;
  });
  readonly #disabled = computed(() => {
    const date = this.#date();

    return date === null || this.#context.disabled() || this.#context.isCellDisabled(date);
  });

  /** @internal "0" on the tab stop, "-1" elsewhere, none while disabled or inert. */
  protected readonly tabIndex = computed(() => {
    const date = this.#date();

    if (date === null || this.#context.disabled()) {
      return null;
    }

    if (this.#context.tabStop() === date) {
      return "0";
    }

    return "-1";
  });
  /** @internal The full localized date, month or year. */
  protected readonly ariaLabel = computed(() => {
    const date = this.#date();

    if (date === null) {
      return null;
    }

    return this.#context.label(date);
  });
  readonly #selected = computed(() => {
    const date = this.#date();

    return date !== null && this.#context.isSelected(date);
  });
  /**
   * @internal In the value's own view, "true" on a selected cell and "false" on the others where
   * several days can be selected; else absent.
   */
  protected readonly ariaSelected = computed(() => {
    if (this.#date() === null || !this.#context.valueView()) {
      return null;
    }

    if (this.#selected()) {
      return "true";
    }

    if (this.#context.multiselectable()) {
      return "false";
    }

    return null;
  });
  /** @internal Selected marker. */
  protected readonly selected = computed(() => marker(this.#selected()));
  readonly #today = computed(() => {
    const date = this.#date();

    return date !== null && this.#context.isToday(date);
  });
  /** @internal `aria-current="date"` on today, today's month or today's year. */
  protected readonly ariaCurrent = computed(() => {
    if (this.#today()) {
      return "date";
    }

    return null;
  });
  /** @internal Today marker. */
  protected readonly today = computed(() => marker(this.#today()));
  /** @internal The displayed month or year in a coarser view. */
  protected readonly current = computed(() => {
    const date = this.#date();

    return marker(date !== null && this.#context.isCurrent(date));
  });
  /** @internal Outside-month marker. */
  protected readonly outside = computed(() => {
    const date = this.#date();

    return marker(date !== null && this.#context.isOutside(date));
  });
  /** @internal Disabled ARIA. */
  protected readonly ariaDisabled = computed(() => {
    if (this.#disabled()) {
      return "true";
    }

    return null;
  });
  /** @internal Disabled marker. */
  protected readonly disabledAttribute = computed(() => marker(this.#disabled()));
  /** @internal The committed range's first day. */
  protected readonly rangeStart = computed(() => {
    const date = this.#date();

    return marker(date !== null && this.#context.isRangeStart(date));
  });
  /** @internal The committed range's last day. */
  protected readonly rangeEnd = computed(() => {
    const date = this.#date();

    return marker(date !== null && this.#context.isRangeEnd(date));
  });
  /** @internal A day of the committed range, its ends included. */
  protected readonly inRange = computed(() => {
    const date = this.#date();

    return marker(date !== null && this.#context.isInRange(date));
  });
  /** @internal A day the pending range would span. */
  protected readonly preview = computed(() => {
    const date = this.#date();

    return marker(date !== null && this.#context.isPreviewed(date));
  });

  constructor() {
    // Native listeners, not host listeners: the pointer crosses cells constantly, and only a
    // pending range reads what it hovers, so a crossing needn't schedule change detection.
    const entered = (): void => {
      const date = this.#date();

      if (date !== null) {
        this.#context.pointerEntered(date);
      }
    };
    const left = (): void => {
      const date = this.#date();

      if (date !== null) {
        this.#context.pointerLeft(date);
      }
    };

    this.#element.addEventListener("pointerenter", entered);
    this.#element.addEventListener("pointerleave", left);
    this.#destroyRef.onDestroy(() => {
      this.#element.removeEventListener("pointerenter", entered);
      this.#element.removeEventListener("pointerleave", left);
    });
  }

  /**
   * @internal Registers with the Calendar once Angular has set its inputs, reporting a date that
   * isn't a canonical date of the current view's level.
   */
  ngOnInit(): void {
    const date = this.#options().date();
    const view = this.#context.view();

    if (levelOf(date) !== view) {
      this.#errorHandler.handleError(
        new Error(
          `ogCalendarCell: the ${view} view requires a ${patterns[view]} date from 0001 to 9999; got ${JSON.stringify(date)}. The cell is inert.`,
        ),
      );
    }

    this.#context.registerCell({ element: this.#element, date: this.#date }, this.#destroyRef);
  }

  /** @internal The Calendar's keys. */
  protected keydown(event: KeyboardEvent): void {
    const date = this.#date();

    if (date !== null) {
      this.#context.keydown(date, this.#element, event);
    }
  }

  /** @internal A click focuses the cell, as not every engine does for a table cell, then chooses it. */
  protected clicked(): void {
    const date = this.#date();

    if (date === null || this.#context.disabled()) {
      return;
    }

    if (this.#element.ownerDocument.activeElement !== this.#element) {
      this.#element.focus();
    }

    this.#context.choose(date);
  }

  /** @internal The focused day is the tab stop. */
  protected focused(): void {
    const date = this.#date();

    if (date !== null) {
      this.#context.focused(date);
    }
  }
}
