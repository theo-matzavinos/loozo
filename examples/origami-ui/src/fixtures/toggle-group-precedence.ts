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

// U5 precedence: whole replacement root Options win over conflicting direct inputs in both
// directive import orders, with a factory for Single and an existing provider for Multiple. Each
// mode shares one template; only the import (registry) order differs.

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
  hostDirectives: [OrigamiToggleGroupSingle],
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
  hostDirectives: [OrigamiToggleGroupMultiple],
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

// Direct inputs deliberately contradict the replacement. One return statement keeps each
// template statically evaluable by the Angular compiler.
const items = `
    <button ogToggleGroupItem value="one" data-role="one">One</button>
    <button ogToggleGroupItem value="two" data-role="two">Two</button>
    <span toggleGroupPrecedenceProbe #probe="toggleGroupPrecedenceProbe"></span>
`;

const observations = `
  <output data-role="value">{{ settings.value() }}</output>
  <output data-role="disabled">{{ upper.state.disabled() }}</output>
  <output data-role="shared">{{ upper.state === probe.state }}</output>
  <button type="button" data-role="disable" (click)="settings.disabled.set(!settings.disabled())">Disable</button>
  <output data-role="outputs">{{ outputs() }}</output>
`;

const singleTemplate = `
  <div precedenceFactorySingle ogToggleGroupSingle #upper="precedenceFactorySingle" value="direct"
    [disabled]="true" orientation="horizontal" [deselectable]="false"
    (valueChange)="outputs.update(increment)" aria-label="Single precedence" data-role="root">
    ${items}
  </div>
  ${observations}
  <button type="button" data-role="external" (click)="settings.value.set('one')">External value</button>
`;

const multipleTemplate = `
  <div precedenceExistingMultiple ogToggleGroupMultiple #upper="precedenceExistingMultiple"
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
  selector: "toggle-group-precedence-single-upper-first",
  imports: [
    PrecedenceFactorySingle,
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupItem,
    ToggleGroupPrecedenceProbe,
  ],
  providers: [SinglePrecedenceSettings],
  host: { "data-toggle-group-case": "single-upper-first" },
  template: singleTemplate,
})
export class SingleUpperFirst extends SinglePrecedenceCase {}

@Component({
  selector: "toggle-group-precedence-single-lower-first",
  imports: [
    OrigamiToggleGroupSingle,
    PrecedenceFactorySingle,
    OrigamiToggleGroupItem,
    ToggleGroupPrecedenceProbe,
  ],
  providers: [SinglePrecedenceSettings],
  host: { "data-toggle-group-case": "single-lower-first" },
  template: singleTemplate,
})
export class SingleLowerFirst extends SinglePrecedenceCase {}

@Component({
  selector: "toggle-group-precedence-multiple-upper-first",
  imports: [
    PrecedenceExistingMultiple,
    OrigamiToggleGroupMultiple,
    OrigamiToggleGroupItem,
    ToggleGroupPrecedenceProbe,
  ],
  providers: [MultiplePrecedenceSettings],
  host: { "data-toggle-group-case": "multiple-upper-first" },
  template: multipleTemplate,
})
export class MultipleUpperFirst extends MultiplePrecedenceCase {}

@Component({
  selector: "toggle-group-precedence-multiple-lower-first",
  imports: [
    OrigamiToggleGroupMultiple,
    PrecedenceExistingMultiple,
    OrigamiToggleGroupItem,
    ToggleGroupPrecedenceProbe,
  ],
  providers: [MultiplePrecedenceSettings],
  host: { "data-toggle-group-case": "multiple-lower-first" },
  template: multipleTemplate,
})
export class MultipleLowerFirst extends MultiplePrecedenceCase {}

@Component({
  selector: "acceptance-toggle-group-precedence",
  imports: [SingleUpperFirst, SingleLowerFirst, MultipleUpperFirst, MultipleLowerFirst],
  template: `
    <h2>ToggleGroup replacement precedence</h2>
    <toggle-group-precedence-single-upper-first />
    <toggle-group-precedence-single-lower-first />
    <toggle-group-precedence-multiple-upper-first />
    <toggle-group-precedence-multiple-lower-first />
  `,
})
export class ToggleGroupPrecedence {}
