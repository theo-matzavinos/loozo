import { Directive } from "@angular/core";
import { OrigamiToastClose } from "@loozo/origami-ui/toast";
import { ButtonStyle } from "../button";

/** Closes its toast. Styled like a Button: `variant`, `size` and `class`. */
@Directive({
  selector: "button[fold__ToastClose]",
  hostDirectives: [
    { directive: OrigamiToastClose, inputs: ["disabled", "focusableWhenDisabled"] },
    { directive: ButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "toast-close" },
})
export class ToastClose {}
