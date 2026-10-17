import { Component, Directive, Service, inject, signal } from "@angular/core";
import {
  OrigamiToggleGroupSingle,
  OrigamiToggleGroupSingleOptions,
  OrigamiToggleGroupMultiple,
  OrigamiToggleGroupMultipleOptions,
  OrigamiToggleGroupState,
  OrigamiToggleGroupItem,
  type OrigamiToggleGroupOrientation,
} from "@loozo/origami-ui/toggle-group";

// U5 precedence: whole replacement root Options win over the composed root's own inputs, bound
// through the consumer's exposed host-directive inputs, with a factory for Single and an existing
// provider for Multiple.

@Service({ autoProvided: false })
export class SinglePrecedenceSettings {
  readonly value = signal<string | null>("one");
  readonly disabled = signal(false);
  readonly orientation = signal<OrigamiToggleGroupOrientation>("vertical");
  readonly deselectable = signal(true);
}

@Service({ autoProvided: false })
export class MultiplePrecedenceSettings {
  readonly value = signal<readonly string[]>(["one"]);
  readonly disabled = signal(false);
  readonly orientation = signal<OrigamiToggleGroupOrientation>("vertical");
}

@Directive({
  selector: "[precedenceFactorySingle]",
  exportAs: "precedenceFactorySingle",
  hostDirectives: [
    {
      directive: OrigamiToggleGroupSingle,
      inputs: ["value", "disabled", "orientation", "deselectable"],
      outputs: ["valueChange"],
    },
  ],
  providers: [
    OrigamiToggleGroupSingleOptions.provideFactory(() => inject(SinglePrecedenceSettings)),
  ],
})
export class PrecedenceFactorySingle {
  readonly state = inject(OrigamiToggleGroupState);
}

@Directive({
  selector: "[precedenceExistingMultiple]",
  exportAs: "precedenceExistingMultiple",
  hostDirectives: [
    {
      directive: OrigamiToggleGroupMultiple,
      inputs: ["value", "disabled", "orientation"],
      outputs: ["valueChange"],
    },
  ],
  providers: [OrigamiToggleGroupMultipleOptions.provideExisting(() => PrecedenceExistingMultiple)],
})
export class PrecedenceExistingMultiple implements OrigamiToggleGroupMultipleOptions {
  readonly #settings = inject(MultiplePrecedenceSettings);
  readonly value = this.#settings.value;
  readonly disabled = this.#settings.disabled;
  readonly orientation = this.#settings.orientation;
  readonly state = inject(OrigamiToggleGroupState);
}

@Directive({ selector: "[toggleGroupPrecedenceProbe]", exportAs: "toggleGroupPrecedenceProbe" })
export class ToggleGroupPrecedenceProbe {
  readonly state = inject(OrigamiToggleGroupState);
}

// The root's own inputs deliberately contradict the replacement. One return statement keeps each
// template statically evaluable by the Angular compiler.
const items = `
    <button ogToggleGroupItem value="one" data-role="one">One</button>
    <button ogToggleGroupItem value="two" data-role="two">Two</button>
    <span toggleGroupPrecedenceProbe #probe="toggleGroupPrecedenceProbe"></span>
`;

const observations = `
  <output data-role="value">{{ settings.value() }}</output>
  <output data-role="disabled">{{ consumer.state.disabled() }}</output>
  <output data-role="shared">{{ consumer.state === probe.state }}</output>
  <button type="button" data-role="disable" (click)="settings.disabled.set(!settings.disabled())">Disable</button>
  <output data-role="outputs">{{ outputs() }}</output>
`;

const singleTemplate = `
  <div precedenceFactorySingle #consumer="precedenceFactorySingle" value="direct"
    [disabled]="true" orientation="horizontal" [deselectable]="false"
    (valueChange)="outputs.update(increment)" aria-label="Single precedence" data-role="root">
    ${items}
  </div>
  ${observations}
  <button type="button" data-role="external" (click)="settings.value.set('one')">External value</button>
`;

const multipleTemplate = `
  <div precedenceExistingMultiple #consumer="precedenceExistingMultiple"
    [value]="direct" [disabled]="true" orientation="horizontal"
    (valueChange)="outputs.update(increment)" aria-label="Multiple precedence" data-role="root">
    ${items}
  </div>
  ${observations}
  <button type="button" data-role="external" (click)="settings.value.set(['one'])">External value</button>
`;

abstract class SinglePrecedenceCase {
  readonly settings = inject(SinglePrecedenceSettings);
  readonly outputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}

abstract class MultiplePrecedenceCase {
  readonly settings = inject(MultiplePrecedenceSettings);
  readonly direct: readonly string[] = ["direct"];
  readonly outputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}

@Component({
  selector: "toggle-group-precedence-single",
  imports: [PrecedenceFactorySingle, OrigamiToggleGroupItem, ToggleGroupPrecedenceProbe],
  providers: [SinglePrecedenceSettings],
  host: { "data-toggle-group-case": "single-precedence" },
  template: singleTemplate,
})
export class SinglePrecedence extends SinglePrecedenceCase {}

@Component({
  selector: "toggle-group-precedence-multiple",
  imports: [PrecedenceExistingMultiple, OrigamiToggleGroupItem, ToggleGroupPrecedenceProbe],
  providers: [MultiplePrecedenceSettings],
  host: { "data-toggle-group-case": "multiple-precedence" },
  template: multipleTemplate,
})
export class MultiplePrecedence extends MultiplePrecedenceCase {}

@Component({
  selector: "acceptance-toggle-group-precedence",
  imports: [SinglePrecedence, MultiplePrecedence],
  template: `
    <h2>ToggleGroup replacement precedence</h2>
    <toggle-group-precedence-single />
    <toggle-group-precedence-multiple />
  `,
})
export class ToggleGroupPrecedence {}
