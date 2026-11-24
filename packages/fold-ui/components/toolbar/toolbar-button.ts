import { Directive } from "@angular/core";
import { OrigamiToolbarItem } from "@loozo/origami-ui/toolbar";
import { ToolbarButtonStyle } from "./toolbar-button-style";

/**
 * A command in a Toolbar over Origami's ToolbarItem. Write native `(click)`. With
 * `focusableWhenDisabled` the button stays natively enabled, so your handler runs and checks the
 * disabled state itself.
 */
@Directive({
  selector: "button[fold__ToolbarButton]",
  hostDirectives: [
    { directive: OrigamiToolbarItem, inputs: ["disabled", "focusableWhenDisabled"] },
    { directive: ToolbarButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "toolbar-button" },
})
export class ToolbarButton {}
