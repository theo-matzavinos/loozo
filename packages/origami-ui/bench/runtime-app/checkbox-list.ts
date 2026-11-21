import { Component, input, viewChildren } from "@angular/core";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";
import { type ReadinessMode, installReadiness, listSize } from "./readiness";

// 1,000 checkboxes with a bound `checked`: the checkbox-1000 scenario's hydrate route, and its mount
// page's list.
@Component({
  selector: "bench-checkbox-list",
  imports: [OrigamiCheckbox],
  template: `
    <div id="items">
      @for (item of items; track item) {
        <button ogCheckbox [checked]="false" (checkedChange)="changed(item)">{{ item }}</button>
      }
    </div>
  `,
})
export class CheckboxList {
  readonly readiness = input<ReadinessMode>("hydrate");
  readonly checkboxes = viewChildren(OrigamiCheckbox);
  readonly items = Array.from({ length: listSize }, (_, index) => index);
  readonly changes = Array.from({ length: listSize }, () => 0);

  constructor() {
    installReadiness(this.readiness, {
      initialized: () => this.checkboxes().length,
      models: () => this.checkboxes().map((checkbox) => checkbox.checked()),
      changes: this.changes,
    });
  }

  changed(index: number): void {
    this.changes[index]++;
  }
}
