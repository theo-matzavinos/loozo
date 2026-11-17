import { Select } from "./select";
import { SelectContent } from "./select-content";
import { SelectOption } from "./select-option";
import { SelectTrigger } from "./select-trigger";

/** Every Select part, for a component's `imports`. */
export const SelectParts = [Select, SelectTrigger, SelectContent, SelectOption] as const;
