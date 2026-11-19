import { Directive } from "@angular/core";
import { OrigamiPopoverAnchor, OrigamiPopoverTrigger } from "@loozo/origami-ui/popover";
import { ButtonStyle } from "../button";

/** Opens and closes the Popover, which it also anchors. Styled like a Button: `variant`, `size` and `class`. */
@Directive({
  selector: "button[fold__PopoverTrigger]",
  hostDirectives: [
    { directive: OrigamiPopoverTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
    OrigamiPopoverAnchor,
    { directive: ButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "popover-trigger", "aria-haspopup": "dialog" },
})
export class PopoverTrigger {}
