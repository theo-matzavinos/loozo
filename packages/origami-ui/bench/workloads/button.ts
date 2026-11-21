import { Component, signal } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";

@Component({
  selector: "bench-root, bench-button",
  imports: [OrigamiButton],
  template: `
    <button ogButton [disabled]="saving()" focusableWhenDisabled (click)="save()">Save</button>
    <output>Saved {{ saves() }} times</output>
  `,
})
export class Workload {
  readonly saving = signal(false);
  readonly saves = signal(0);

  save(): void {
    if (this.saving()) {
      return;
    }

    this.saves.update((saves) => saves + 1);
  }
}
