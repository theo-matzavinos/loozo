import { Component, signal } from "@angular/core";
import { OrigamiToggleGroupSingle, OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";

@Component({
  selector: "app-text-alignment",
  imports: [OrigamiToggleGroupSingle, OrigamiToggleGroupItem],
  template: `
    <div ogToggleGroupSingle [(value)]="alignment" aria-label="Text alignment">
      <button ogToggleGroupItem value="start" aria-label="Align start">⇤</button>
      <button ogToggleGroupItem value="center" aria-label="Center">↔</button>
      <button ogToggleGroupItem value="end" aria-label="Align end">⇥</button>
      <button ogToggleGroupItem value="justify" aria-label="Justify" disabled>☰</button>
    </div>

    <!-- With deselectable, clicking the pressed item clears the value to null. -->
    <div ogToggleGroupSingle deselectable [(value)]="highlight" aria-label="Highlight colour">
      <button ogToggleGroupItem value="yellow">Yellow</button>
      <button ogToggleGroupItem value="green">Green</button>
    </div>
  `,
})
export class TextAlignment {
  readonly alignment = signal<string | null>("start");
  readonly highlight = signal<string | null>(null);
}
