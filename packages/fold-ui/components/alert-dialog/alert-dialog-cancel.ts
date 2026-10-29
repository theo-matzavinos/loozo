import { Directive } from "@angular/core";
import { OrigamiDialogClose } from "@loozo/origami-ui/dialog";
import { ButtonStyle } from "../button";

/**
 * Closes the dialog. Styled like a Button (secondary by default) and takes initial focus, as the
 * safe choice.
 */
@Directive({
  selector: "button[fold__AlertDialogCancel]",
  hostDirectives: [
    { directive: OrigamiDialogClose, inputs: ["disabled", "focusableWhenDisabled"] },
    { directive: ButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "alert-dialog-cancel", autofocus: "" },
})
export class AlertDialogCancel {}
