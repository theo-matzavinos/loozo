import type { Signal } from "@angular/core";
import type {
  OrigamiCalendarDayRecord,
  OrigamiCalendarPeriodRecord,
} from "@loozo/origami-ui/calendar";
import type { CalendarLevel } from "./calendar-labels";

/**
 * What the Calendar's header and grid read from the root they render for. Each of the four roots
 * provides itself as this, so one header and one grid serve Origami's four State classes.
 */
export abstract class CalendarRoot {
  abstract readonly state: {
    readonly view: Signal<CalendarLevel>;
    readonly heading: Signal<string>;
    readonly disabled: Signal<boolean>;
    readonly months: Signal<readonly (readonly OrigamiCalendarPeriodRecord[])[]>;
    readonly years: Signal<readonly (readonly OrigamiCalendarPeriodRecord[])[]>;
  };
  /** The range's pending first day; null on the other roots. */
  abstract readonly anchor: Signal<string | null>;
  /** The days view's weeks; empty on MonthCalendar, which has no days view. */
  abstract readonly weeks: Signal<readonly (readonly OrigamiCalendarDayRecord[])[]>;
  /** The days view's weekday labels; empty on MonthCalendar. */
  abstract readonly weekdays: Signal<readonly { readonly short: string; readonly long: string }[]>;
  /** The views the switch cycles through, finest first. */
  abstract readonly levels: readonly CalendarLevel[];

  /** Writes Origami's `view` model, as the view switch's click. */
  abstract setView(view: CalendarLevel): void;
}

/**
 * The standalone box every root draws, with the Field's invalid, readonly and disabled looks read
 * from the grid's own attributes.
 */
export const calendarBoxClasses = [
  "inline-flex w-fit flex-col gap-2 rounded-surface border border-border bg-surface p-3 text-body text-foreground",
  "has-[>table[aria-invalid=true]]:border-destructive-text",
  "has-[>table[aria-readonly=true]]:border-dashed has-[>table[aria-readonly=true]]:bg-transparent",
  "has-[>table[aria-disabled=true]]:cursor-not-allowed has-[>table[aria-disabled=true]]:opacity-50",
];
