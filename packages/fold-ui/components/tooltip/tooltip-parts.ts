import { Tooltip } from "./tooltip";
import { TooltipContent } from "./tooltip-content";
import { TooltipTrigger } from "./tooltip-trigger";

/** Every Tooltip part, for a component's `imports`. */
export const TooltipParts = [Tooltip, TooltipTrigger, TooltipContent] as const;
