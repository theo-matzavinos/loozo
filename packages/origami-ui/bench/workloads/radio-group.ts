import { Component, signal } from "@angular/core";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";

@Component({
  selector: "bench-root, bench-radio-group",
  imports: [OrigamiRadioGroup, OrigamiRadioGroupItem],
  template: `
    <h3 id="shipping-speed-label">Shipping speed</h3>
    <div ogRadioGroup [(value)]="speed" aria-labelledby="shipping-speed-label">
      <button ogRadioGroupItem value="standard">Standard · 3–5 days</button>
      <button ogRadioGroupItem value="express">Express · next day</button>
    </div>
  `,
})
export class Workload {
  readonly speed = signal<"standard" | "express" | null>(null);
}
