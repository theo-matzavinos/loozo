import { Calendar } from "../calendar";
import { DateFieldInput } from "../date-field";
import { DatePicker } from "./date-picker";
import { DatePickerContent } from "./date-picker-content";
import { DatePickerTrigger } from "./date-picker-trigger";

/** Every DatePicker part, with the field shape's DateFieldInput and the Calendar, for `imports`. */
export const DatePickerParts = [
  DatePicker,
  DateFieldInput,
  DatePickerTrigger,
  DatePickerContent,
  Calendar,
] as const;
