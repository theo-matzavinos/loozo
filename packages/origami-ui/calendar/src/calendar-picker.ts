import { ErrorHandler, inject } from "@angular/core";
import type { DestroyRef, Signal, WritableSignal } from "@angular/core";

/** The Calendar modes a picker binds: one root each. */
export type CalendarPickerMode = "date" | "dates" | "range" | "month";

/** Each mode's Calendar root and picker root, for the mismatch report. */
const selectors: Record<CalendarPickerMode, { calendar: string; picker: string }> = {
  date: { calendar: "ogCalendar", picker: "ogDatePicker" },
  dates: { calendar: "ogCalendarMultiple", picker: "ogDatePickerMultiple" },
  range: { calendar: "ogCalendarRange", picker: "ogDatePickerRange" },
  month: { calendar: "ogMonthCalendar", picker: "ogMonthPicker" },
};

/** What a Calendar registers with its picker: the picker resets and focuses it on open. */
export interface CalendarPickerTarget {
  /** Back to a fresh mount's display: `month` follows, the value's own view, no range anchor. */
  reset(): void;
  /** The root's `focus()`: the tab-stop cell, at once or once it mounts. */
  focus(options?: FocusOptions): void;
  /**
   * Whether the root's focus waits for a cell that isn't mounted yet: a `focusout` to nothing
   * meanwhile is the focused cell leaving with its month, not focus leaving the picker.
   */
  focusPending(): boolean;
}

/**
 * @internal Package-private: the picker a Calendar root inside its Content binds to, provided
 * by `ogDatePickerContent`. The bound root takes its value, disabled and readonly from here
 * instead of its own Options, reports a completed choice, registers itself, and its Grid
 * doesn't join a Field. Not an application API.
 */
export abstract class ɵOrigamiCalendarPicker<T> {
  /** The Calendar root the picker binds; a root of another mode stays unbound. */
  abstract readonly mode: CalendarPickerMode;
  /** The picker's value, written by the bound Calendar's choices. */
  abstract readonly value: WritableSignal<T>;
  /** The picker's disabled policy. */
  abstract readonly disabled: Signal<boolean>;
  /** The picker's readonly policy. */
  abstract readonly readonly: Signal<boolean>;
  /** A choice at the value's level passed the guards: single/month every one (same value too), range the end, multiple never. */
  abstract chosen(): void;
  /** The Calendar registers itself; the picker resets and focuses it on open. */
  abstract register(calendar: CalendarPickerTarget, destroyRef: DestroyRef): void;
}

/**
 * @internal The nearest picker when it binds `mode`, else null. Runs in an injection context;
 * a picker of another mode is reported by the root on registration, not here.
 */
export function injectCalendarPicker<T>(
  mode: CalendarPickerMode,
): ɵOrigamiCalendarPicker<T> | null {
  const picker = inject<ɵOrigamiCalendarPicker<T>>(ɵOrigamiCalendarPicker, { optional: true });

  if (picker === null || picker.mode !== mode) {
    return null;
  }

  return picker;
}

/**
 * @internal Registers a root with its picker from the root's `ngOnInit`, or reports a picker of
 * another mode through `ErrorHandler`: that root stays an unbound inline Calendar.
 */
export class CalendarPickerRegistration {
  readonly #picker = inject<ɵOrigamiCalendarPicker<unknown>>(ɵOrigamiCalendarPicker, {
    optional: true,
  });
  readonly #errors = inject(ErrorHandler);

  constructor(readonly mode: CalendarPickerMode) {}

  register(target: CalendarPickerTarget, destroyRef: DestroyRef): void {
    const picker = this.#picker;

    if (picker === null) {
      return;
    }

    if (picker.mode !== this.mode) {
      const own = selectors[this.mode];
      const expected = selectors[picker.mode];

      this.#errors.handleError(
        new Error(
          `${own.calendar} inside ${expected.picker} Content isn't bound to the picker; author an ${expected.calendar} there.`,
        ),
      );

      return;
    }

    picker.register(target, destroyRef);
  }
}
