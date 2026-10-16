import { Component, Directive, Service, inject, signal } from "@angular/core";
import {
  OrigamiRadioGroup,
  OrigamiRadioGroupOptions,
  OrigamiRadioGroupState,
  OrigamiRadioGroupItem,
  OrigamiRadioGroupItemOptions,
} from "@loozo/origami-ui/radio-group";

// Q5 precedence: whole replacement Options win over conflicting direct inputs in both directive
// import orders, with a factory for the root and an existing provider for the item. Both cases
// share one template; only the import (registry) order differs.

@Service({ autoProvided: false })
export class RadioGroupPrecedenceSettings {
  readonly value = signal<string | null>("last");
  readonly disabled = signal(false);
  readonly itemDisabled = signal(true);
}

@Directive({
  selector: "[precedenceFactoryRadioGroup]",
  exportAs: "precedenceFactoryRadioGroup",
  hostDirectives: [OrigamiRadioGroup],
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
  hostDirectives: [OrigamiRadioGroupItem],
  providers: [OrigamiRadioGroupItemOptions.provideExisting(() => PrecedenceExistingRadio)],
})
export class PrecedenceExistingRadio implements OrigamiRadioGroupItemOptions {
  readonly value = signal("replaced");
  readonly disabled = inject(RadioGroupPrecedenceSettings).itemDisabled;
}

// Direct inputs deliberately contradict the replacement. One return statement keeps the template
// statically evaluable by the Angular compiler.
const template = `
  <div precedenceFactoryRadioGroup ogRadioGroup #upper="precedenceFactoryRadioGroup" value="first"
    [disabled]="true" aria-label="RadioGroup precedence" data-role="root">
    <button ogRadioGroupItem value="first" data-role="first">First</button>
    <button precedenceExistingRadio ogRadioGroupItem value="direct" [disabled]="false"
      data-role="replaced">
      Replaced
    </button>
    <button ogRadioGroupItem value="last" data-role="last">Last</button>
  </div>
  <output data-role="value">{{ upper.state.value() }}</output>
  <output data-role="disabled">{{ upper.state.disabled() }}</output>
  <button type="button" data-role="enable"
    (click)="settings.itemDisabled.set(!settings.itemDisabled())">
    Toggle replaced disabled
  </button>
`;

abstract class RadioGroupPrecedenceCase {
  readonly settings = inject(RadioGroupPrecedenceSettings);
}

@Component({
  selector: "radio-group-precedence-upper-first",
  imports: [
    PrecedenceFactoryRadioGroup,
    OrigamiRadioGroup,
    PrecedenceExistingRadio,
    OrigamiRadioGroupItem,
  ],
  providers: [RadioGroupPrecedenceSettings],
  host: { "data-radio-case": "upper-first" },
  template,
})
export class RadioGroupUpperFirst extends RadioGroupPrecedenceCase {}

@Component({
  selector: "radio-group-precedence-lower-first",
  imports: [
    OrigamiRadioGroup,
    PrecedenceFactoryRadioGroup,
    OrigamiRadioGroupItem,
    PrecedenceExistingRadio,
  ],
  providers: [RadioGroupPrecedenceSettings],
  host: { "data-radio-case": "lower-first" },
  template,
})
export class RadioGroupLowerFirst extends RadioGroupPrecedenceCase {}

@Component({
  selector: "acceptance-radio-group-precedence",
  imports: [RadioGroupUpperFirst, RadioGroupLowerFirst],
  template: `
    <h2>RadioGroup replacement precedence</h2>
    <radio-group-precedence-upper-first />
    <radio-group-precedence-lower-first />
  `,
})
export class RadioGroupPrecedence {}
