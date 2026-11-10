import { Component, TemplateRef, ViewContainerRef, signal, viewChild } from "@angular/core";
import {
  OrigamiCombobox,
  OrigamiComboboxContent,
  OrigamiComboboxInput,
  OrigamiComboboxOption,
} from "@loozo/origami-ui/combobox";
import { ClearOnInit } from "./destroyed-before-registration";

// CB21: C5's pattern for the Combobox input. A consumer hook earlier in an embedded view destroys
// that view before the input's ngOnInit, which Angular still runs. The root stays outside the
// destroyed view, and a replacement input then mounts under it.

function increment(value: number): number {
  return value + 1;
}

@Component({
  selector: "combobox-lifetimes",
  imports: [
    ClearOnInit,
    OrigamiCombobox,
    OrigamiComboboxInput,
    OrigamiComboboxContent,
    OrigamiComboboxOption,
  ],
  template: `
    <section>
      <h2>Input destroyed before it registers</h2>
      <button type="button" data-testid="unregistered-input-mount" (click)="mount()">
        Mount an input whose view is destroyed during initialization
      </button>
      <button type="button" data-testid="unregistered-input-remount" (click)="remount()">
        Mount a replacement input
      </button>
      <div
        ogCombobox
        #unregistered="ogCombobox"
        (queryChange)="queryOutputs.update(increment)"
        (valueChange)="valueOutputs.update(increment)"
        (openChange)="openOutputs.update(increment)"
      >
        <ng-template #inputPart let-outlet let-label="label">
          <i [clearOnInit]="outlet"></i>
          <input
            ogComboboxInput
            [attr.data-testid]="'unregistered-input-' + label"
            aria-label="Unregistered"
          />
        </ng-template>
        <ng-container #inputOutlet />
        <div ogComboboxContent data-testid="unregistered-input-content" class="list">
          <div ogComboboxOption value="a" data-testid="unregistered-input-a">Alpha</div>
          <div ogComboboxOption value="b" data-testid="unregistered-input-b">Beta</div>
        </div>
      </div>
      <output data-testid="unregistered-input-value">{{ unregistered.state.value() }}</output>
      <output data-testid="unregistered-input-query">{{ unregistered.state.query() }}</output>
      <output data-testid="unregistered-input-outputs"
        >{{ queryOutputs() }} {{ valueOutputs() }} {{ openOutputs() }}</output
      >
    </section>
  `,
})
export class ComboboxLifetimes {
  readonly increment = increment;
  readonly queryOutputs = signal(0);
  readonly valueOutputs = signal(0);
  readonly openOutputs = signal(0);
  readonly inputPart = viewChild.required("inputPart", { read: TemplateRef });
  readonly inputOutlet = viewChild.required("inputOutlet", { read: ViewContainerRef });

  /** The input's view clears its own outlet before the input's `ngOnInit`. */
  mount(): void {
    this.inputOutlet().createEmbeddedView(this.inputPart(), {
      $implicit: this.inputOutlet(),
      label: "gone",
    });
  }

  /** A replacement under the same root, which nothing destroys. */
  remount(): void {
    this.inputOutlet().createEmbeddedView(this.inputPart(), { $implicit: null, label: "kept" });
  }
}
