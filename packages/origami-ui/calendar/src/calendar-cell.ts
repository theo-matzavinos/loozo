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
import { canonicalDay } from "./calendar-date";
import { CalendarContext } from "./calendar-context";

/**
 * Effective cell configuration. Other parts read it only once the cell has registered in
 * `ngOnInit`, after Angular set its inputs, so replacement Options may use required inputs.
 */
export abstract class OrigamiCalendarCellOptions {
  /**
   * The cell's day, `YYYY-MM-DD`, usually a `state.weeks()` record's `date`. Required: there is
   * no default. A value that isn't a canonical day is reported through Angular's `ErrorHandler`
   * when the cell registers, and the cell stays inert.
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

function marker(value: boolean): "" | null {
  if (value) {
    return "";
  }

  return null;
}

/**
 * A day of an `ogCalendar`'s grid, usually a `<td>`: one focusable `role="gridcell"` (a
 * consumer's static `role` overrides it), named by its full localized date (`aria-label`, such as
 * "Tuesday, October 27, 2026"), so screen readers needn't announce column headers. Put the day
 * number inside; the label replaces it as the name.
 *
 * Host semantics: `tabindex="0"` on the grid's single tab stop and `"-1"` on every other cell,
 * none while the root is disabled; `aria-selected="true"` and `data-selected` on the chosen day;
 * `aria-current="date"` and `data-today` on today; `data-outside` on a day of the previous or
 * next month; `aria-disabled="true"` and `data-disabled` while the day can't be chosen (out of
 * `minDate`/`maxDate`, `dateDisabled`, or the root disabled). Style from these attributes; no State read
 * is needed.
 *
 * Click, Enter and Space choose the day; the arrows, Home/End and PageUp/PageDown move focus
 * (see `ogCalendar`). A disabled day takes focus but isn't chosen. To leave outside days blank,
 * keep their `<td>` and skip `ogCalendarCell` on it. Requires a nearest Calendar root.
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
    "[attr.data-outside]": "outside()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(keydown)": "keydown($event)",
    "(click)": "clicked()",
    "(focus)": "focused()",
  },
})
export class OrigamiCalendarCell implements OrigamiCalendarCellOptions {
  /** Own required day input, `YYYY-MM-DD`; replaced Options supply the effective day instead. */
  readonly date = input.required<string>();

  readonly #options = injectDeferred(OrigamiCalendarCellOptions);
  readonly #context = inject(CalendarContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #errorHandler = inject(ErrorHandler);
  /** The effective day while it is canonical; an inert cell's is null. */
  readonly #day = computed(() => canonicalDay(this.#options().date()));
  readonly #disabled = computed(() => {
    const day = this.#day();

    return day === null || this.#context.disabled() || this.#context.isDateDisabled(day);
  });

  /** @internal "0" on the tab stop, "-1" elsewhere, none while disabled or inert. */
  protected readonly tabIndex = computed(() => {
    const day = this.#day();

    if (day === null || this.#context.disabled()) {
      return null;
    }

    if (this.#context.tabStop() === day) {
      return "0";
    }

    return "-1";
  });
  /** @internal The full localized date. */
  protected readonly ariaLabel = computed(() => {
    const day = this.#day();

    if (day === null) {
      return null;
    }

    return this.#context.label(day);
  });
  readonly #selected = computed(() => {
    const day = this.#day();

    return day !== null && this.#context.isSelected(day);
  });
  /** @internal "true" on a selected day only. */
  protected readonly ariaSelected = computed(() => {
    if (this.#selected()) {
      return "true";
    }

    return null;
  });
  /** @internal Selected marker. */
  protected readonly selected = computed(() => marker(this.#selected()));
  readonly #today = computed(() => {
    const day = this.#day();

    return day !== null && this.#context.isToday(day);
  });
  /** @internal `aria-current="date"` on today. */
  protected readonly ariaCurrent = computed(() => {
    if (this.#today()) {
      return "date";
    }

    return null;
  });
  /** @internal Today marker. */
  protected readonly today = computed(() => marker(this.#today()));
  /** @internal Outside-month marker. */
  protected readonly outside = computed(() => {
    const day = this.#day();

    return marker(day !== null && this.#context.isOutside(day));
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

  /**
   * @internal Registers with the Calendar once Angular has set its inputs, reporting a day that
   * isn't canonical.
   */
  ngOnInit(): void {
    const date = this.#options().date();

    if (canonicalDay(date) === null) {
      this.#errorHandler.handleError(
        new Error(
          `ogCalendarCell: date must be a YYYY-MM-DD day from 0001 to 9999; got ${JSON.stringify(date)}. The cell is inert.`,
        ),
      );
    }

    this.#context.registerCell({ element: this.#element, date: this.#day }, this.#destroyRef);
  }

  /** @internal The Calendar's keys. */
  protected keydown(event: KeyboardEvent): void {
    const day = this.#day();

    if (day !== null) {
      this.#context.keydown(day, this.#element, event);
    }
  }

  /** @internal A click focuses the cell, as not every engine does for a table cell, then chooses it. */
  protected clicked(): void {
    const day = this.#day();

    if (day === null || this.#context.disabled()) {
      return;
    }

    if (this.#element.ownerDocument.activeElement !== this.#element) {
      this.#element.focus();
    }

    this.#context.choose(day);
  }

  /** @internal The focused day is the tab stop. */
  protected focused(): void {
    const day = this.#day();

    if (day !== null) {
      this.#context.focused(day);
    }
  }
}
