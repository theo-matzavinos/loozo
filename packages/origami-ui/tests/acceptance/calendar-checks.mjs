import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The Calendar's package-private date module, locale facts and grid model in Node, through their framework-free sources, which no entry point exports. The sources import
// each other without an extension, as the library build resolves them; Node needs `.ts` added.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./calendar-") && !specifier.endsWith(".ts")) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

async function source(name) {
  return import(pathToFileURL(resolve(`calendar/src/${name}.ts`)).href);
}

const date = await source("calendar-date");
const locale = await source("calendar-locale");
const grid = await source("calendar-grid-model");

// Parsing: only canonical days, months and years in 0001–9999 are values.
{
  assert.deepEqual(date.parseDay("2026-10-27"), { year: 2026, month: 10, day: 27 });
  assert.deepEqual(date.parseDay("2024-02-29"), { year: 2024, month: 2, day: 29 }, "Leap day");
  assert.deepEqual(date.parseDay("2000-02-29"), { year: 2000, month: 2, day: 29 }, "400-year leap");
  assert.deepEqual(date.parseDay("0001-01-01"), { year: 1, month: 1, day: 1 });
  assert.deepEqual(date.parseDay("9999-12-31"), { year: 9999, month: 12, day: 31 });

  for (const text of [
    "2026-02-31",
    "2023-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "27/10/2026",
    "2026-1-07",
    "2026-10-7",
    " 2026-10-27",
    "2026-10-27T00:00",
    "0000-01-01",
    "10000-01-01",
    "+02026-10-27",
    "",
    null,
    undefined,
    20261027,
  ]) {
    assert.equal(date.parseDay(text), null, `${JSON.stringify(text)} is no day`);
    assert.equal(date.canonicalDay(text), null);
  }

  assert.equal(date.canonicalDay("2026-10-27"), "2026-10-27");
  assert.deepEqual(date.parseMonth("2026-10"), { year: 2026, month: 10 });
  assert.equal(date.canonicalMonth("2026-10"), "2026-10");

  for (const text of ["2026-13", "2026-1", "0000-12", "2026-10-01", "10/2026", null]) {
    assert.equal(date.parseMonth(text), null, `${JSON.stringify(text)} is no month`);
  }

  assert.equal(date.parseYear("2026"), 2026);
  assert.equal(date.parseYear("0001"), 1);

  for (const text of ["0000", "26", "02026", "2026-01", null]) {
    assert.equal(date.parseYear(text), null, `${JSON.stringify(text)} is no year`);
  }
}

// Day numbers: a round trip over every supported day, agreeing with UTC `Date` arithmetic.
{
  const first = date.dayNumber({ year: 1, month: 1, day: 1 });
  const last = date.dayNumber({ year: 9999, month: 12, day: 31 });

  assert.equal(date.dayNumber({ year: 1970, month: 1, day: 1 }), 0);
  assert.equal(last - first + 1, 3652059, "Days in 0001–9999");

  for (let number = first; number <= last; number += 1) {
    assert.equal(date.dayNumber(date.dayFromNumber(number)), number);
  }

  for (const text of ["0001-01-01", "0099-03-01", "1600-02-29", "1970-01-01", "2026-10-27"]) {
    const instant = new Date(0);
    const parsed = date.parseDay(text);

    instant.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day);
    assert.equal(date.dayNumber(parsed), instant.getTime() / 86400000, text);
    assert.equal(date.weekday(text), instant.getUTCDay() || 7, `${text}'s ISO weekday`);
  }

  assert.equal(date.weekday("2026-10-27"), 2, "A Tuesday");
  assert.equal(date.dayAt(first - 1), null, "Before 0001-01-01");
  assert.equal(date.dayAt(last + 1), null, "After 9999-12-31");
  assert.equal(date.daysBetween("2026-10-27", "2026-11-03"), 7);
}

// Arithmetic: days, months clamped to the destination month's end, years, the supported range.
{
  assert.equal(date.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(date.addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(date.addDays("0001-01-01", -1), "0001-01-01", "Held at the first day");
  assert.equal(date.addDays("9999-12-31", 7), "9999-12-31", "Held at the last day");
  assert.equal(date.addMonths("2026-01-31", 1), "2026-02-28", "Jan 31 → Feb 28, not Mar 3");
  assert.equal(date.addMonths("2028-01-31", 1), "2028-02-29", "Leap year: Feb 29");
  assert.equal(date.addMonths("2026-02-28", 1), "2026-03-28", "Feb 28 → Mar 28");
  assert.equal(date.addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(date.addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(date.addMonths("2026-01-15", -13), "2024-12-15");
  assert.equal(date.addMonths("0001-01-15", -1), "0001-01-01");
  assert.equal(date.addMonths("9999-12-15", 1), "9999-12-31");
  assert.equal(date.addYears("2028-02-29", 1), "2029-02-28", "Feb 29 outside a leap year");
  assert.equal(date.addYears("2026-10-27", -10), "2016-10-27");
  assert.equal(date.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(date.shiftMonth("0001-01", -1), null);
  assert.equal(date.shiftMonth("9999-12", 1), null);
  assert.equal(date.shiftYear("2026", -12), "2014");
  assert.equal(date.shiftYear("0001", -1), null);
  assert.equal(date.firstDayOf("2026-02"), "2026-02-01");
  assert.equal(date.lastDayOf("2026-02"), "2026-02-28");
  assert.equal(date.lastDayOf("2024-02"), "2024-02-29");
  assert.equal(date.monthOf("2026-10-27"), "2026-10");
  assert.equal(date.yearOf("2026-10-27"), "2026");
}

// Time zones: labels name the ISO day in every zone; today is the platform's local day.
{
  const zone = process.env.TZ;
  const instant = new Date(Date.UTC(2026, 9, 27, 10, 30));

  try {
    for (const [timeZone, today] of [
      ["Pacific/Kiritimati", "2026-10-28"],
      ["Pacific/Pago_Pago", "2026-10-26"],
      ["America/Sao_Paulo", "2026-10-27"],
      ["UTC", "2026-10-27"],
    ]) {
      process.env.TZ = timeZone;

      const labels = new locale.CalendarLabels("en-US");

      assert.equal(date.localToday(instant), today, `Today in ${timeZone}`);
      assert.equal(labels.date("2026-10-27"), "Tuesday, October 27, 2026", timeZone);
      assert.equal(labels.date("2018-11-04"), "Sunday, November 4, 2018", `${timeZone}, DST day`);
      assert.equal(labels.day("2018-11-04"), "4");
      assert.equal(labels.month("2026-10"), "October 2026");
      assert.equal(date.utcDate("2018-11-04").toISOString(), "2018-11-04T00:00:00.000Z");
    }
  } finally {
    if (zone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = zone;
    }
  }

  // Sao Paulo's clocks skipped local midnight on 2018-11-04; local today is still that day.
  process.env.TZ = "America/Sao_Paulo";
  assert.equal(date.localToday(new Date(Date.UTC(2018, 10, 4, 3, 30))), "2018-11-04");
  delete process.env.TZ;

  if (zone !== undefined) {
    process.env.TZ = zone;
  }

  assert.equal(date.utcDate("0001-01-01").getUTCFullYear(), 1, "Years below 100 kept");
  assert.equal(new locale.CalendarLabels("en-US").date("0001-01-01"), "Monday, January 1, 1");
}

// Locale facts: labels in the Gregorian calendar, and the week start from `Intl`, else Monday.
{
  const labels = new locale.CalendarLabels("en-US");

  assert.deepEqual(labels.weekdays(7)[0], { short: "Sun", long: "Sunday" });
  assert.deepEqual(labels.weekdays(1)[6], { short: "Sun", long: "Sunday" });
  assert.equal(labels.weekdays(3).length, 7);
  assert.match(
    new locale.CalendarLabels("th-TH").month("2026-10"),
    /2026/,
    "The Gregorian calendar, not the locale's Buddhist one",
  );
  // The months and years views' labels: short months, years and a page of years as a range.
  assert.equal(labels.monthShort("2026-10"), "Oct");
  assert.equal(labels.month("2026-10"), "October 2026");
  assert.equal(labels.year("2026"), "2026");
  assert.equal(labels.year("0012"), "12", "Years below 100 kept");
  assert.equal(labels.years("2016", "2027"), "2016\u2009\u2013\u20092027");
  assert.equal(new locale.CalendarLabels("de-DE").years("2016", "2027"), "2016\u20132027");
  assert.equal(new locale.CalendarLabels("th-TH").year("2026"), "2026", "Gregorian years");
  assert.equal(new locale.CalendarLabels("de-DE").monthShort("2026-03"), "M\u00e4r");
  assert.equal(locale.localeWeekStart("en-US"), 7);
  assert.equal(locale.localeWeekStart("en-GB"), 1);
  assert.equal(locale.localeWeekStart("ar-EG"), 6);

  const prototype = Intl.Locale.prototype;
  const getWeekInfo = Object.getOwnPropertyDescriptor(prototype, "getWeekInfo");
  const weekInfo = Object.getOwnPropertyDescriptor(prototype, "weekInfo");

  delete prototype.getWeekInfo;
  assert.equal(locale.localeWeekStart("en-US"), 7, "The older weekInfo accessor");
  delete prototype.weekInfo;
  assert.equal(locale.localeWeekStart("en-US"), 1, "Neither: Monday");
  Object.defineProperty(prototype, "getWeekInfo", getWeekInfo);
  Object.defineProperty(prototype, "weekInfo", weekInfo);
}

const config = { weekStart: 1, columns: 3, min: null, max: null };
const sunday = { ...config, weekStart: 7 };
const never = () => false;

// Days: weeks of a month from the week start, outside days included, six with `fixedWeeks`.
{
  const october = grid.weeksOf("2026-10", 7, false);

  assert.equal(october.length, 5);
  assert.deepEqual(october[0], [
    "2026-09-27",
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
  ]);
  assert.equal(october[4][6], "2026-10-31", "The month ends on a Saturday");
  assert.equal(grid.weeksOf("2026-10", 1, false)[0][0], "2026-09-28", "Monday start");
  assert.equal(grid.weeksOf("2026-10", 1, true).length, 6);
  assert.equal(grid.weeksOf("2026-10", 1, true)[5][6], "2026-11-08");
  assert.equal(grid.weeksOf("2027-02", 1, false).length, 4, "Feb 2027 starts on a Monday");
  assert.equal(grid.weeksOf("2026-02", 7, false).length, 4, "Feb 2026 starts on a Sunday");
}

// Days: every displayable month's weeks are whole, and each column is one weekday, from the week
// start, whatever the week start and `fixedWeeks`; the months that would need days outside
// 0001–9999 are never displayed.
{
  assert.equal(grid.displayedPosition("days", "0001-01"), "0001-02");
  assert.equal(grid.displayedPosition("days", "0001-02"), "0001-02");
  assert.equal(grid.displayedPosition("days", "2026-10"), "2026-10");
  assert.equal(grid.displayedPosition("days", "9999-11"), "9999-11");
  assert.equal(grid.displayedPosition("days", "9999-12"), "9999-11");

  for (const month of ["0001-02", "2026-10", "2027-02", "9999-11"]) {
    for (let weekStart = 1; weekStart <= 7; weekStart += 1) {
      for (const fixedWeeks of [false, true]) {
        const weeks = grid.weeksOf(month, weekStart, fixedWeeks);
        let previous = null;

        for (const week of weeks) {
          assert.equal(week.length, 7, `${month} from ${weekStart}: a whole week`);

          for (let column = 0; column < 7; column += 1) {
            const day = week[column];

            assert.equal(
              date.weekday(day),
              ((weekStart - 1 + column) % 7) + 1,
              `${month} from ${weekStart}: ${day} under its weekday`,
            );

            if (previous !== null) {
              assert.equal(date.addDays(previous, 1), day, "Consecutive days");
            }

            previous = day;
          }
        }
      }
    }
  }

  assert.deepEqual(grid.weeksOf("0001-02", 7, false)[0], [
    "0001-01-28",
    "0001-01-29",
    "0001-01-30",
    "0001-01-31",
    "0001-02-01",
    "0001-02-02",
    "0001-02-03",
  ]);
  assert.equal(grid.weeksOf("9999-11", 1, true).at(-1).at(-1), "9999-12-12");
  assert.throws(() => grid.weeksOf("0001-01", 7, false), RangeError, "Needs 31 December 0000");
  assert.throws(() => grid.weeksOf("9999-12", 1, false), RangeError, "Needs 1 January 10000");
}

// Days: the keyboard map, month and year moves clamped to the month's end, bounds.
{
  const move = (from, key, options = config) => grid.moveTarget("days", from, key, options);

  assert.equal(move("2026-10-27", "previous"), "2026-10-26");
  assert.equal(move("2026-10-31", "next"), "2026-11-01");
  assert.equal(move("2026-10-27", "up"), "2026-10-20");
  assert.equal(move("2026-10-27", "down"), "2026-11-03");
  assert.equal(move("2026-10-27", "rowStart"), "2026-10-26", "Monday");
  assert.equal(move("2026-10-27", "rowEnd"), "2026-11-01", "Sunday");
  assert.equal(move("2026-10-27", "rowStart", sunday), "2026-10-25");
  assert.equal(move("2026-10-27", "rowEnd", sunday), "2026-10-31");
  assert.equal(move("2026-01-31", "pageNext"), "2026-02-28");
  assert.equal(move("2028-01-31", "pageNext"), "2028-02-29");
  assert.equal(move("2026-03-31", "pagePrevious"), "2026-02-28");
  assert.equal(move("2028-02-29", "superNext"), "2029-02-28");
  assert.equal(move("2026-10-27", "superPrevious"), "2025-10-27");

  const bounded = { ...config, min: "2026-10-05", max: "2026-10-20" };

  assert.equal(move("2026-10-06", "up", bounded), "2026-10-05", "Clamped to min");
  assert.equal(move("2026-10-19", "pageNext", bounded), "2026-10-20", "Clamped to max");
  assert.equal(move("2026-10-05", "previous", bounded), "2026-10-05", "Stays at min");
  assert.equal(move("2026-10-01", "next", bounded), "2026-10-05", "From outside the bounds");
  assert.equal(move("0001-02-01", "previous"), "0001-02-01", "Held at the first shown month");
  assert.equal(move("0001-02-03", "up"), "0001-02-01");
  assert.equal(move("0001-05-10", "superPrevious"), "0001-02-01");
  assert.equal(move("9999-11-30", "next"), "9999-11-30", "Held at the last shown month");
  assert.equal(move("9999-11-15", "pageNext"), "9999-11-30");

  // A bound among the edge months' outside days: moves never leave the bounds for a shown day.
  const firstBound = { ...sunday, max: "0001-01-30" };
  const lastBound = { ...config, min: "9999-12-02" };

  assert.equal(move("0001-01-30", "next", firstBound), "0001-01-30", "Held at max, not 1 February");
  assert.equal(move("0001-01-30", "previous", firstBound), "0001-01-30");
  assert.equal(move("0001-01-30", "pageNext", firstBound), "0001-01-30");
  assert.equal(move("9999-12-02", "previous", lastBound), "9999-12-02", "Held at min");
  assert.equal(move("9999-12-02", "next", lastBound), "9999-12-02", "Not 30 November");
  assert.equal(move("9999-12-02", "superPrevious", lastBound), "9999-12-02");
  assert.equal(move("0001-01-30", "next", { ...sunday, max: "0001-02-03" }), "0001-02-01");
  assert.equal(move("0001-02-02", "next", { ...sunday, max: "0001-02-02" }), "0001-02-02");
  assert.equal(move("9999-12-01", "previous", { ...config, min: "9999-11-29" }), "9999-11-30");
}

// Months: arrows by one and by `columns`, rows' ends, a year by PageUp/PageDown, bounds.
{
  const move = (from, key, options = config) => grid.moveTarget("months", from, key, options);

  assert.deepEqual(grid.monthsOf("2026", 3)[0], ["2026-01", "2026-02", "2026-03"]);
  assert.equal(grid.monthsOf("2026", 3).length, 4);
  assert.equal(grid.monthsOf("2026", 4).length, 3);
  assert.equal(grid.monthsOf("2026", 5).at(-1).length, 2, "A short last row");
  assert.equal(move("2026-01", "previous"), "2025-12");
  assert.equal(move("2026-12", "next"), "2027-01");
  assert.equal(move("2026-05", "up"), "2026-02");
  assert.equal(move("2026-11", "down"), "2027-02");
  assert.equal(move("2026-05", "rowStart"), "2026-04");
  assert.equal(move("2026-05", "rowEnd"), "2026-06");
  assert.equal(move("2026-05", "rowEnd", { ...config, columns: 5 }), "2026-05");
  assert.equal(move("2026-11", "rowEnd", { ...config, columns: 5 }), "2026-12");
  assert.equal(move("2026-05", "pageNext"), "2027-05");
  assert.equal(move("2026-05", "pagePrevious"), "2025-05");
  assert.equal(move("0001-01", "previous"), "0001-01");
  assert.equal(move("2026-05", "pageNext", { ...config, max: "2026-08-15" }), "2026-08");
  assert.equal(move("2026-05", "up", { ...config, min: "2026-03-31" }), "2026-03");
}

// Years: a page of twelve aligned to a multiple of 12, arrows, rows' ends, a page by PageUp/PageDown.
{
  const move = (from, key, options = config) => grid.moveTarget("years", from, key, options);

  assert.equal(grid.pageStart(2026), 2016);
  assert.equal(grid.pageStart(2016), 2016);
  assert.equal(grid.pageStart(2015), 2004);
  assert.deepEqual(grid.yearsOf("2026", 3)[0], ["2016", "2017", "2018"]);
  assert.equal(grid.yearsOf("2026", 3).at(-1).at(-1), "2027");
  assert.equal(grid.yearsOf("2026", 4).length, 3);
  assert.equal(grid.displayedPosition("years", "0005"), "0012", "Page 0000–0011 holds year 0");
  assert.equal(grid.displayedPosition("years", "9999"), "9995", "Page 9996–10007 holds 10000");
  assert.equal(grid.displayedPosition("years", "2026"), "2026");
  assert.deepEqual(grid.yearsOf("0012", 3)[0], ["0012", "0013", "0014"]);
  assert.equal(grid.yearsOf("9995", 3).flat().at(-1), "9995");

  for (const year of ["0012", "2026", "9995"]) {
    for (const columns of [3, 4]) {
      for (const row of grid.yearsOf(year, columns)) {
        assert.equal(row.length, columns, `${year} in rows of ${columns}: whole rows`);
      }
    }
  }

  assert.throws(() => grid.yearsOf("0005", 3), RangeError);
  assert.throws(() => grid.yearsOf("9999", 3), RangeError);
  assert.equal(move("2016", "previous"), "2015");
  assert.equal(move("2027", "next"), "2028");
  assert.equal(move("2020", "up"), "2017");
  assert.equal(move("2020", "down"), "2023");
  assert.equal(move("2020", "rowStart"), "2019");
  assert.equal(move("2020", "rowEnd"), "2021");
  assert.equal(move("2020", "pageNext"), "2032");
  assert.equal(move("2020", "pagePrevious"), "2008");
  assert.equal(move("0012", "rowStart"), "0012");
  assert.equal(move("0012", "previous"), "0012", "Held at the first shown page");
  assert.equal(move("0013", "up"), "0012");
  assert.equal(move("9990", "pageNext"), "9995", "Held at the last shown page");
  assert.equal(move("2020", "pageNext", { ...config, max: "2025-01-01" }), "2025");
  assert.equal(move("0013", "previous", { ...config, max: "0005-06-01" }), "0013", "Held");
  assert.equal(move("9994", "next", { ...config, min: "9998-01-01" }), "9994", "Held");
}

// Bounds and disabled days per level: a month or a year is out only when wholly outside.
{
  const bounds = { min: "2026-10-15", max: "2027-02-10" };

  assert.equal(grid.outOfBounds("days", "2026-10-14", bounds), true);
  assert.equal(grid.outOfBounds("days", "2026-10-15", bounds), false);
  assert.equal(grid.outOfBounds("months", "2026-10", bounds), false);
  assert.equal(grid.outOfBounds("months", "2026-09", bounds), true);
  assert.equal(grid.outOfBounds("months", "2027-02", bounds), false);
  assert.equal(grid.outOfBounds("months", "2027-03", bounds), true);
  assert.equal(grid.outOfBounds("years", "2026", bounds), false);
  assert.equal(grid.outOfBounds("years", "2025", bounds), true);
  assert.equal(grid.outOfBounds("years", "2028", bounds), true);

  const weekends = (day) => date.weekday(day) >= 6;

  assert.equal(grid.cellDisabled("days", "2026-10-31", bounds, weekends), true, "dateDisabled");
  assert.equal(grid.cellDisabled("days", "2026-10-30", bounds, weekends), false);
  assert.equal(grid.cellDisabled("months", "2026-10", bounds, null), false, "No predicate");
  assert.equal(
    grid.cellDisabled("months", "2026-10", bounds, (month) => month === "2026-10"),
    true,
    "A month value's monthDisabled",
  );
  assert.equal(grid.cellDisabled("months", "2026-09", bounds, null), true, "Wholly before min");
  assert.equal(grid.levelOf("2026-10-27"), "days");
  assert.equal(grid.levelOf("2026-10"), "months");
  assert.equal(grid.levelOf("2026"), "years");
  assert.equal(grid.levelOf("2026-02-31"), null);
}

// The tab stop: focused, else selected in the period, else today, else the first enabled cell.
{
  const stop = (level, candidates, options = config, disabled = never) =>
    grid.tabStop(level, candidates, options, disabled);
  const october = { focused: null, selected: null, today: null, position: "2026-10" };

  assert.equal(
    stop("days", { ...october, focused: "2026-10-03", selected: "2026-10-09" }),
    "2026-10-03",
  );
  assert.equal(
    stop("days", { ...october, selected: "2026-10-09", today: "2026-10-27" }),
    "2026-10-09",
  );
  assert.equal(
    stop("days", { ...october, selected: "2026-11-09", today: "2026-10-27" }),
    "2026-10-27",
  );
  assert.equal(stop("days", { ...october, today: "2026-11-27" }), "2026-10-01");
  assert.equal(
    stop("days", october, { ...config, min: "2026-10-05" }),
    "2026-10-05",
    "The first enabled day",
  );
  assert.equal(
    stop("days", october, config, (day) => day < "2026-10-04"),
    "2026-10-04",
    "Skipping disabled days",
  );
  assert.equal(
    stop("days", october, config, () => true),
    "2026-10-01",
    "None enabled: the first",
  );
  assert.equal(
    stop("months", { focused: null, selected: "2026-10", today: null, position: "2026" }),
    "2026-10",
  );
  assert.equal(
    stop(
      "months",
      { focused: null, selected: null, today: null, position: "2026" },
      {
        ...config,
        min: "2026-03-02",
      },
    ),
    "2026-03",
  );
  assert.equal(
    stop("years", { focused: null, selected: "2026", today: null, position: "2020" }),
    "2026",
  );
  assert.equal(
    stop("years", { focused: null, selected: "2030", today: null, position: "2020" }),
    "2016",
    "Another page: its first year",
  );
}

// Previous/Next: one month, year or page of twelve, disabled when wholly outside the bounds.
{
  const bounds = { min: "2026-10-15", max: "2027-02-10" };

  assert.equal(grid.stepTarget("days", "2026-10", 1, config), "2026-11");
  assert.equal(grid.stepTarget("days", "2026-10", -1, bounds), null);
  assert.equal(grid.stepTarget("days", "2026-11", -1, bounds), "2026-10");
  assert.equal(grid.stepTarget("days", "2027-02", 1, bounds), null);
  assert.equal(grid.stepTarget("days", "0001-03", -1, config), "0001-02");
  assert.equal(grid.stepTarget("days", "0001-02", -1, config), null, "0001-01 isn't shown");
  assert.equal(grid.stepTarget("days", "9999-11", 1, config), null, "9999-12 isn't shown");
  assert.equal(grid.stepTarget("months", "2026", 1, bounds), "2027");
  assert.equal(grid.stepTarget("months", "2027", 1, bounds), null);
  assert.equal(grid.stepTarget("years", "2026", -1, config), "2004");
  assert.equal(grid.stepTarget("years", "2026", 1, bounds), null, "2028–2039 lies after max");
  assert.equal(grid.stepTarget("years", "2026", -1, bounds), null, "2004–2015 lies before min");
  assert.equal(grid.stepTarget("years", "0005", -1, config), null);
  assert.equal(grid.stepTarget("years", "0024", -1, config), "0012");
  assert.equal(grid.stepTarget("years", "0012", -1, config), null);
  assert.equal(grid.stepTarget("years", "9983", 1, config), "9984");
  assert.equal(grid.stepTarget("years", "9990", 1, config), null, "9996–10007 isn't shown");
}

console.log(
  "Calendar model: canonical ISO days, months and years; arithmetic with month-end clamping; time-zone-free labels; locale week start; days, months and years grids with whole rows, keys, bounds, tab stop and steps.",
);
