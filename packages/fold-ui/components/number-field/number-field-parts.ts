import { NumberField } from "./number-field";
import { NumberFieldAdornment } from "./number-field-adornment";
import { NumberFieldDecrement } from "./number-field-decrement";
import { NumberFieldIncrement } from "./number-field-increment";
import { NumberFieldInput } from "./number-field-input";

/** Every NumberField part, for a component's `imports`. */
export const NumberFieldParts = [
  NumberField,
  NumberFieldInput,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldAdornment,
] as const;
