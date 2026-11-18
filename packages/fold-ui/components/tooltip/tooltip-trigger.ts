import { Directive } from "@angular/core";
import { OrigamiTooltipTrigger } from "@loozo/origami-ui/tooltip";

/**
 * Marks the element the Tooltip describes. Put it on the button itself, next to its own fold
 * directive, whose look and `data-slot` it keeps.
 */
@Directive({ selector: "[fold__TooltipTrigger]", hostDirectives: [OrigamiTooltipTrigger] })
export class TooltipTrigger {}
