import { Directive } from "@angular/core";
import { OrigamiAlertDialog } from "@loozo/origami-ui/dialog";

/**
 * The alert dialog root over Origami's AlertDialog. Layout-transparent (`display: contents`).
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
  host: { "data-slot": "alert-dialog", class: "contents" },
})
export class AlertDialog {}
