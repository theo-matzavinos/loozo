import { Popover } from "./popover";
import { PopoverContent } from "./popover-content";
import { PopoverTrigger } from "./popover-trigger";

/** Every Popover part, for a component's `imports`. */
export const PopoverParts = [Popover, PopoverTrigger, PopoverContent] as const;
