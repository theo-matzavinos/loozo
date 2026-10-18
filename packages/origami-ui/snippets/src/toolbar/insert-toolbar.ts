import { Component, signal } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  OrigamiToolbarPopoverTrigger,
  OrigamiToolbarToggle,
} from "@loozo/origami-ui/toolbar";

// A Toolbar Toggle and a Toolbar Popover Trigger are one control each in the Toolbar's arrow
// sequence; disabling the Popover also disables its Trigger there.
@Component({
  selector: "app-insert-toolbar",
  imports: [
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiToolbarToggle,
    OrigamiPopover,
    OrigamiToolbarPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
  ],
  template: `
    <div ogToolbar aria-label="Insert">
      <button ogToolbarItem (click)="insertLink()">Link</button>
      <button ogToolbarToggle [(pressed)]="spellcheck">Spell check</button>
      <span ogPopover [disabled]="readOnly()">
        <button ogToolbarPopoverTrigger ogPopoverAnchor>Symbol</button>
        <div ogPopoverContent role="group" aria-label="Symbols">…</div>
      </span>
    </div>
  `,
})
export class InsertToolbar {
  readonly spellcheck = signal(true);
  readonly readOnly = signal(false);

  insertLink(): void {}
}
