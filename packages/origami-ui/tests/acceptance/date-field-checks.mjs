import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The date field's package-private segment engine, layout and value shape in Node (DF1), through
// their framework-free sources, which no entry point exports. The sources import each other
// without an extension, as the library build resolves them; Node needs `.ts` added. From
// `@loozo/origami-ui/utils` they import only the civil-date functions, so that specifier resolves
// to the framework-free `civil-date` source; their other imports are types, which Node strips.
const civilDate = pathToFileURL(resolve("utils/src/civil-date.ts")).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@loozo/origami-ui/utils") {
      return nextResolve(civilDate, context);
    }

    if (specifier.startsWith("./") && !specifier.endsWith(".ts")) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

async function source(name) {
  return import(pathToFileURL(resolve(`date-field/src/${name}.ts`)).href);
}

const unit = await source("date-field-unit");
const layout = await source("date-field-layout");
const { dateValue, formatDate, writeDate } = await source("date-value");
const { timeValue } = await source("time-value");
const { dateTimeValue } = await source("date-time-value");
const wallTime = await source("wall-time");

const h12 = { hourCycle: 12 };
const h24 = { hourCycle: 24 };

/** Types `digits` into `name` from empty, returning each step's entry and whether it advanced. */
function typeAll(name, digits, context = h24) {
  const steps = [];
  let typed = "";

  for (const digit of digits) {
    const result = unit.typeDigit(name, typed, digit, context);

    if (result === null) {
      steps.push(null);
      continue;
    }

    typed = result.typed;
    steps.push(`${result.entry}${result.advance ? ">" : ""}`);
  }

  return steps;
}

// Typing: a unit advances once no further digit could fit; a leading zero waits; a digit past
// the maximum starts over; a full-width zero where 0 isn't a value is ignored.
{
  assert.deepEqual(typeAll("year", "2026"), ["2", "20", "202", "2026>"]);
  assert.deepEqual(typeAll("year", "0001"), ["0", "00", "000", "0001>"]);
  assert.deepEqual(typeAll("year", "0000"), ["0", "00", "000", null]);

  for (const digit of "23456789") {
    assert.deepEqual(typeAll("month", digit), [`0${digit}>`], `month ${digit} advances`);
  }

  assert.deepEqual(typeAll("month", "1"), ["01"], "month 1 waits for 10–12");
  assert.deepEqual(typeAll("month", "12"), ["01", "12>"]);
  assert.deepEqual(typeAll("month", "13"), ["01", "03>"], "13 starts over with 3");
  assert.deepEqual(typeAll("month", "0"), ["0"], "a leading zero waits as typed");
  assert.deepEqual(typeAll("month", "07"), ["0", "07>"]);
  assert.deepEqual(typeAll("month", "00"), ["0", null], "month 00 is ignored");

  for (const digit of "456789") {
    assert.deepEqual(typeAll("day", digit), [`0${digit}>`], `day ${digit} advances`);
  }

  assert.deepEqual(typeAll("day", "3"), ["03"], "day 3 waits for 30–31");
  assert.deepEqual(typeAll("day", "31"), ["03", "31>"], "31 is typed whatever the month");
  assert.deepEqual(typeAll("day", "35"), ["03", "05>"]);
  assert.deepEqual(typeAll("day", "00"), ["0", null]);

  assert.deepEqual(typeAll("hour", "1", h12), ["01"], "12-hour 1 waits for 10–12");
  assert.deepEqual(typeAll("hour", "2", h12), ["02>"]);
  assert.deepEqual(typeAll("hour", "13", h12), ["01", "03>"]);
  assert.deepEqual(typeAll("hour", "00", h12), ["0", null], "12-hour has no 0");
  assert.deepEqual(typeAll("hour", "0", h24), ["00"], "24-hour 0 is midnight, waiting");
  assert.deepEqual(typeAll("hour", "2", h24), ["02"], "24-hour 2 waits for 20–23");
  assert.deepEqual(typeAll("hour", "3", h24), ["03>"]);
  assert.deepEqual(typeAll("hour", "23", h24), ["02", "23>"]);
  assert.deepEqual(typeAll("hour", "24", h24), ["02", "04>"]);

  for (const name of ["minute", "second"]) {
    assert.deepEqual(typeAll(name, "5"), ["05"], `${name} 5 waits`);
    assert.deepEqual(typeAll(name, "6"), ["06>"], `${name} 6 advances`);
    assert.deepEqual(typeAll(name, "00"), ["00", "00>"], `${name} 00 is a value`);
    assert.deepEqual(typeAll(name, "59"), ["05", "59>"]);
  }

  assert.equal(unit.typeDigit("dayPeriod", "", "1", h12), null, "the day period takes no digit");

  // A full unit starts over on the next digit (the last segment, with nowhere to advance).
  assert.deepEqual(unit.typeDigit("day", "31", "2", h24), {
    entry: "02",
    typed: "2",
    advance: false,
  });
}

// Values: a unit holds a number only once complete.
{
  assert.equal(unit.unitValue("year", "2026"), 2026);
  assert.equal(unit.unitValue("year", "202"), null, "a year needs four digits");
  assert.equal(unit.unitValue("month", "0"), null, "a waiting zero is no value");
  assert.equal(unit.unitValue("month", "07"), 7);
  assert.equal(unit.unitValue("day", ""), null);
  assert.equal(unit.unitValue("minute", "00"), 0);
  assert.equal(unit.unitValue("dayPeriod", "am"), 0);
  assert.equal(unit.unitValue("dayPeriod", "pm"), 1);
  assert.equal(unit.unitValue("dayPeriod", ""), null);
  assert.equal(unit.unitWidth("year"), 4);

  for (const name of ["month", "day", "hour", "minute", "second", "dayPeriod"]) {
    assert.equal(unit.unitWidth(name), 2);
  }
}

// Bounds: a day ends at the draft month's length, February 29 while the year is empty.
{
  assert.deepEqual(unit.unitBounds("day", {}, h24), { min: 1, max: 31 });
  assert.deepEqual(unit.unitBounds("day", { month: "04" }, h24), { min: 1, max: 30 });
  assert.deepEqual(unit.unitBounds("day", { month: "02" }, h24), { min: 1, max: 29 });
  assert.deepEqual(unit.unitBounds("day", { year: "2026", month: "02" }, h24), { min: 1, max: 28 });
  assert.deepEqual(unit.unitBounds("day", { year: "2028", month: "02" }, h24), { min: 1, max: 29 });
  assert.deepEqual(unit.unitBounds("day", { year: "202", month: "02" }, h24), { min: 1, max: 29 });
  assert.deepEqual(unit.unitBounds("year", {}, h24), { min: 1, max: 9999 });
  assert.deepEqual(unit.unitBounds("month", {}, h24), { min: 1, max: 12 });
  assert.deepEqual(unit.unitBounds("hour", {}, h12), { min: 1, max: 12 });
  assert.deepEqual(unit.unitBounds("hour", {}, h24), { min: 0, max: 23 });
  assert.deepEqual(unit.unitBounds("minute", {}, h24), { min: 0, max: 59 });
  assert.deepEqual(unit.unitBounds("second", {}, h24), { min: 0, max: 59 });
  assert.deepEqual(unit.unitBounds("dayPeriod", {}, h12), { min: 0, max: 1 });
}

// Stepping: ±1 wrapping within the unit, no carry; empty starts at the minimum (Up) or maximum
// (Down), an empty year at the current year either way.
{
  const step = (name, draft, delta, context = h24) =>
    unit.stepUnit(name, draft, delta, context, 2026);

  assert.equal(step("year", {}, 1), "2026");
  assert.equal(step("year", {}, -1), "2026");
  assert.equal(step("year", { year: "2026" }, 1), "2027");
  assert.equal(step("year", { year: "9999" }, 1), "0001");
  assert.equal(step("year", { year: "0001" }, -1), "9999");
  assert.equal(step("year", { year: "202" }, 1), "0203", "a year being typed steps from it");
  assert.equal(step("month", {}, 1), "01");
  assert.equal(step("month", {}, -1), "12");
  assert.equal(step("month", { month: "12" }, 1), "01", "no carry into the year");
  assert.equal(step("month", { month: "0" }, 1), "01", "a waiting zero is empty");
  assert.equal(step("day", { month: "02", year: "2026" }, -1), "28");
  assert.equal(step("day", { day: "28", month: "02", year: "2026" }, 1), "01");
  assert.equal(step("day", { day: "31", month: "02", year: "2026" }, -1), "28");
  assert.equal(step("day", { day: "31", month: "02", year: "2026" }, 1), "01");
  assert.equal(step("day", { day: "31" }, 1), "01", "else 31");
  assert.equal(step("hour", {}, 1, h12), "01");
  assert.equal(step("hour", {}, -1, h12), "12");
  assert.equal(step("hour", { hour: "12" }, 1, h12), "01");
  assert.equal(step("hour", {}, 1, h24), "00");
  assert.equal(step("hour", { hour: "23" }, 1, h24), "00");
  assert.equal(step("hour", { hour: "00" }, -1, h24), "23");

  for (const name of ["minute", "second"]) {
    assert.equal(step(name, {}, 1), "00");
    assert.equal(step(name, {}, -1), "59");
    assert.equal(step(name, { [name]: "59" }, 1), "00");
  }

  assert.equal(step("dayPeriod", {}, 1, h12), "am");
  assert.equal(step("dayPeriod", {}, -1, h12), "pm");
  assert.equal(step("dayPeriod", { dayPeriod: "am" }, 1, h12), "pm");
  assert.equal(step("dayPeriod", { dayPeriod: "pm" }, 1, h12), "am");
  assert.equal(step("dayPeriod", { dayPeriod: "pm" }, -1, h12), "am");
}

// Home and End.
{
  assert.equal(unit.edgeUnit("year", {}, "min", h24), "0001");
  assert.equal(unit.edgeUnit("year", {}, "max", h24), "9999");
  assert.equal(unit.edgeUnit("day", { month: "04" }, "max", h24), "30");
  assert.equal(unit.edgeUnit("month", {}, "max", h24), "12");
  assert.equal(unit.edgeUnit("hour", {}, "min", h12), "01");
  assert.equal(unit.edgeUnit("hour", {}, "max", h24), "23");
  assert.equal(unit.edgeUnit("minute", {}, "max", h24), "59");
  assert.equal(unit.edgeUnit("second", {}, "min", h24), "00");
  assert.equal(unit.edgeUnit("dayPeriod", {}, "max", h12), "pm");
}

// Erasing: the last significant digit goes.
{
  const erase = (name, entry, context = h24) => unit.eraseDigit(name, entry, context);

  assert.deepEqual(erase("month", "12"), { entry: "01", typed: "1", advance: false });
  assert.deepEqual(erase("month", "05"), { entry: "", typed: "", advance: false });
  assert.deepEqual(erase("month", "0"), { entry: "", typed: "", advance: false });
  assert.deepEqual(erase("year", "2026"), { entry: "202", typed: "202", advance: false });
  assert.deepEqual(erase("year", "2"), { entry: "", typed: "", advance: false });
  assert.deepEqual(erase("minute", "30"), { entry: "03", typed: "3", advance: false });
  assert.deepEqual(erase("hour", "10", h12), { entry: "01", typed: "1", advance: false });
  assert.deepEqual(erase("hour", "00", h24), { entry: "", typed: "", advance: false });
  assert.deepEqual(erase("dayPeriod", "pm", h12), { entry: "", typed: "", advance: false });
  assert.deepEqual(erase("day", ""), { entry: "", typed: "", advance: false });
}

// Day periods by their localized first letter; decimal digits of any script.
{
  assert.equal(unit.typePeriod("a", ["AM", "PM"], "en-US"), "am");
  assert.equal(unit.typePeriod("P", ["AM", "PM"], "en-US"), "pm");
  assert.equal(unit.typePeriod("x", ["AM", "PM"], "en-US"), null);
  assert.equal(unit.typePeriod("π", ["π.μ.", "μ.μ."], "el"), "am");
  assert.equal(unit.typePeriod("μ", ["π.μ.", "μ.μ."], "el"), "pm");
  assert.equal(unit.typePeriod("م", ["ص", "م"], "ar-EG"), "pm");

  const digits = { 0: 0, 7: 7, "٣": 3, "٠": 0, "۹": 9, "１": 1, "०": 0, "𝟗": 9, "𝟬": 0 };

  for (const [character, value] of Object.entries(digits)) {
    assert.equal(unit.digitValue(character), value, `${character} is ${value}`);
  }

  for (const character of ["a", "x", "½", "²", "-", "", "12"]) {
    assert.equal(unit.digitValue(character), null, `${JSON.stringify(character)} is no digit`);
  }
}

// The date value shape: canonical days format to padded units; drafts parse to a value, null,
// dateIncomplete or dateInvalid.
{
  assert.deepEqual(dateValue.units(), ["year", "month", "day"]);
  assert.deepEqual(dateValue.format("2026-10-27"), { year: "2026", month: "10", day: "27" });
  assert.deepEqual(dateValue.format("0026-01-05"), { year: "0026", month: "01", day: "05" });

  for (const text of [null, "27/10/2026", "2026-02-31", "2026-1-07"]) {
    assert.deepEqual(dateValue.format(text), {}, `${JSON.stringify(text)} shows empty`);
  }

  assert.deepEqual(dateValue.parse({}), { value: null });
  assert.deepEqual(dateValue.parse({ year: "", month: "", day: "" }), { value: null });
  assert.deepEqual(dateValue.parse({ year: "2026", month: "10", day: "27" }), {
    value: "2026-10-27",
  });
  assert.deepEqual(dateValue.parse({ year: "2026", month: "02", day: "31" }), {
    error: { kind: "dateInvalid" },
  });
  assert.deepEqual(dateValue.parse({ year: "2028", month: "02", day: "29" }), {
    value: "2028-02-29",
  });

  for (const draft of [
    { year: "2026", month: "10", day: "" },
    { year: "2026", month: "0", day: "27" },
    { year: "202", month: "10", day: "27" },
    { day: "27" },
  ]) {
    assert.deepEqual(dateValue.parse(draft), { error: { kind: "dateIncomplete" } });
  }

  assert.equal(dateValue.canonical("2026-10-27"), "2026-10-27");
  assert.equal(dateValue.canonical("2026-02-31"), null);
  assert.equal(dateValue.canonical("10/27/2026"), null);
}

// The time value shape: canonical times at either precision format to padded units in the
// resolved hour cycle; drafts parse to the root's precision, null or timeIncomplete.
{
  const precision = { value: "minute" };
  const time = timeValue(() => precision.value);

  assert.deepEqual(time.units(), ["hour", "minute"]);
  // Minute precision leaves a value's second out of the draft.
  assert.deepEqual(time.format("09:30", h24), { hour: "09", minute: "30" });
  assert.deepEqual(time.format("09:30:15", h24), { hour: "09", minute: "30" });
  assert.deepEqual(time.format("13:05", h12), { hour: "01", minute: "05", dayPeriod: "pm" });
  assert.deepEqual(time.format("00:00", h12), { hour: "12", minute: "00", dayPeriod: "am" });
  assert.deepEqual(time.format("12:00", h12), { hour: "12", minute: "00", dayPeriod: "pm" });
  assert.deepEqual(time.format("11:59:59", h12), { hour: "11", minute: "59", dayPeriod: "am" });

  for (const text of [
    null,
    "9:30",
    "24:00",
    "09:60",
    "09:30:60",
    "09:30:1",
    "0930",
    " 09:30",
    "٠٩:٣٠",
  ]) {
    assert.deepEqual(time.format(text, h24), {}, `${JSON.stringify(text)} shows empty`);
  }

  // Minute precision: a second in the draft never reaches the value.
  assert.deepEqual(time.parse({ hour: "09", minute: "45", second: "15" }, h24), { value: "09:45" });
  assert.deepEqual(time.parse({ hour: "23", minute: "59" }, h24), { value: "23:59" });
  assert.deepEqual(time.parse({ hour: "00", minute: "00" }, h24), { value: "00:00" });
  assert.deepEqual(time.parse({ hour: "12", minute: "00", dayPeriod: "am" }, h12), {
    value: "00:00",
  });
  assert.deepEqual(time.parse({ hour: "12", minute: "00", dayPeriod: "pm" }, h12), {
    value: "12:00",
  });
  assert.deepEqual(time.parse({ hour: "01", minute: "30", dayPeriod: "pm" }, h12), {
    value: "13:30",
  });
  assert.deepEqual(time.parse({ hour: "11", minute: "59", dayPeriod: "am" }, h12), {
    value: "11:59",
  });
  assert.deepEqual(time.parse({}, h24), { value: null });
  assert.deepEqual(time.parse({ second: "15" }, h24), { value: null }, "a hidden second is empty");
  assert.deepEqual(time.parse({ hour: "", minute: "", dayPeriod: "" }, h12), { value: null });

  for (const [draft, context] of [
    [{ hour: "09" }, h24],
    [{ hour: "09", minute: "3" }, h24],
    [{ hour: "0", minute: "30", dayPeriod: "am" }, h12],
    [{ hour: "09", minute: "30" }, h12],
    [{ dayPeriod: "pm" }, h12],
  ]) {
    assert.deepEqual(time.parse(draft, context), { error: { kind: "timeIncomplete" } });
  }

  precision.value = "second";
  assert.deepEqual(time.units(), ["hour", "minute", "second"]);
  // Second precision shows a minute value's second as 00.
  assert.deepEqual(time.format("09:30", h24), { hour: "09", minute: "30", second: "00" });
  assert.deepEqual(time.format("23:30:15", h12), {
    hour: "11",
    minute: "30",
    second: "15",
    dayPeriod: "pm",
  });
  assert.deepEqual(time.parse({ hour: "09", minute: "30", second: "00" }, h24), {
    value: "09:30:00",
  });
  assert.deepEqual(time.parse({ hour: "12", minute: "00", second: "05", dayPeriod: "am" }, h12), {
    value: "00:00:05",
  });
  assert.deepEqual(time.parse({ hour: "09", minute: "30" }, h24), {
    error: { kind: "timeIncomplete" },
  });
  assert.deepEqual(time.parse({ second: "15" }, h24), { error: { kind: "timeIncomplete" } });

  for (const text of ["00:00", "23:59", "09:30:15", "23:59:59"]) {
    assert.equal(time.canonical(text), text);
  }

  for (const text of ["24:00", "9:30", "09:30:", "09.30", "noon"]) {
    assert.equal(time.canonical(text), null, `${text} is no time`);
  }
}

// The shared halves: a draft's fill, the time's 12-hour conversion both ways and its canonical
// text, the date's draft and day.
{
  const units = ["year", "hour", "dayPeriod"];

  assert.equal(unit.draftFill({}, units), "empty");
  assert.equal(unit.draftFill({ year: "", hour: "", dayPeriod: "" }, units), "empty");
  assert.equal(unit.draftFill({ year: "2026", hour: "09", dayPeriod: "am" }, units), "complete");
  assert.equal(unit.draftFill({ year: "2026", hour: "09" }, units), "incomplete");
  assert.equal(unit.draftFill({ year: "202", hour: "09", dayPeriod: "am" }, units), "incomplete");
  assert.equal(unit.draftFill({ hour: "0" }, units), "incomplete", "a lone 0 isn't empty");
  assert.equal(unit.draftFill({ minute: "30" }, units), "empty", "only the given units count");

  assert.equal(wallTime.timeUnits("minute"), wallTime.timeUnits("minute"), "the same array");
  assert.deepEqual(wallTime.timeUnits("second"), ["hour", "minute", "second"]);
  assert.deepEqual(wallTime.timeDraftUnits("minute", 12), ["hour", "minute", "dayPeriod"]);
  assert.deepEqual(wallTime.timeDraftUnits("second", 24), ["hour", "minute", "second"]);
  assert.deepEqual(wallTime.readTime("09:30"), { hour: "09", minute: "30", second: null });
  assert.deepEqual(wallTime.readTime("23:59:59"), { hour: "23", minute: "59", second: "59" });

  for (const text of ["24:00", "9:30", "09:30Z", "09:30+03:00", "09:30:00.000", "T09:30"]) {
    assert.equal(wallTime.readTime(text), null, `${text} is no time`);
  }

  // 12-hour display: 0 → 12 AM, 12 → 12 PM, 13 → 1 PM, 23 → 11 PM; and back.
  for (const [hour, shown, dayPeriod] of [
    ["00", "12", "am"],
    ["01", "01", "am"],
    ["11", "11", "am"],
    ["12", "12", "pm"],
    ["13", "01", "pm"],
    ["23", "11", "pm"],
  ]) {
    const time = { hour, minute: "05", second: null };
    const draft = wallTime.formatTime(time, "minute", 12);

    assert.deepEqual(draft, { hour: shown, minute: "05", dayPeriod });
    assert.equal(wallTime.writeTime(draft, "minute", 12), `${hour}:05`);
    assert.deepEqual(wallTime.formatTime(time, "minute", 24), { hour, minute: "05" });
    assert.equal(wallTime.writeTime({ hour, minute: "05" }, "minute", 24), `${hour}:05`);
  }

  assert.deepEqual(
    wallTime.formatTime({ hour: "09", minute: "30", second: null }, "second", 24),
    { hour: "09", minute: "30", second: "00" },
    "second precision shows a missing second as 00",
  );
  assert.deepEqual(
    wallTime.formatTime({ hour: "09", minute: "30", second: "15" }, "minute", 24),
    { hour: "09", minute: "30" },
    "minute precision leaves the second out",
  );
  assert.equal(
    wallTime.writeTime({ hour: "09", minute: "30", second: "15" }, "minute", 24),
    "09:30",
  );
  assert.equal(
    wallTime.writeTime({ hour: "12", minute: "00", second: "05", dayPeriod: "am" }, "second", 12),
    "00:00:05",
  );

  assert.deepEqual(formatDate("2026-10-27"), { year: "2026", month: "10", day: "27" });
  assert.deepEqual(formatDate("2026-02-31"), {});
  assert.equal(writeDate({ year: "2026", month: "02", day: "28" }), "2026-02-28");
  assert.equal(writeDate({ year: "2026", month: "02", day: "31" }), null);
  assert.equal(writeDate({ year: "2028", month: "02", day: "29" }), "2028-02-29");
}

// The date-time value shape: the date half and the time half, composed; no zone is ever read or
// written, and a value carrying one isn't canonical.
{
  const precision = { value: "minute" };
  const dateTime = dateTimeValue(() => precision.value);

  assert.deepEqual(dateTime.units(), ["year", "month", "day", "hour", "minute"]);
  assert.equal(dateTime.units(), dateTime.units(), "the same array while the precision stays");
  assert.deepEqual(dateTime.format("2026-10-27T09:30", h24), {
    year: "2026",
    month: "10",
    day: "27",
    hour: "09",
    minute: "30",
  });
  assert.deepEqual(dateTime.format("2026-10-27T00:05:59", h12), {
    year: "2026",
    month: "10",
    day: "27",
    hour: "12",
    minute: "05",
    dayPeriod: "am",
  });

  for (const text of [
    null,
    "2026-10-27",
    "09:30",
    "2026-10-27T09:30Z",
    "2026-10-27T09:30:00Z",
    "2026-10-27T09:30+03:00",
    "2026-10-27T09:30:00.000",
    "2026-10-27t09:30",
    "2026-10-27 09:30",
    "2026-10-27T9:30",
    "2026-10-27T24:00",
    "2026-02-31T09:30",
    "0000-01-01T00:00",
    "26-10-27T09:30",
    "2026-10-27TT09:30",
    "2026-10-27T09:30T",
  ]) {
    assert.deepEqual(dateTime.format(text, h24), {}, `${JSON.stringify(text)} shows empty`);
    assert.equal(dateTime.canonical(text ?? ""), null, `${JSON.stringify(text)} isn't canonical`);
  }

  const complete = { year: "2026", month: "10", day: "27", hour: "09", minute: "30" };

  assert.deepEqual(dateTime.parse({}, h24), { value: null });
  assert.deepEqual(dateTime.parse({ second: "15" }, h24), { value: null });
  assert.deepEqual(dateTime.parse(complete, h24), { value: "2026-10-27T09:30" });
  assert.deepEqual(dateTime.parse({ ...complete, second: "15" }, h24), {
    value: "2026-10-27T09:30",
  });
  assert.deepEqual(dateTime.parse({ ...complete, hour: "12", dayPeriod: "am" }, h12), {
    value: "2026-10-27T00:30",
  });
  assert.deepEqual(dateTime.parse({ ...complete, hour: "01", dayPeriod: "pm" }, h12), {
    value: "2026-10-27T13:30",
  });
  assert.deepEqual(dateTime.parse({ ...complete, month: "02", day: "31" }, h24), {
    error: { kind: "dateInvalid" },
  });
  assert.deepEqual(dateTime.parse({ ...complete, year: "2028", month: "02", day: "29" }, h24), {
    value: "2028-02-29T09:30",
  });

  for (const [draft, context] of [
    [{ ...complete, hour: "", minute: "" }, h24],
    [{ ...complete, year: "", month: "", day: "" }, h24],
    [{ ...complete, year: "202" }, h24],
    [{ ...complete, minute: "3" }, h24],
    [complete, h12],
    [{ dayPeriod: "pm" }, h12],
    [{ ...complete, month: "02", day: "31", minute: "" }, h24],
  ]) {
    assert.deepEqual(dateTime.parse(draft, context), { error: { kind: "dateTimeIncomplete" } });
  }

  for (const text of ["2026-10-27T09:30", "0001-01-01T00:00", "9999-12-31T23:59:59"]) {
    assert.equal(dateTime.canonical(text), text);
  }

  precision.value = "second";
  assert.deepEqual(dateTime.units(), ["year", "month", "day", "hour", "minute", "second"]);
  assert.deepEqual(dateTime.format("2026-10-27T09:30", h24), {
    ...complete,
    second: "00",
  });
  assert.deepEqual(dateTime.parse({ ...complete, second: "05" }, h24), {
    value: "2026-10-27T09:30:05",
  });
  assert.deepEqual(dateTime.parse(complete, h24), { error: { kind: "dateTimeIncomplete" } });
}

// Layout: order, literals, unit names and digits from Node's Intl; the seed round-trips and
// rejects anything that isn't a complete layout.
{
  const date = { units: ["year", "month", "day"], hourCycle: null };
  const types = (resolved) => resolved.parts.map((part) => part.type);
  const enUS = layout.resolveLayout("en-US", date);
  const el = layout.resolveLayout("el", date);
  const arEG = layout.resolveLayout("ar-EG", date);

  assert.deepEqual(types(enUS), ["month", "literal", "day", "literal", "year"]);
  assert.deepEqual(enUS.labels, { month: "month", day: "day", year: "year" });
  assert.equal(enUS.parts[1].text, "/");
  assert.equal(enUS.digits, "0123456789");
  assert.equal(enUS.hourCycle, null);
  assert.equal(enUS.periods, null);
  assert.equal(enUS.locale, "en-US");
  assert.deepEqual(types(el), ["day", "literal", "month", "literal", "year"]);
  assert.equal(el.labels.day, "ημέρα");
  assert.deepEqual(types(arEG), ["day", "literal", "month", "literal", "year"]);
  assert.equal(arEG.parts[1].text, "‏/");
  assert.equal(arEG.digits, "٠١٢٣٤٥٦٧٨٩");
  assert.equal(arEG.labels.month, "الشهر");

  const time = { units: ["hour", "minute"], hourCycle: null };
  const time12 = layout.resolveLayout("en-US", time);

  assert.equal(time12.hourCycle, 12);
  assert.deepEqual(types(time12), ["hour", "literal", "minute", "literal", "dayPeriod"]);
  assert.deepEqual(time12.periods, ["AM", "PM"]);
  assert.equal(time12.labels.hour, "hour");
  assert.equal(time12.labels.dayPeriod, "AM/PM");
  assert.equal(time12.parts[3].text, "\u202f", "Node puts U+202F before the day period");

  const timeEl = layout.resolveLayout("el", time);

  assert.equal(timeEl.hourCycle, 12);
  assert.deepEqual(types(timeEl), ["hour", "literal", "minute", "literal", "dayPeriod"]);
  assert.deepEqual(timeEl.periods, ["π.μ.", "μ.μ."]);
  assert.deepEqual(timeEl.labels, {
    hour: "ώρα",
    minute: "λεπτό",
    dayPeriod: "π.μ./μ.μ.",
  });

  const timeGB = layout.resolveLayout("en-GB", time);

  assert.equal(timeGB.hourCycle, 24);
  assert.deepEqual(types(timeGB), ["hour", "literal", "minute"]);
  assert.equal(timeGB.periods, null);

  const timeGB12 = layout.resolveLayout("en-GB", { ...time, hourCycle: 12 });

  assert.equal(timeGB12.hourCycle, 12);
  assert.deepEqual(types(timeGB12), ["hour", "literal", "minute", "literal", "dayPeriod"]);
  assert.deepEqual(timeGB12.periods, ["am", "pm"]);
  assert.deepEqual(
    types(layout.resolveLayout("en-US", { units: ["hour", "minute", "second"], hourCycle: null })),
    ["hour", "literal", "minute", "literal", "second", "literal", "dayPeriod"],
  );

  const seconds24 = { units: ["hour", "minute", "second"], hourCycle: 24 };
  const time24 = layout.resolveLayout("en-US", seconds24);

  assert.equal(time24.hourCycle, 24);
  assert.deepEqual(types(time24), ["hour", "literal", "minute", "literal", "second"]);
  assert.equal(time24.periods, null);
  assert.equal(
    layout.resolveLayout("el", { units: ["hour", "minute"], hourCycle: 24 }).hourCycle,
    24,
  );
  assert.equal(
    layout.resolveLayout("en-GB", { units: ["hour", "minute"], hourCycle: null }).hourCycle,
    24,
  );

  // A date-time: one formatToParts over both halves, so the locale orders them and the literal
  // between them.
  const dateTime = { units: ["year", "month", "day", "hour", "minute"], hourCycle: null };
  const dateTimeUS = layout.resolveLayout("en-US", dateTime);
  const dateTimeEl = layout.resolveLayout("el", dateTime);
  const dateTimeGB = layout.resolveLayout("en-GB", dateTime);
  const dateTimeKo = layout.resolveLayout("ko", dateTime);

  assert.deepEqual(types(dateTimeUS), [
    "month",
    "literal",
    "day",
    "literal",
    "year",
    "literal",
    "hour",
    "literal",
    "minute",
    "literal",
    "dayPeriod",
  ]);
  assert.equal(dateTimeUS.parts[5].text, ", ");
  assert.equal(dateTimeUS.parts[9].text, "\u202f", "Node puts U+202F before the day period");
  assert.equal(dateTimeUS.hourCycle, 12);
  assert.deepEqual(dateTimeUS.periods, ["AM", "PM"]);
  assert.deepEqual(types(dateTimeEl), [
    "day",
    "literal",
    "month",
    "literal",
    "year",
    "literal",
    "hour",
    "literal",
    "minute",
    "literal",
    "dayPeriod",
  ]);
  assert.deepEqual(dateTimeEl.periods, ["π.μ.", "μ.μ."]);
  assert.deepEqual(types(dateTimeGB), [
    "day",
    "literal",
    "month",
    "literal",
    "year",
    "literal",
    "hour",
    "literal",
    "minute",
  ]);
  assert.equal(dateTimeGB.hourCycle, 24);
  assert.equal(dateTimeGB.parts[5].text, ", ");
  // Korean puts the day period before the hour.
  assert.deepEqual(types(dateTimeKo).slice(5), [
    "literal",
    "dayPeriod",
    "literal",
    "hour",
    "literal",
    "minute",
  ]);
  assert.deepEqual(
    types(
      layout.resolveLayout("en-GB", {
        ...dateTime,
        units: [...dateTime.units, "second"],
        hourCycle: 12,
      }),
    ),
    [
      "day",
      "literal",
      "month",
      "literal",
      "year",
      "literal",
      "hour",
      "literal",
      "minute",
      "literal",
      "second",
      "literal",
      "dayPeriod",
    ],
  );

  for (const [resolved, request] of [
    [dateTimeUS, dateTime],
    [dateTimeEl, dateTime],
    [dateTimeGB, dateTime],
    [dateTimeKo, dateTime],
    [enUS, date],
    [el, date],
    [arEG, date],
    [time12, time],
    [time24, seconds24],
    [timeEl, time],
    [timeGB, time],
    [timeGB12, { ...time, hourCycle: 12 }],
  ]) {
    assert.deepEqual(layout.readLayout(layout.writeLayout(resolved), request), resolved);
  }

  // Every numbering system Intl renders with ten digits of its own round-trips, consecutive code
  // points or not (Han `hanidec`); an algorithmic one renders Latin digits, covered by en-US.
  let ownDigits = 0;

  for (const numberingSystem of Intl.supportedValuesOf("numberingSystem")) {
    const number = new Intl.NumberFormat("en", { numberingSystem, useGrouping: false });

    if (number.resolvedOptions().numberingSystem !== numberingSystem) {
      continue;
    }

    let digits = "";

    for (let digit = 0; digit <= 9; digit += 1) {
      digits += number.format(digit);
    }

    if (numberingSystem !== "latn" && digits === "0123456789") {
      continue;
    }

    const resolved = layout.resolveLayout(`en-US-u-nu-${numberingSystem}`, date);

    ownDigits += 1;
    assert.equal(resolved.digits, digits, numberingSystem);
    assert.deepEqual(
      layout.readLayout(layout.writeLayout(resolved), date),
      resolved,
      `${numberingSystem} round-trips`,
    );
  }

  assert.ok(ownDigits > 50, `${ownDigits} numbering systems with their own digits`);

  const hanidec = layout.resolveLayout("zh-u-nu-hanidec", date);

  assert.equal(hanidec.digits, "〇一二三四五六七八九");
  assert.deepEqual(types(hanidec), ["year", "literal", "month", "literal", "day"]);
  assert.deepEqual(layout.readLayout(layout.writeLayout(hanidec), date), hanidec);

  // A seed is untrusted: anything this runtime's Intl couldn't have laid out for the root reads
  // as null, and the root lays out locally.
  const seed = JSON.parse(layout.writeLayout(el));
  const [day, dot, month, , year] = seed.parts;
  const timeSeed = JSON.parse(layout.writeLayout(time12));

  for (const broken of [
    null,
    "",
    "{",
    "[]",
    JSON.stringify({ ...seed, locale: 1 }),
    JSON.stringify({ ...seed, locale: "" }),
    JSON.stringify({ ...seed, locale: "not_a_locale" }),
    JSON.stringify({ ...seed, digits: "0123" }),
    JSON.stringify({ ...seed, digits: "aaaaaaaaaa" }),
    JSON.stringify({ ...seed, digits: "0000000000" }),
    JSON.stringify({ ...seed, digits: "9876543210" }),
    JSON.stringify({ ...seed, digits: "01234٥٦٧٨٩" }),
    JSON.stringify({ ...seed, digits: "abcdefghij" }),
    JSON.stringify({ ...seed, digits: "ABCDEFGHIJ" }),
    JSON.stringify({ ...seed, digits: "01234567890" }),
    JSON.stringify({ ...seed, digits: " \t\n\r\u0000\u0001\u0002\u0003\u0004\u0005" }),
    JSON.stringify({
      ...seed,
      digits: "0\u03011\u03012\u03013\u03014\u03015\u03016\u03017\u03018\u03019\u0301",
    }),
    JSON.stringify({ ...seed, digits: "〇〇二三四五六七八九" }),
    JSON.stringify({ ...seed, digits: "九八七六五四三二一〇" }),
    JSON.stringify({ ...seed, digits: "〇一二三四五六七八" }),
    JSON.stringify({ ...seed, digits: "〇一二三四五六七八九十" }),
    JSON.stringify({ ...seed, digits: "〇一二三四56789" }),
    JSON.stringify({ ...seed, hourCycle: 13 }),
    JSON.stringify({ ...seed, hourCycle: 24 }),
    JSON.stringify({ ...seed, parts: [] }),
    JSON.stringify({ ...seed, parts: [day, dot, month] }),
    JSON.stringify({ ...seed, parts: [day, dot, month, dot, year, dot, day] }),
    JSON.stringify({
      ...seed,
      parts: [day, dot, month, dot, year, dot, { type: "hour", text: "" }],
      labels: { ...seed.labels, hour: "ώρα" },
    }),
    JSON.stringify({ ...seed, parts: [{ type: "week", text: "" }] }),
    JSON.stringify({ ...seed, parts: [null] }),
    JSON.stringify({ ...seed, labels: {} }),
    JSON.stringify({ ...seed, periods: ["AM", "PM"] }),
  ]) {
    assert.equal(layout.readLayout(broken, date), null, `${broken} is no date seed`);
  }

  assert.equal(
    layout.readLayout(JSON.stringify(timeSeed), date),
    null,
    "a time seed is no date seed",
  );
  assert.equal(
    layout.readLayout(JSON.stringify(timeSeed), { ...time, hourCycle: 24 }),
    null,
    "a 12-hour seed is no forced 24-hour seed",
  );

  for (const broken of [
    JSON.stringify({ ...timeSeed, periods: null }),
    JSON.stringify({ ...timeSeed, periods: ["AM"] }),
    JSON.stringify({ ...timeSeed, hourCycle: 24, periods: null }),
    JSON.stringify({ ...timeSeed, hourCycle: null, periods: null }),
    JSON.stringify({ ...timeSeed, parts: timeSeed.parts.slice(0, 3) }),
  ]) {
    assert.equal(layout.readLayout(broken, time), null, `${broken} is no time seed`);
  }

  // A date-time seed lays out the date and the time units: a date or a time seed isn't one, and
  // neither is one missing a date unit or carrying the other cycle.
  const dateTimeSeed = JSON.parse(layout.writeLayout(dateTimeUS));

  assert.equal(layout.readLayout(JSON.stringify(timeSeed), dateTime), null, "a time seed");
  assert.equal(layout.readLayout(layout.writeLayout(enUS), dateTime), null, "a date seed");
  assert.equal(layout.readLayout(JSON.stringify(dateTimeSeed), time), null, "no time seed");
  assert.equal(layout.readLayout(JSON.stringify(dateTimeSeed), date), null, "no date seed");
  assert.equal(
    layout.readLayout(JSON.stringify(dateTimeSeed), { ...dateTime, hourCycle: 24 }),
    null,
    "a 12-hour date-time seed is no forced 24-hour one",
  );
  assert.equal(
    layout.readLayout(
      JSON.stringify({ ...dateTimeSeed, parts: dateTimeSeed.parts.slice(2) }),
      dateTime,
    ),
    null,
    "a date-time seed without its month",
  );

  // A seed lays out exactly the root's precision.
  assert.equal(
    layout.readLayout(JSON.stringify(timeSeed), {
      units: ["hour", "minute", "second"],
      hourCycle: null,
    }),
    null,
    "a minute seed is no second seed",
  );
  assert.equal(
    layout.readLayout(layout.writeLayout(time24), { units: ["hour", "minute"], hourCycle: 24 }),
    null,
    "a second seed is no minute seed",
  );
}

console.log("Date field segment engine, value shape and layout checks passed.");
