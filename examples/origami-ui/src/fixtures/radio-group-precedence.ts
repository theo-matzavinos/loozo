import { Component, Directive, Service, inject, signal } from "@angular/core";
import {
  OrigamiRadioGroup,
  OrigamiRadioGroupOptions,
  OrigamiRadioGroupState,
  OrigamiRadioGroupItem,
  OrigamiRadioGroupItemOptions,
} from "@loozo/origami-ui/radio-group";

// Q5 precedence: whole replacement Options win over the composed directives' own inputs, bound
// through the consumers' exposed host-directive inputs, with a factory for the root and an
// existing provider for the item.

@Service({ autoProvided: false })
export class RadioGroupPrecedenceSettings {
  readonly value = signal<string | null>("last");
  readonly disabled = signal(false);
  readonly itemDisabled = signal(true);
}

@Directive({
  selector: "[precedenceFactoryRadioGroup]",
  exportAs: "precedenceFactoryRadioGroup",
  hostDirectives: [
    { directive: OrigamiRadioGroup, inputs: ["value", "disabled"], outputs: ["valueChange"] },
  ],
  providers: [
    OrigamiRadioGroupOptions.provideFactory(() => {
      const settings = inject(RadioGroupPrecedenceSettings);

      return { value: settings.value, disabled: settings.disabled };
    }),
  ],
})
export class PrecedenceFactoryRadioGroup {
  readonly state = inject(OrigamiRadioGroupState);
}

@Directive({
  selector: "button[precedenceExistingRadio]",
  hostDirectives: [{ directive: OrigamiRadioGroupItem, inputs: ["value", "disabled"] }],
  providers: [OrigamiRadioGroupItemOptions.provideExisting(() => PrecedenceExistingRadio)],
})
export class PrecedenceExistingRadio implements OrigamiRadioGroupItemOptions {
  readonly value = signal("replaced");
  readonly disabled = inject(RadioGroupPrecedenceSettings).itemDisabled;
}

// The composed directives' own inputs deliberately contradict the replacement.
const template = `
  <h2>RadioGroup replacement precedence</h2>
  <div precedenceFactoryRadioGroup #consumer="precedenceFactoryRadioGroup" value="first"
    [disabled]="true" (valueChange)="outputs.update(increment)" aria-label="RadioGroup precedence"
    data-role="root">
    <button ogRadioGroupItem value="first" data-role="first">First</button>
    <button precedenceExistingRadio value="direct" [disabled]="false"
      data-role="replaced">
      Replaced
    </button>
    <button ogRadioGroupItem value="last" data-role="last">Last</button>
  </div>
  <output data-role="value">{{ consumer.state.value() }}</output>
  <output data-role="disabled">{{ consumer.state.disabled() }}</output>
  <button type="button" data-role="enable"
    (click)="settings.itemDisabled.set(!settings.itemDisabled())">
    Toggle replaced disabled
  </button>
  <output data-role="outputs">{{ outputs() }}</output>
`;

@Component({
  selector: "acceptance-radio-group-precedence",
  imports: [PrecedenceFactoryRadioGroup, PrecedenceExistingRadio, OrigamiRadioGroupItem],
  providers: [RadioGroupPrecedenceSettings],
  host: { "data-radio-case": "precedence" },
  template,
})
export class RadioGroupPrecedence {
  readonly settings = inject(RadioGroupPrecedenceSettings);
  readonly outputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}
