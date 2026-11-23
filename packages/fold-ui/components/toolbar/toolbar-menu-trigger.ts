import { Directive } from "@angular/core";
import { OrigamiToolbarMenuTrigger } from "@loozo/origami-ui/toolbar";
import { ToolbarButtonStyle } from "./toolbar-button-style";

@Directive({
  selector: "button[fold__ToolbarMenuTrigger]",
  hostDirectives: [
    { directive: OrigamiToolbarMenuTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
    { directive: ToolbarButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "toolbar-menu-trigger" },
})
export class ToolbarMenuTrigger {}
