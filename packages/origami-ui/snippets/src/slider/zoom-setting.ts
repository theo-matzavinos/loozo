import { Component, signal } from "@angular/core";
import { FormField, form, max, min } from "@angular/forms/signals";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import { OrigamiSlider, OrigamiSliderThumb, OrigamiSliderTrack } from "@loozo/origami-ui/slider";

// The form's min() and max() rules are the slider's bounds; the Thumb sits inside the Track and
// the CSS places it from --og-slider-percent in either text direction.
@Component({
  selector: "app-zoom-setting",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiSlider,
    OrigamiSliderTrack,
    OrigamiSliderThumb,
  ],
  template: `
    <div ogField class="setting">
      <span ogFieldLabel>Zoom</span>
      <div ogSlider #zoom="ogSlider" [formField]="settings.zoom" step="10" class="slider">
        <div ogSliderTrack class="track">
          <div class="range"></div>
          <div ogSliderThumb class="thumb" [attr.aria-valuetext]="zoom.state.value() + '%'"></div>
        </div>
      </div>
      <output>{{ zoom.state.value() }}%</output>
    </div>
  `,
  styles: `
    .setting {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 1rem;
      max-inline-size: 28rem;
    }

    .track {
      position: relative;
      block-size: 0.375rem;
      margin-block: 0.75rem;
      border-radius: 999px;
      background: color-mix(in srgb, currentColor 25%, transparent);
      touch-action: pan-y;
    }

    .range {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      inline-size: var(--og-slider-percent);
      border-radius: inherit;
      background: #60a5fa;
    }

    .thumb {
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: var(--og-slider-percent);
      inline-size: 1.25rem;
      block-size: 1.25rem;
      margin-block-start: -0.625rem;
      margin-inline-start: -0.625rem;
      border-radius: 50%;
      background: #f8fafc;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.4);
    }

    .thumb:focus-visible {
      outline: 2px solid #93c5fd;
      outline-offset: 2px;
    }

    .slider[data-disabled] {
      opacity: 0.5;
    }

    .slider[data-dragging] .thumb {
      cursor: grabbing;
    }
  `,
})
export class ZoomSetting {
  readonly model = signal({ zoom: 100 });
  readonly settings = form(this.model, (path) => {
    min(path.zoom, 20);
    max(path.zoom, 180);
  });
}
