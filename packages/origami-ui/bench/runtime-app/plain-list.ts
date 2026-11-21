import { Component, ElementRef, input, signal, viewChildren } from "@angular/core";
import { type ReadinessMode, installReadiness, listSize } from "./readiness";

// 1,000 plain buttons bound the way the checkboxes are, without Origami: the framework floor for
// the plain-1000 scenario.
@Component({
  selector: "bench-plain-list",
  template: `
    <div id="items">
      @for (item of items; track item) {
        <button
          #control
          type="button"
          [attr.aria-checked]="checked()[item]"
          [attr.data-checked]="checked()[item] ? '' : null"
          (click)="toggle(item)"
        >
          {{ item }}
        </button>
      }
    </div>
  `,
})
export class PlainList {
  readonly readiness = input<ReadinessMode>("hydrate");
  readonly controls = viewChildren("control", { read: ElementRef });
  readonly items = Array.from({ length: listSize }, (_, index) => index);
  readonly checked = signal(Array.from({ length: listSize }, () => false));
  readonly changes = Array.from({ length: listSize }, () => 0);

  constructor() {
    installReadiness(this.readiness, {
      initialized: () => this.controls().length,
      models: () => this.checked(),
      changes: this.changes,
    });
  }

  toggle(index: number): void {
    this.changes[index]++;
    this.checked.update((checked) => {
      const next = [...checked];

      next[index] = !next[index];

      return next;
    });
  }
}
