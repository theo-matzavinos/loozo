import { Directive } from "@angular/core";

/**
 * A divider between items in a Menu's Content: `role="separator"`. It is never focused and never
 * searched by typeahead, and arrows skip it. It has no inputs; the consumer styles it.
 *
 * @example
 * ```html
 * <div ogMenuSeparator></div>
 * ```
 */
@Directive({
  selector: "[ogMenuSeparator]",
  host: { role: "separator" },
})
export class OrigamiMenuSeparator {}
