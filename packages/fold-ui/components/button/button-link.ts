import { Directive } from "@angular/core";
import { ButtonStyle } from "./button-style";

/**
 * A link styled as a button. Styling only: it stays a native link, with no button behavior.
 *
 * @example
 * ```html
 * <a fold__Button variant="primary" href="/contracts/new">New contract</a>
 * ```
 */
@Directive({
  selector: "a[fold__Button]",
  hostDirectives: [{ directive: ButtonStyle, inputs: ["variant", "size", "class"] }],
  host: { "data-slot": "button" },
})
export class ButtonLink {}
