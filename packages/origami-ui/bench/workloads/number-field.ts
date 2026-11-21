import { Component, signal } from "@angular/core";
import {
  OrigamiNumberField,
  OrigamiNumberFieldDecrement,
  OrigamiNumberFieldIncrement,
  OrigamiNumberFieldInput,
} from "@loozo/origami-ui/number-field";

@Component({
  selector: "bench-root, bench-number-field",
  imports: [
    OrigamiNumberField,
    OrigamiNumberFieldInput,
    OrigamiNumberFieldIncrement,
    OrigamiNumberFieldDecrement,
  ],
  template: `
    <div ogNumberField [(value)]="amount" min="0" max="1000">
      <button ogNumberFieldDecrement aria-label="Decrease">−</button>
      <input ogNumberFieldInput aria-label="Amount" />
      <button ogNumberFieldIncrement aria-label="Increase">+</button>
    </div>
    <p>Amount: {{ amount() ?? "none" }}</p>
  `,
})
export class Workload {
  readonly amount = signal<number | null>(null);
}
