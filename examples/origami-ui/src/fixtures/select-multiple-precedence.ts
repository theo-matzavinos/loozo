import { Component, Directive, InjectionToken, Service, inject, signal } from "@angular/core";
import {
  OrigamiSelectContent,
  OrigamiSelectMultiple,
  OrigamiSelectMultipleOptions,
  OrigamiSelectMultipleState,
  OrigamiSelectOption,
  OrigamiSelectTrigger,
} from "@loozo/origami-ui/select";

// Z17 (O1, O3): a consumer composes ogSelectMultiple through `hostDirectives`, exposes its own
// inputs and outputs with contradicting values, and replaces its Options with ordinary signals:
// by a factory in one case and by an existing provider in the other.

const MultipleCaseLabel = new InjectionToken<string>("multiple select precedence case label");

/** Ordinary non-model replacement signals shared only by one consumer root. */
@Service({ autoProvided: false })
export class SelectMultiplePrecedenceSettings {
  readonly label = inject(MultipleCaseLabel);
  readonly value = signal<readonly number[]>([2, 7]);
  readonly open = signal(false);
  readonly disabled = signal(true);
  readonly unusedOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}

const rootComposition = {
  directive: OrigamiSelectMultiple,
  inputs: ["value", "open", "disabled"],
  outputs: ["valueChange", "openChange"],
};

@Directive({
  selector: "[precedenceFactoryMultiple]",
  exportAs: "precedenceMultiple",
  hostDirectives: [rootComposition],
  providers: [
    SelectMultiplePrecedenceSettings,
    OrigamiSelectMultipleOptions.provideFactory(() => inject(SelectMultiplePrecedenceSettings)),
  ],
})
export class PrecedenceFactoryMultiple {
  readonly settings = inject(SelectMultiplePrecedenceSettings);
  readonly state = inject<OrigamiSelectMultipleState<number>>(OrigamiSelectMultipleState);
}

@Directive({
  selector: "[precedenceExistingMultiple]",
  exportAs: "precedenceMultiple",
  hostDirectives: [rootComposition],
  providers: [
    SelectMultiplePrecedenceSettings,
    OrigamiSelectMultipleOptions.provideExisting(() => PrecedenceExistingMultiple),
  ],
})
export class PrecedenceExistingMultiple implements OrigamiSelectMultipleOptions<number> {
  readonly settings = inject(SelectMultiplePrecedenceSettings);
  readonly value = this.settings.value;
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly state = inject<OrigamiSelectMultipleState<number>>(OrigamiSelectMultipleState);
}

// The root's own inputs contradict the replacement and must stay unused.
function multipleTemplate(
  selector: "precedenceFactoryMultiple" | "precedenceExistingMultiple",
): string {
  return `
  <div ${selector} #root="precedenceMultiple" [value]="[1]" [open]="true" [disabled]="false"
    (valueChange)="root.settings.unusedOutputs.update(root.settings.increment)"
    (openChange)="root.settings.unusedOutputs.update(root.settings.increment)">
    <button ogSelectTrigger aria-label="Sizes" data-co="trigger">
      {{ root.state.value().length }} selected
    </button>
    <div ogSelectContent data-co="content" class="surface">
      <div ogSelectOption [value]="1" label="One" data-co="option-1">One</div>
      <div ogSelectOption [value]="2" label="Two" data-co="option-2">Two</div>
      <div ogSelectOption [value]="3" label="Three" data-co="option-3">Three</div>
    </div>
  </div>
  <output data-co="value">{{ root.state.value().join(",") }}</output>
  <output data-co="open">{{ root.settings.open() }} {{ root.state.open() }}</output>
  <output data-co="disabled">{{ root.state.disabled() }}</output>
  <output data-co="selected">{{ labels(root.state.selectedOptions()) }}</output>
  <output data-co="unused-outputs">{{ root.settings.unusedOutputs() }}</output>
  <button type="button" data-co="enable" (click)="root.settings.disabled.set(false)">Enable</button>
`;
}

const multipleStyles = `
  :host { display: block; padding-block: 24px; }
  output { display: block; }
  .surface { color: #eee; background: #242424; border: 1px solid #888; padding: 4px; }
`;

/** Shared readouts of both cases. */
abstract class SelectMultiplePrecedenceCase {
  labels(records: readonly { readonly label: string | null }[]): string {
    const labels: string[] = [];

    for (const record of records) {
      labels.push(record.label ?? "");
    }

    return labels.join(",");
  }
}

@Component({
  selector: "select-multiple-precedence-factory",
  imports: [
    PrecedenceFactoryMultiple,
    OrigamiSelectTrigger,
    OrigamiSelectContent,
    OrigamiSelectOption,
  ],
  providers: [{ provide: MultipleCaseLabel, useValue: "multiple-factory" }],
  host: { "data-case": "multiple-factory" },
  template: multipleTemplate("precedenceFactoryMultiple"),
  styles: multipleStyles,
})
export class SelectMultiplePrecedenceFactory extends SelectMultiplePrecedenceCase {}

@Component({
  selector: "select-multiple-precedence-existing",
  imports: [
    PrecedenceExistingMultiple,
    OrigamiSelectTrigger,
    OrigamiSelectContent,
    OrigamiSelectOption,
  ],
  providers: [{ provide: MultipleCaseLabel, useValue: "multiple-existing" }],
  host: { "data-case": "multiple-existing" },
  template: multipleTemplate("precedenceExistingMultiple"),
  styles: multipleStyles,
})
export class SelectMultiplePrecedenceExisting extends SelectMultiplePrecedenceCase {}
