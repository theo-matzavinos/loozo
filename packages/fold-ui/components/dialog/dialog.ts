import { Directive } from "@angular/core";
import { OrigamiDialog } from "@loozo/origami-ui/dialog";

/**
 * The dialog root over Origami's Dialog. Layout-transparent (`display: contents`) unless it's on the
 * `<dialog>` itself. A component can be the root through `hostDirectives: [Dialog]` and close
 * itself with `inject(OrigamiDialog).open.set(false)`.
 *
 * @example
 * ```html
 * <div fold__Dialog [(open)]="open" [dismissible]="!pending()">…</div>
 * ```
 */
@Directive({
  selector: "[fold__Dialog]",
  hostDirectives: [
    { directive: OrigamiDialog, inputs: ["open", "dismissible"], outputs: ["openChange"] },
  ],
  host: { "data-slot": "dialog", class: "not-[dialog]:contents" },
})
export class Dialog {}
