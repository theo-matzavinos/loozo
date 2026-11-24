import { Component, Directive, inject, signal } from "@angular/core";
import { FormField, disabled, form, max, min, readonly } from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import {
  OrigamiSlider,
  OrigamiSliderOptions,
  OrigamiSliderState,
  OrigamiSliderThumb,
  OrigamiSliderTrack,
} from "@loozo/origami-ui/slider";

/** A descendant of the Thumb reading its Slider State through DI. */
@Directive({
  selector: "[sliderStateProbe]",
  host: {
    "[attr.data-value-state]": "state.value()",
    "[attr.data-percent-state]": "state.percent()",
    "[attr.data-disabled-state]": "state.disabled()",
    "[attr.data-dragging-state]": "state.dragging()",
  },
})
export class SliderStateProbe {
  readonly state = inject(OrigamiSliderState);
}

/**
 * A consumer directive that is the Slider through `hostDirectives`, exposing the model, `min`,
 * `max`, `step`, `disabled` and `touch`, so `[formField]` on it finds the Slider's model; Forms
 * calls its `focus()`, which reaches the Thumb through the composed root's.
 */
@Directive({
  selector: "[composedSlider]",
  hostDirectives: [
    {
      directive: OrigamiSlider,
      inputs: ["value", "min", "max", "step", "disabled"],
      outputs: ["valueChange", "touch"],
    },
  ],
})
export class ComposedSlider {
  readonly #slider = inject(OrigamiSlider);

  focus(options?: FocusOptions): void {
    this.#slider.focus(options);
  }
}

/** Replacement Options state the factory Slider reads; changed by the fixture's buttons. */
@Directive({ selector: "[sliderSettings]", exportAs: "sliderSettings" })
export class SliderSettings {
  readonly value = signal(50);
  readonly min = signal<number | undefined>(0);
  readonly max = signal<number | undefined>(200);
  readonly step = signal(5);
  readonly disabled = signal(false);
  /** While armed, the Thumb's focus listener disables the slider. */
  readonly disableOnFocus = signal(false);
}

/** A consumer Slider with factory Options over its exposed own inputs and model output. */
@Directive({
  selector: "[factorySlider]",
  hostDirectives: [
    {
      directive: OrigamiSlider,
      inputs: ["value", "min", "max", "step", "disabled"],
      outputs: ["valueChange"],
    },
  ],
  providers: [
    OrigamiSliderOptions.provideFactory(() => {
      const settings = inject(SliderSettings);

      return {
        value: settings.value,
        min: settings.min,
        max: settings.max,
        step: settings.step,
        disabled: settings.disabled,
      };
    }),
  ],
})
export class FactorySlider {}

/** A consumer Slider whose existing Options are its own record. */
@Directive({
  selector: "[existingSlider]",
  exportAs: "existingSlider",
  hostDirectives: [OrigamiSlider],
  providers: [OrigamiSliderOptions.provideExisting(() => ExistingSlider)],
})
export class ExistingSlider implements OrigamiSliderOptions {
  readonly value = signal(3);
  readonly min = signal<number | undefined>(0);
  readonly max = signal<number | undefined>(10);
  readonly step = signal(1);
  readonly disabled = signal(false);
}

@Component({
  selector: "acceptance-slider-fixture",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiSlider,
    OrigamiSliderTrack,
    OrigamiSliderThumb,
    SliderStateProbe,
    ComposedSlider,
    SliderSettings,
    FactorySlider,
    ExistingSlider,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach slider behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Main</h2>
      <div
        class="slider"
        ogSlider
        #main="ogSlider"
        data-testid="main"
        [(value)]="mainValue"
        [min]="mainMin()"
        [max]="mainMax()"
        [step]="mainStep()"
        [disabled]="mainDisabled()"
        (valueChange)="mainWrites.update(increment)"
      >
        <div class="track" ogSliderTrack data-testid="main-track">
          <span class="track-text">Volume track</span>
          <div class="range"></div>
          @if (mainThumb()) {
            <div class="thumb" ogSliderThumb data-testid="main-thumb" aria-label="Volume">
              <span sliderStateProbe data-testid="main-probe"></span>
            </div>
          }
        </div>
      </div>
      <output data-testid="main-value">{{ mainValue() }}</output>
      <output data-testid="main-writes">{{ mainWrites() }}</output>
      <output data-testid="main-state"
        >{{ main.state.value() }} {{ main.state.percent() }} {{ main.state.disabled() }}
        {{ main.state.dragging() }}</output
      >
      <div class="controls">
        <button type="button" data-testid="main-config-default" (click)="configure(undefined, undefined, 1)">
          Default range
        </button>
        <button type="button" data-testid="main-config-zoom" (click)="configure(20, 185, 10)">
          20 to 185 by 10
        </button>
        <button type="button" data-testid="main-config-decimal" (click)="configure(0, 1, 0.1)">
          0 to 1 by 0.1
        </button>
        <button type="button" data-testid="main-config-equal" (click)="configure(50, 50, 1)">
          Equal bounds
        </button>
        <button type="button" data-testid="main-config-zero-step" (click)="configure(0, 100, 0)">
          Zero step
        </button>
        @for (value of writes; track $index) {
          <button type="button" [attr.data-testid]="'main-write-' + value" (click)="mainValue.set(value)">
            Write {{ value }}
          </button>
        }
        <button type="button" data-testid="main-disable" (click)="mainDisabled.update(flip)">
          Toggle disabled
        </button>
        <button type="button" data-testid="main-thumb-toggle" (click)="mainThumb.update(flip)">
          Toggle the Thumb
        </button>
        <button type="button" data-testid="main-focus" (click)="main.focus()">Focus</button>
      </div>
    </section>

    <section dir="rtl">
      <h2>Right to left</h2>
      <div class="slider" ogSlider data-testid="rtl" [(value)]="rtlValue">
        <div class="track" ogSliderTrack data-testid="rtl-track">
          <div class="range"></div>
          <div class="thumb" ogSliderThumb data-testid="rtl-thumb" aria-label="Balance"></div>
        </div>
      </div>
      <output data-testid="rtl-value">{{ rtlValue() }}</output>
    </section>

    <section>
      <h2>Lifetime</h2>
      @if (lifetimeRoot()) {
        <div
          class="slider"
          ogSlider
          data-testid="lifetime"
          [(value)]="lifetimeValue"
          (valueChange)="lifetimeWrites.update(increment)"
        >
          <div class="track" ogSliderTrack data-testid="lifetime-track">
            @if (lifetimeThumb()) {
              <div class="thumb" ogSliderThumb data-testid="lifetime-thumb" aria-label="Lifetime"></div>
            }
          </div>
        </div>
      }
      <output data-testid="lifetime-value">{{ lifetimeValue() }}</output>
      <output data-testid="lifetime-writes">{{ lifetimeWrites() }}</output>
      <button type="button" data-testid="lifetime-remove-thumb" (click)="lifetimeThumb.set(false)">
        Remove the Thumb
      </button>
      <button type="button" data-testid="lifetime-remove-root" (click)="lifetimeRoot.set(false)">
        Remove the slider
      </button>
      <button type="button" data-testid="lifetime-restore" (click)="restoreLifetime()">
        Restore
      </button>
    </section>

    <section>
      <h2>Signal Forms</h2>
      <div ogField #zoomField="ogField" data-testid="zoom-field">
        <span ogFieldLabel id="zoom-label">Zoom</span>
        <div class="slider" ogSlider #zoom="ogSlider" data-testid="zoom" [formField]="settings.zoom" step="10">
          <div class="track" ogSliderTrack data-testid="zoom-track">
            <div class="range"></div>
            <div
              class="thumb"
              ogSliderThumb
              data-testid="zoom-thumb"
              [attr.aria-valuetext]="zoom.state.value() + '%'"
            ></div>
          </div>
        </div>
        <p ogFieldDescription id="zoom-description">From 20% to 180%.</p>
        @if (zoomField.state.errorsShown()) {
          <p ogFieldError id="zoom-error">Choose a zoom inside the range.</p>
        }
      </div>
      <output data-testid="zoom-value">{{ model().zoom }}</output>
      <output data-testid="zoom-touched">{{ settings.zoom().touched() }}</output>
      <button type="button" data-testid="zoom-write" (click)="writeZoom(250)">Write 250</button>
      <button type="button" data-testid="zoom-min" (click)="zoomMin.set(50)">Minimum 50</button>
      <button type="button" data-testid="zoom-readonly" (click)="zoomReadonly.update(flip)">
        Toggle readonly
      </button>
      <button type="button" data-testid="zoom-disabled" (click)="zoomDisabled.update(flip)">
        Toggle disabled
      </button>
      <button type="button" data-testid="zoom-focus" (click)="settings.zoom().focusBoundControl()">
        Focus the zoom control
      </button>

      <div ogField data-testid="composed-field">
        <span ogFieldLabel>Opacity</span>
        <div class="slider" composedSlider data-testid="composed" [formField]="settings.opacity">
          <div class="track" ogSliderTrack data-testid="composed-track">
            <div class="range"></div>
            <div class="thumb" ogSliderThumb data-testid="composed-thumb"></div>
          </div>
        </div>
      </div>
      <output data-testid="composed-value">{{ model().opacity }}</output>
      <output data-testid="composed-touched">{{ settings.opacity().touched() }}</output>
      <button type="button" data-testid="composed-focus" (click)="settings.opacity().focusBoundControl()">
        Focus the opacity control
      </button>
      <button type="button" data-testid="composed-readonly" (click)="opacityReadonly.update(flip)">
        Toggle readonly
      </button>
    </section>

    <section sliderSettings #replaced="sliderSettings">
      <h2>Options replacement</h2>
      <div
        class="slider"
        factorySlider
        data-testid="factory"
        [value]="0"
        [min]="0"
        [max]="1000"
        [step]="1"
        (valueChange)="factoryOutputs.update(increment)"
      >
        <div class="track" ogSliderTrack data-testid="factory-track">
          <div class="range"></div>
          <div
            class="thumb"
            ogSliderThumb
            data-testid="factory-thumb"
            aria-label="Factory"
            (focus)="disableOnFocus(replaced)"
          >
            <span sliderStateProbe data-testid="factory-probe"></span>
          </div>
        </div>
      </div>
      <output data-testid="factory-value">{{ replaced.value() }}</output>
      <output data-testid="factory-outputs">{{ factoryOutputs() }}</output>
      <button type="button" data-testid="factory-disable" (click)="replaced.disabled.update(flip)">
        Toggle disabled
      </button>
      <button type="button" data-testid="factory-readonly-on-focus" (click)="replaced.disableOnFocus.set(true)">
        Disable on focus
      </button>

      <div class="slider" existingSlider #existing="existingSlider" data-testid="existing">
        <div class="track" ogSliderTrack data-testid="existing-track">
          <div class="range"></div>
          <div class="thumb" ogSliderThumb data-testid="existing-thumb" aria-label="Existing"></div>
        </div>
      </div>
      <output data-testid="existing-value">{{ existing.value() }}</output>
      <button type="button" data-testid="existing-disable" (click)="existing.disabled.update(flip)">
        Toggle disabled
      </button>
    </section>

    <section>
      <h2>Cardinality</h2>
      @if (duplicateThumb()) {
        <div class="slider" ogSlider data-testid="duplicate-thumb">
          <div class="track" ogSliderTrack>
            <div class="thumb" ogSliderThumb aria-label="First"></div>
            <div class="thumb" ogSliderThumb aria-label="Second"></div>
          </div>
        </div>
      }
      @if (duplicateTrack()) {
        <div class="slider" ogSlider data-testid="duplicate-track">
          <div class="track" ogSliderTrack></div>
          <div class="track" ogSliderTrack></div>
        </div>
      }
      <button type="button" data-testid="mount-duplicate-thumb" (click)="duplicateThumb.set(true)">
        Mount two Thumbs
      </button>
      <button type="button" data-testid="mount-duplicate-track" (click)="duplicateTrack.set(true)">
        Mount two Tracks
      </button>
    </section>
  `,
  styles: `
    section {
      margin-block: 24px;
    }

    .slider {
      margin-inline: 80px;
    }

    .track {
      position: relative;
      inline-size: 400px;
      block-size: 24px;
      border-radius: 12px;
      background: #333333;
      touch-action: pan-y;
    }

    .track-text {
      position: absolute;
      inset-inline-start: 160px;
      font-size: 10px;
      line-height: 24px;
    }

    .range {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      inline-size: var(--og-slider-percent);
      border-radius: 12px;
      background: #3b82f6;
    }

    .thumb {
      position: absolute;
      inset-block-start: 2px;
      inset-inline-start: var(--og-slider-percent);
      inline-size: 20px;
      block-size: 20px;
      margin-inline-start: -10px;
      border-radius: 50%;
      background: #eeeeee;
    }

    .thumb:focus-visible {
      outline: 2px solid #93c5fd;
      outline-offset: 2px;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
  `,
})
export class SliderFixture {
  readonly attached = signal(false);
  readonly writes = [7.3, 150, -5, Number.NaN, 40, 0.3];
  readonly mainValue = signal(40);
  readonly mainMin = signal<number | undefined>(undefined);
  readonly mainMax = signal<number | undefined>(undefined);
  readonly mainStep = signal(1);
  readonly mainDisabled = signal(false);
  readonly mainThumb = signal(true);
  readonly mainWrites = signal(0);
  readonly rtlValue = signal(40);
  readonly lifetimeRoot = signal(true);
  readonly lifetimeThumb = signal(true);
  readonly lifetimeValue = signal(40);
  readonly lifetimeWrites = signal(0);
  readonly zoomMin = signal(20);
  readonly zoomReadonly = signal(false);
  readonly zoomDisabled = signal(false);
  readonly opacityReadonly = signal(false);
  readonly factoryOutputs = signal(0);
  readonly duplicateThumb = signal(false);
  readonly duplicateTrack = signal(false);
  readonly model = signal({ zoom: 100, opacity: 30 });
  readonly settings = form(this.model, (path) => {
    min(path.zoom, () => this.zoomMin());
    max(path.zoom, 180);
    readonly(path.zoom, () => this.zoomReadonly());
    disabled(path.zoom, () => this.zoomDisabled());
    readonly(path.opacity, () => this.opacityReadonly());
  });

  flip(value: boolean): boolean {
    return !value;
  }

  increment(value: number): number {
    return value + 1;
  }

  configure(lowest: number | undefined, highest: number | undefined, step: number): void {
    this.mainMin.set(lowest);
    this.mainMax.set(highest);
    this.mainStep.set(step);
  }

  restoreLifetime(): void {
    this.lifetimeRoot.set(true);
    this.lifetimeThumb.set(true);
  }

  writeZoom(value: number): void {
    this.model.update((model) => ({ ...model, zoom: value }));
  }

  /** The armed Thumb focus listener: disables the slider synchronously, before the press goes on. */
  disableOnFocus(settings: SliderSettings): void {
    if (settings.disableOnFocus()) {
      settings.disableOnFocus.set(false);
      settings.disabled.set(true);
    }
  }
}
