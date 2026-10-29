import { Directive } from "@angular/core";
import { OrigamiDialogTrigger } from "@loozo/origami-ui/dialog";
import { ButtonStyle } from "../button";

/** Opens the sheet. Styled like a Button: `variant`, `size` and `class`. */
@Directive({
  selector: "button[fold__SheetTrigger]",
  hostDirectives: [
    { directive: OrigamiDialogTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
    { directive: ButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "sheet-trigger" },
})
export class SheetTrigger {}
