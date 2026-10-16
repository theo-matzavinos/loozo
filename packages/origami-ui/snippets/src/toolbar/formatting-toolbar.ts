import { Component, signal } from "@angular/core";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  OrigamiToolbarToggleGroupMultiple,
} from "@loozo/origami-ui/toolbar";
import { OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";

// The Toolbar group's items share the Toolbar's tab stop and arrow sequence.
@Component({
  selector: "app-formatting-toolbar",
  imports: [
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiToolbarToggleGroupMultiple,
    OrigamiToggleGroupItem,
  ],
  template: `
    <div ogToolbar aria-label="Formatting">
      <button ogToolbarItem (click)="undo()">Undo</button>
      <button ogToolbarItem [disabled]="!canRedo()" (click)="redo()">Redo</button>

      <span role="separator" aria-orientation="vertical"></span>

      <div ogToolbarToggleGroupMultiple [(value)]="marks" aria-label="Text style">
        <button ogToggleGroupItem value="bold" aria-label="Bold"><b>B</b></button>
        <button ogToggleGroupItem value="italic" aria-label="Italic"><i>I</i></button>
        <button ogToggleGroupItem value="underline" aria-label="Underline"><u>U</u></button>
      </div>

      <span role="separator" aria-orientation="vertical"></span>

      <button ogToolbarItem (click)="clear()">Clear formatting</button>
    </div>
  `,
})
export class FormattingToolbar {
  readonly marks = signal<readonly string[]>(["bold"]);
  readonly canRedo = signal(false);

  undo(): void {}

  redo(): void {}

  clear(): void {
    this.marks.set([]);
  }
}
