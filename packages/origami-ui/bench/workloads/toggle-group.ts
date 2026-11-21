import { Component, signal } from "@angular/core";
import { OrigamiToggleGroupItem, OrigamiToggleGroupSingle } from "@loozo/origami-ui/toggle-group";

@Component({
  selector: "bench-root, bench-toggle-group",
  imports: [OrigamiToggleGroupSingle, OrigamiToggleGroupItem],
  template: `
    <div ogToggleGroupSingle [(value)]="alignment" aria-label="Text alignment">
      <button ogToggleGroupItem value="start" aria-label="Align start">⇤</button>
      <button ogToggleGroupItem value="center" aria-label="Center">↔</button>
      <button ogToggleGroupItem value="end" aria-label="Align end">⇥</button>
    </div>
  `,
})
export class Workload {
  readonly alignment = signal<"start" | "center" | "end" | null>("start");
}
