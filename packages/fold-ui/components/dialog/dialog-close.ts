import { Directive } from "@angular/core";
import { OrigamiDialogClose } from "@loozo/origami-ui/dialog";
import { ButtonStyle } from "../button";

/** Closes the dialog, whatever `dismissible` says. Styled like a Button (secondary by default). */
@Directive({
  selector: "button[fold__DialogClose]",
  hostDirectives: [
    { directive: OrigamiDialogClose, inputs: ["disabled", "focusableWhenDisabled"] },
    { directive: ButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "dialog-close" },
})
export class DialogClose {}
