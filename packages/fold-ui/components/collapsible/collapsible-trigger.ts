import { Directive } from "@angular/core";
import { OrigamiCollapsibleTrigger } from "@loozo/origami-ui/collapsible";
import { ButtonStyle } from "../button";

/** Opens and closes the Collapsible. Styled like a Button: `variant`, `size` and `class`; bring your own icon. */
@Directive({
  selector: "button[fold__CollapsibleTrigger]",
  hostDirectives: [
    { directive: OrigamiCollapsibleTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
    { directive: ButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "collapsible-trigger" },
})
export class CollapsibleTrigger {}
