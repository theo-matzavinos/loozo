import {
  ɵdaysInMonth as daysInMonth,
  ɵfirstYear as firstYear,
  ɵlastYear as lastYear,
  ɵparseDay as parseDay,
} from "@loozo/origami-ui/utils";
import {
  addDays,
  addMonths,
  addYears,
  dayAt,
  dayNumber,
  firstDayOf,
  formatMonth,
  formatYear,
  lastDayOf,
  monthOf,
  parseMonth,
  parseYear,
  shiftMonth,
  shiftYear,
  weekday,
  yearOf,
} from "./calendar-date";
import type { Weekday } from "./calendar-date";

/**
 * The Calendar's private grid model, for its three levels: a day grid (`YYYY-MM-DD` cells, the
 * position a `YYYY-MM` month), a month grid (`YYYY-MM` cells, the position a `YYYY` year) and a
 * year grid (`YYYY` cells in a page of twelve aligned to a multiple of 12, the position any
 * `YYYY` year in it). It computes periods, keyboard targets, bounds and disabled rules, the tab
 * stop and Previous/Next steps from canonical strings alone; it knows nothing of the DOM, so
 * every period exists before any cell is mounted. Framework-free and package-private.
 */

/** The level a grid shows. */
export type GridLevel = "days" | "months" | "years";

/**
 * A keyboard move, after the caller has applied the text direction: `previous`/`next` are the
 * inline arrows, `up`/`down` the block arrows, `rowStart`/`rowEnd` Home and End, `pagePrevious`/
 * `pageNext` PageUp and PageDown, `superPrevious`/`superNext` Shift+PageUp and Shift+PageDown.
 */
export type GridMove =
  | "previous"
  | "next"
  | "up"
  | "down"
  | "rowStart"
  | "rowEnd"
  | "pagePrevious"
  | "pageNext"
  | "superPrevious"
  | "superNext";

/** What the moves and periods read. `min` and `max` are canonical days or null. */
export interface GridConfig {
  readonly weekStart: Weekday;
  /** Columns of the month and year grids. */
  readonly columns: number;
  readonly min: string | null;
  readonly max: string | null;
}

/** Years in one page of the year grid. */
export const yearsPerPage = 12;

/** How many days a row starts after its week start: 0 on the week start itself. */
function offsetInWeek(date: string, weekStart: Weekday): number {
  return (weekday(date) - weekStart + 7) % 7;
}

/**
 * The periods a grid of `level` can display, so that every row is whole and every cell sits under
 * its own column: a day grid shows the months 0001-02 … 9999-11, whose weeks need no day before
 * 0001-01-01 or after 9999-12-31 whatever the week start or `fixedWeeks`, and a year grid the
 * pages 0012–0023 … 9984–9995, which hold no year 0000 or 10000. Every year's months can be shown.
 */
const displayable: Record<GridLevel, { readonly first: string; readonly last: string }> = {
  days: { first: "0001-02", last: "9999-11" },
  months: { first: formatYear(firstYear), last: formatYear(lastYear) },
  years: { first: "0012", last: "9995" },
};

/** `position`, a canonical period of `level`, held to the periods that level can display. */
export function displayedPosition(level: GridLevel, position: string): string {
  const { first, last } = displayable[level];

  if (position < first) {
    return first;
  }

  if (position > last) {
    return last;
  }

  return position;
}

/**
 * The cells keyboard moves of `level` can reach: those of the periods it can display, the days of
 * 0001-02 … 9999-11 or the years 0012 … 9995.
 */
function reachable(level: GridLevel): { readonly first: string; readonly last: string } {
  const { first, last } = displayable[level];

  if (level === "days") {
    return { first: firstDayOf(first), last: lastDayOf(last) };
  }

  if (level === "months") {
    return { first: `${first}-01`, last: `${last}-12` };
  }

  return { first, last };
}

/**
 * The weeks of `month`, a month a day grid can display, each seven canonical days from
 * `weekStart`, including the neighbouring months' days that complete the first and last week; six
 * weeks when `fixedWeeks`.
 */
export function weeksOf(month: string, weekStart: Weekday, fixedWeeks: boolean): string[][] {
  const first = firstDayOf(month);
  const { year, month: number } = parseMonth(month)!;
  const leading = offsetInWeek(first, weekStart);
  let count = Math.ceil((leading + daysInMonth(year, number)) / 7);

  if (fixedWeeks) {
    count = 6;
  }

  const start = dayNumber(parseDay(first)!) - leading;
  const weeks: string[][] = [];

  for (let row = 0; row < count; row += 1) {
    const week: string[] = [];

    for (let column = 0; column < 7; column += 1) {
      const date = dayAt(start + row * 7 + column);

      if (date === null) {
        throw new RangeError(`The weeks of ${month} need days outside 0001–9999.`);
      }

      week.push(date);
    }

    weeks.push(week);
  }

  return weeks;
}

/** The twelve months of `year`, in rows of `columns`. */
export function monthsOf(year: string, columns: number): string[][] {
  const number = parseYear(year)!;
  const rows: string[][] = [];

  for (let month = 1; month <= 12; month += 1) {
    if ((month - 1) % columns === 0) {
      rows.push([]);
    }

    rows[rows.length - 1]!.push(formatMonth(number, month));
  }

  return rows;
}

/** The first year of the page of twelve holding `year`: a multiple of 12, such as 2016. */
export function pageStart(year: number): number {
  return Math.floor(year / yearsPerPage) * yearsPerPage;
}

/**
 * The page of twelve years holding `year`, a year a year grid can display, aligned to a multiple
 * of 12 (2016–2027), in rows of `columns`.
 */
export function yearsOf(year: string, columns: number): string[][] {
  if (displayedPosition("years", year) !== year) {
    throw new RangeError(`The page of ${year} holds years outside 0001–9999.`);
  }

  const start = pageStart(parseYear(year)!);
  const rows: string[][] = [];

  for (let index = 0; index < yearsPerPage; index += 1) {
    if (index % columns === 0) {
      rows.push([]);
    }

    rows[rows.length - 1]!.push(formatYear(start + index));
  }

  return rows;
}

/** The level of a canonical cell date, or null when it is none of the three shapes. */
export function levelOf(date: string): GridLevel | null {
  if (parseDay(date) !== null) {
    return "days";
  }

  if (parseMonth(date) !== null) {
    return "months";
  }

  if (parseYear(date) !== null) {
    return "years";
  }

  return null;
}

/** A canonical day bound converted to `level`: the day, its month or its year. */
function boundAt(level: GridLevel, bound: string | null): string | null {
  if (bound === null || level === "days") {
    return bound;
  }

  if (level === "months") {
    return monthOf(bound);
  }

  return yearOf(bound);
}

/** `date`, a period of `level`, cut to the bounds converted to that level. */
function clamp(level: GridLevel, date: string, { min, max }: GridConfig): string {
  const lower = boundAt(level, min);
  const upper = boundAt(level, max);

  if (lower !== null && date < lower) {
    return lower;
  }

  if (upper !== null && date > upper) {
    return upper;
  }

  return date;
}

function moveDay(from: string, move: GridMove, config: GridConfig): string {
  switch (move) {
    case "previous":
      return addDays(from, -1);
    case "next":
      return addDays(from, 1);
    case "up":
      return addDays(from, -7);
    case "down":
      return addDays(from, 7);
    case "rowStart":
      return addDays(from, -offsetInWeek(from, config.weekStart));
    case "rowEnd":
      return addDays(from, 6 - offsetInWeek(from, config.weekStart));
    case "pagePrevious":
      return addMonths(from, -1);
    case "pageNext":
      return addMonths(from, 1);
    case "superPrevious":
      return addYears(from, -1);
    case "superNext":
      return addYears(from, 1);
  }
}

/** `month` moved by `amount` months, held at the supported range's ends. */
function monthAtOffset(month: string, amount: number): string {
  const shifted = shiftMonth(month, amount);

  if (shifted !== null) {
    return shifted;
  }

  if (amount < 0) {
    return "0001-01";
  }

  return "9999-12";
}

function moveMonth(from: string, move: GridMove, { columns }: GridConfig): string {
  const index = parseMonth(from)!.month - 1;
  const rowStart = index - (index % columns);

  switch (move) {
    case "previous":
      return monthAtOffset(from, -1);
    case "next":
      return monthAtOffset(from, 1);
    case "up":
      return monthAtOffset(from, -columns);
    case "down":
      return monthAtOffset(from, columns);
    case "rowStart":
      return monthAtOffset(from, rowStart - index);
    case "rowEnd":
      return monthAtOffset(from, Math.min(rowStart + columns - 1, 11) - index);
    case "pagePrevious":
      return monthAtOffset(from, -12);
    case "pageNext":
      return monthAtOffset(from, 12);
    case "superPrevious":
    case "superNext":
      return from;
  }
}

/** `year` moved by `amount` years, held at 0001 and 9999. */
function yearAtOffset(year: string, amount: number): string {
  const shifted = shiftYear(year, amount);

  if (shifted !== null) {
    return shifted;
  }

  if (amount < 0) {
    return formatYear(firstYear);
  }

  return formatYear(lastYear);
}

function moveYear(from: string, move: GridMove, { columns }: GridConfig): string {
  const number = parseYear(from)!;
  const index = number - pageStart(number);
  const rowStart = index - (index % columns);

  switch (move) {
    case "previous":
      return yearAtOffset(from, -1);
    case "next":
      return yearAtOffset(from, 1);
    case "up":
      return yearAtOffset(from, -columns);
    case "down":
      return yearAtOffset(from, columns);
    case "rowStart":
      return yearAtOffset(from, rowStart - index);
    case "rowEnd":
      return yearAtOffset(from, Math.min(rowStart + columns - 1, yearsPerPage - 1) - index);
    case "pagePrevious":
      return yearAtOffset(from, -yearsPerPage);
    case "pageNext":
      return yearAtOffset(from, yearsPerPage);
    case "superPrevious":
    case "superNext":
      return from;
  }
}

/**
 * Where `move` from `from`, a canonical period of `level`, lands: date arithmetic (±1 day,
 * week or month, ±`columns` periods, the row's ends, ±1 month, year or page of twelve), with
 * month moves clamped to the destination month's last day, then clamped to the cells that are
 * both within `min`/`max` at that level and in the periods the level can display. Where no cell
 * is both, as with a `max` among 0001-01's outside days, the move stays at `from`. Rows' ends
 * are the week's (days) or the row of `columns` (months and years).
 */
export function moveTarget(
  level: GridLevel,
  from: string,
  move: GridMove,
  config: GridConfig,
): string {
  let target: string;

  if (level === "days") {
    target = moveDay(from, move, config);
  } else if (level === "months") {
    target = moveMonth(from, move, config);
  } else {
    target = moveYear(from, move, config);
  }

  const { first, last } = reachable(level);
  const lower = boundAt(level, config.min);
  const upper = boundAt(level, config.max);

  if ((upper !== null && upper < first) || (lower !== null && lower > last)) {
    return from;
  }

  const bounded = clamp(level, target, config);

  if (bounded < first) {
    return first;
  }

  if (bounded > last) {
    return last;
  }

  return bounded;
}

/**
 * Whether a period of `level` lies wholly outside `min`/`max`. A day is outside when it is before
 * `min` or after `max`; a month or a year only when none of its days is inside.
 */
export function outOfBounds(
  level: GridLevel,
  date: string,
  { min, max }: Pick<GridConfig, "min" | "max">,
): boolean {
  let first = date;
  let last = date;

  if (level === "months") {
    first = firstDayOf(date);
    last = lastDayOf(date);
  } else if (level === "years") {
    first = `${date}-01-01`;
    last = `${date}-12-31`;
  }

  return (min !== null && last < min) || (max !== null && first > max);
}

/**
 * Whether a cell can't be chosen: out of bounds, or `disabled` returns true for it. The caller
 * passes `disabled` only for the value's own level (`dateDisabled` for days, `monthDisabled` for
 * a month value), else null. A disabled cell still takes focus.
 */
export function cellDisabled(
  level: GridLevel,
  date: string,
  config: Pick<GridConfig, "min" | "max">,
  disabled: ((date: string) => boolean) | null,
): boolean {
  if (outOfBounds(level, date, config)) {
    return true;
  }

  return disabled !== null && disabled(date);
}

/** Whether a cell date of `level` belongs to the period at `position` (rather than outside it). */
export function inPeriod(level: GridLevel, date: string, position: string): boolean {
  if (level === "days") {
    return monthOf(date) === position;
  }

  if (level === "months") {
    return yearOf(date) === position;
  }

  return pageStart(parseYear(date)!) === pageStart(parseYear(position)!);
}

/** What the tab stop is chosen from. */
export interface TabStopCandidates {
  /** The focused cell's date while a mounted cell has it, else null. */
  readonly focused: string | null;
  /** The selection's preferred date in this period, else null. */
  readonly selected: string | null;
  /** Today at this level (a day, its month or its year), else null. */
  readonly today: string | null;
  /** The displayed period: a `YYYY-MM` month for days, a `YYYY` year otherwise. */
  readonly position: string;
}

/**
 * The cell holding the grid's single tab stop. Days: the focused date, else the selected date
 * if it is in the displayed month, else today if it is, else the month's first enabled day,
 * else its first day. Months and years: the focused period, else the displayed one (the
 * position's month or year, which the caller passes as `selected`), else the period's first
 * enabled cell, else its first.
 */
export function tabStop(
  level: GridLevel,
  { focused, selected, today, position }: TabStopCandidates,
  config: GridConfig,
  disabled: ((date: string) => boolean) | null,
): string {
  if (focused !== null) {
    return focused;
  }

  if (selected !== null && inPeriod(level, selected, position)) {
    return selected;
  }

  if (level === "days" && today !== null && inPeriod(level, today, position)) {
    return today;
  }

  const cells = periodCells(level, position, config);

  for (const cell of cells) {
    if (!cellDisabled(level, cell, config, disabled)) {
      return cell;
    }
  }

  return cells[0]!;
}

/** The period's own cells in order: a month's days, a year's months, a page's years. */
function periodCells(level: GridLevel, position: string, config: GridConfig): string[] {
  const cells: string[] = [];

  if (level === "days") {
    for (const week of weeksOf(position, config.weekStart, false)) {
      for (const day of week) {
        if (monthOf(day) === position) {
          cells.push(day);
        }
      }
    }

    return cells;
  }

  let rows: string[][];

  if (level === "months") {
    rows = monthsOf(position, config.columns);
  } else {
    rows = yearsOf(position, config.columns);
  }

  for (const row of rows) {
    cells.push(...row);
  }

  return cells;
}

/**
 * The position one Previous (-1) or Next (+1) step from `position`: one month (days), one year
 * (months) or one page of twelve years (years). Null when the step leaves the periods the level
 * can display or lands wholly outside `min`/`max`.
 */
export function stepTarget(
  level: GridLevel,
  position: string,
  direction: -1 | 1,
  config: Pick<GridConfig, "min" | "max">,
): string | null {
  if (level === "days") {
    const target = shiftMonth(position, direction);

    if (target === null || displayedPosition(level, target) !== target) {
      return null;
    }

    if (outOfBounds("months", target, config)) {
      return null;
    }

    return target;
  }

  if (level === "months") {
    const target = shiftYear(position, direction);

    if (target === null || outOfBounds("years", target, config)) {
      return null;
    }

    return target;
  }

  const start = pageStart(parseYear(position)!) + direction * yearsPerPage;
  const end = start + yearsPerPage - 1;
  const { first, last } = displayable.years;

  if (start < parseYear(first)! || end > parseYear(last)!) {
    return null;
  }

  const { min, max } = config;
  const outside =
    (min !== null && `${formatYear(end)}-12-31` < min) ||
    (max !== null && `${formatYear(start)}-01-01` > max);

  if (outside) {
    return null;
  }

  return formatYear(start);
}
