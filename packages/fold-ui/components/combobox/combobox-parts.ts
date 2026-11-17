import { Combobox } from "./combobox";
import { ComboboxContent } from "./combobox-content";
import { ComboboxEmpty } from "./combobox-empty";
import { ComboboxInput } from "./combobox-input";
import { ComboboxOption } from "./combobox-option";
import { ComboboxTrigger } from "./combobox-trigger";

/** Every Combobox part, for a component's `imports`. */
export const ComboboxParts = [
  Combobox,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxOption,
  ComboboxEmpty,
] as const;
