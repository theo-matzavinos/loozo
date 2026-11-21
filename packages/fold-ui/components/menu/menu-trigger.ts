import { Directive } from "@angular/core";
import { OrigamiMenuTrigger } from "@loozo/origami-ui/menu";
import { ButtonStyle } from "../button";

/**
 * Opens and closes the Menu, which it also anchors and names. Styled like a Button: `variant`,
 * `size` and `class`. Give an icon-only Trigger an `aria-label`.
 */
@Directive({
  selector: "button[fold__MenuTrigger]",
  hostDirectives: [
    { directive: OrigamiMenuTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
    { directive: ButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "menu-trigger" },
})
export class MenuTrigger {}
