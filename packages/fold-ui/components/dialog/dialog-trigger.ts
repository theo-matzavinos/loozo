import { Directive } from "@angular/core";
import { OrigamiDialogTrigger } from "@loozo/origami-ui/dialog";
import { ButtonStyle } from "../button";

/** Opens the dialog. Styled like a Button: `variant`, `size` and `class`. */
@Directive({
  selector: "button[fold__DialogTrigger]",
  hostDirectives: [
    { directive: OrigamiDialogTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
    { directive: ButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "dialog-trigger" },
})
export class DialogTrigger {}
