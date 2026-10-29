import { Directive } from "@angular/core";
import { OrigamiAlertDialog } from "@loozo/origami-ui/dialog";

/**
 * The alert dialog root over Origami's AlertDialog. Layout-transparent (`display: contents`) unless
 * it's on the `<dialog>` itself.
 *
 * @example
 * ```html
 * <div fold__AlertDialog [(open)]="open" [dismissible]="!pending()">…</div>
 * ```
 */
@Directive({
  selector: "[fold__AlertDialog]",
  hostDirectives: [
    { directive: OrigamiAlertDialog, inputs: ["open", "dismissible"], outputs: ["openChange"] },
  ],
  host: { "data-slot": "alert-dialog", class: "not-[dialog]:contents" },
})
export class AlertDialog {}
