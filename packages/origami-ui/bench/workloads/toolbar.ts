import { Component, signal } from "@angular/core";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  OrigamiToolbarToggle,
} from "@loozo/origami-ui/toolbar";

// The Toolbar's own controls; its groups take another entry's items, an optional part.
@Component({
  selector: "bench-root, bench-toolbar",
  imports: [OrigamiToolbar, OrigamiToolbarItem, OrigamiToolbarToggle],
  template: `
    <div ogToolbar aria-label="Formatting">
      <button ogToolbarItem (click)="undo()">Undo</button>
      <button ogToolbarToggle [(checked)]="bold" aria-label="Bold"><b>B</b></button>
      <button ogToolbarItem (click)="bold.set(false)">Clear formatting</button>
    </div>
  `,
})
export class Workload {
  readonly bold = signal(false);
  readonly undos = signal(0);

  undo(): void {
    this.undos.update((undos) => undos + 1);
  }
}
