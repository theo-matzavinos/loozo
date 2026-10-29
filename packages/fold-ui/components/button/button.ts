import { Directive } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";
import { ButtonStyle } from "./button-style";

/**
 * A styled native button over Origami's Button: `type="button"` and Origami's disabled
 * semantics, including `focusableWhenDisabled`.
 *
 * @example
 * ```html
 * <button fold__Button variant="primary" (click)="save()">Save</button>
 * ```
 */
@Directive({
  selector: "button[fold__Button]",
  hostDirectives: [
    { directive: OrigamiButton, inputs: ["disabled", "focusableWhenDisabled"] },
    { directive: ButtonStyle, inputs: ["variant", "size", "class"] },
  ],
  host: { "data-slot": "button" },
})
export class Button {}
