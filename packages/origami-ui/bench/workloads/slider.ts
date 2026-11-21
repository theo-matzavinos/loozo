import { Component, signal } from "@angular/core";
import { OrigamiSlider, OrigamiSliderThumb, OrigamiSliderTrack } from "@loozo/origami-ui/slider";

@Component({
  selector: "bench-root, bench-slider",
  imports: [OrigamiSlider, OrigamiSliderTrack, OrigamiSliderThumb],
  template: `
    <div ogSlider [(value)]="zoom" min="20" max="180" step="10">
      <div ogSliderTrack>
        <div ogSliderThumb aria-label="Zoom" [attr.aria-valuetext]="zoom() + '%'"></div>
      </div>
    </div>
    <output>{{ zoom() }}%</output>
  `,
})
export class Workload {
  readonly zoom = signal(100);
}
