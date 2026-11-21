import { Component, signal } from "@angular/core";
import {
  OrigamiMenu,
  OrigamiMenuContent,
  OrigamiMenuItem,
  OrigamiMenuSeparator,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";

@Component({
  selector: "bench-root, bench-menu",
  imports: [
    OrigamiMenu,
    OrigamiMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
    OrigamiMenuSeparator,
  ],
  template: `
    <div ogMenu>
      <button ogMenuTrigger aria-label="Actions">⋯</button>
      <div ogMenuContent align="end">
        <button ogMenuItem (select)="last.set('duplicate')">Duplicate</button>
        <div ogMenuSeparator></div>
        <button ogMenuItem (select)="last.set('delete')">Delete</button>
      </div>
    </div>
    <p>Last action: {{ last() ?? "none" }}</p>
  `,
})
export class Workload {
  readonly last = signal<string | null>(null);
}
