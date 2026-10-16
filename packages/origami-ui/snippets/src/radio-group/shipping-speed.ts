import { Component, input, model } from "@angular/core";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";

// One tab stop; arrow keys move and check, and the layout is yours.
@Component({
  selector: "app-shipping-speed",
  imports: [OrigamiRadioGroup, OrigamiRadioGroupItem],
  template: `
    <h3 id="shipping-speed-label">Shipping speed</h3>
    <div ogRadioGroup [(value)]="speed" aria-labelledby="shipping-speed-label" class="stack">
      <button ogRadioGroupItem value="standard">Standard · 3–5 days</button>
      <button ogRadioGroupItem value="express">Express · next day</button>
      <button ogRadioGroupItem value="same-day" [disabled]="!sameDayAvailable()">Same day</button>
    </div>
  `,
})
export class ShippingSpeed {
  readonly speed = model<"standard" | "express" | "same-day" | null>(null);
  readonly sameDayAvailable = input(false);
}
