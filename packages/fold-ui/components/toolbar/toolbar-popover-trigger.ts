import { Directive } from "@angular/core";
import { OrigamiToolbarPopoverTrigger } from "@loozo/origami-ui/toolbar";
import { OrigamiPopoverAnchor } from "@loozo/origami-ui/popover";
import { ToolbarButtonStyle } from "./toolbar-button-style";

@Directive({
  selector: "button[fold__ToolbarPopoverTrigger]",
  hostDirectives: [
    {
      directive: OrigamiToolbarPopoverTrigger,
      inputs: ["id", "disabled", "focusableWhenDisabled"],
    },
    OrigamiPopoverAnchor,
    { directive: ToolbarButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "toolbar-popover-trigger", "aria-haspopup": "dialog" },
})
export class ToolbarPopoverTrigger {}
