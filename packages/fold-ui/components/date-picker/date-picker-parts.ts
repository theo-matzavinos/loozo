import { Calendar, CalendarMultiple, CalendarRange, MonthCalendar } from "../calendar";
import { DateFieldInput } from "../date-field";
import { DatePicker } from "./date-picker";
import { DatePickerContent } from "./date-picker-content";
import { DatePickerFooter } from "./date-picker-footer";
import { DatePickerMultiple } from "./date-picker-multiple";
import { DatePickerRange } from "./date-picker-range";
import { DatePickerTrigger } from "./date-picker-trigger";
import { DateTimePicker } from "./date-time-picker";
import { MonthPicker } from "./month-picker";

/** Every DatePicker part, with the field shape's DateFieldInput and the Calendar, for `imports`. */
export const DatePickerParts = [
  DatePicker,
  DateFieldInput,
  DatePickerTrigger,
  DatePickerContent,
  DatePickerFooter,
  Calendar,
] as const;

/** Every DatePickerMultiple part, with the CalendarMultiple, for `imports`. */
export const DatePickerMultipleParts = [
  DatePickerMultiple,
  DatePickerTrigger,
  DatePickerContent,
  DatePickerFooter,
  CalendarMultiple,
] as const;

/** Every DatePickerRange part, with the CalendarRange, for `imports`. */
export const DatePickerRangeParts = [
  DatePickerRange,
  DatePickerTrigger,
  DatePickerContent,
  DatePickerFooter,
  CalendarRange,
] as const;

/** Every MonthPicker part, with the MonthCalendar, for `imports`. */
export const MonthPickerParts = [
  MonthPicker,
  DatePickerTrigger,
  DatePickerContent,
  DatePickerFooter,
  MonthCalendar,
] as const;

/** Every DateTimePicker part, with the DateFieldInput and the Calendar, for `imports`. */
export const DateTimePickerParts = [
  DateTimePicker,
  DateFieldInput,
  DatePickerTrigger,
  DatePickerContent,
  DatePickerFooter,
  Calendar,
] as const;
