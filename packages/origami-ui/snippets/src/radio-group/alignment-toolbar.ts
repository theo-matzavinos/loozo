import { Component, signal } from "@angular/core";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import { OrigamiToggleGroupMultiple, OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";
import { OrigamiToolbar, OrigamiToolbarItem } from "@loozo/origami-ui/toolbar";

// Both groups join the Toolbar. Arrows only move focus across all six controls; Space, Enter or
// a click checks an alignment.
@Component({
  selector: "app-text-toolbar",
  imports: [
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiToggleGroupMultiple,
    OrigamiToggleGroupItem,
    OrigamiRadioGroup,
    OrigamiRadioGroupItem,
  ],
  template: `
    <div ogToolbar aria-label="Text formatting">
      <div ogToggleGroupMultiple [(value)]="marks" aria-label="Style">
        <button ogToggleGroupItem value="bold">Bold</button>
        <button ogToggleGroupItem value="italic">Italic</button>
      </div>
      <div ogRadioGroup [(value)]="alignment" aria-label="Text alignment">
        <button ogRadioGroupItem value="left">Left</button>
        <button ogRadioGroupItem value="center">Center</button>
        <button ogRadioGroupItem value="right">Right</button>
      </div>
      <button ogToolbarItem (click)="copy()">Copy</button>
    </div>
  `,
})
export class TextToolbar {
  readonly marks = signal<readonly string[]>([]);
  readonly alignment = signal<string | null>("left");

  copy(): void {}
}
