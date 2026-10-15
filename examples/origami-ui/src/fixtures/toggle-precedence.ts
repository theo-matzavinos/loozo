import { Component, Directive, Service, inject, signal } from "@angular/core";
import { OrigamiToggle, OrigamiToggleOptions, OrigamiToggleState } from "@loozo/origami-ui/toggle";

// G2 precedence: whole replacement Toggle Options win over conflicting direct inputs in both
// directive import orders and through host-directive diamonds. Each case shares one template;
// only the import (registry) order or composition differs.

@Service({ autoProvided: false })
export class TogglePrecedenceSettings {
  readonly pressed = signal(true);
  readonly disabled = signal(false);
}

@Directive({
  selector: "button[precedenceFactoryToggle]",
  exportAs: "precedenceFactoryToggle",
  hostDirectives: [{ directive: OrigamiToggle, outputs: ["pressedChange: unusedChange"] }],
  providers: [OrigamiToggleOptions.provideFactory(() => inject(TogglePrecedenceSettings))],
})
export class PrecedenceFactoryToggle {
  readonly state = inject(OrigamiToggleState);
}

@Directive({
  selector: "button[precedenceExistingToggle]",
  exportAs: "precedenceExistingToggle",
  hostDirectives: [OrigamiToggle],
  providers: [OrigamiToggleOptions.provideExisting(() => PrecedenceExistingToggle)],
})
export class PrecedenceExistingToggle implements OrigamiToggleOptions {
  readonly #settings = inject(TogglePrecedenceSettings);
  readonly pressed = this.#settings.pressed;
  readonly disabled = this.#settings.disabled;
  readonly state = inject(OrigamiToggleState);
}

@Directive({ selector: "button[diamondToggleA]", hostDirectives: [OrigamiToggle] })
export class DiamondToggleA {}
@Directive({ selector: "button[diamondToggleB]", hostDirectives: [OrigamiToggle] })
export class DiamondToggleB {}

@Directive({ selector: "[toggleProbe]", exportAs: "toggleProbe" })
export class ToggleProbe {
  readonly state = inject(OrigamiToggleState);
}

// Diamond attributes are inert in the non-diamond cases. Direct inputs deliberately contradict the
// replacement. One return statement keeps the template statically evaluable by the Angular compiler.
function toggleTemplate(prefix: "precedenceFactoryToggle" | "precedenceExistingToggle"): string {
  return `
  <button ${prefix} ogToggle diamondToggleA diamondToggleB #upper="${prefix}"
    [pressed]="false" [disabled]="true" data-role="toggle" (pressedChange)="outputs.update(increment)">
    <span toggleProbe #probe="toggleProbe">Bold</span>
  </button>
  <button ogToggle #independent="ogToggle" data-role="independent-toggle">Independent</button>
  <output data-role="pressed">{{ upper.state.pressed() }}</output>
  <output data-role="disabled">{{ upper.state.disabled() }}</output>
  <output data-role="shared">{{ upper.state === probe.state }}</output>
  <output data-role="independent">{{ upper.state !== independent.state }}</output>
  <button type="button" data-role="disable" (click)="settings.disabled.set(!settings.disabled())">Disable</button>
  <button type="button" data-role="external" (click)="settings.pressed.set(!settings.pressed())">External intent</button>
  <output data-role="outputs">{{ outputs() }}</output>
`;
}

abstract class TogglePrecedenceCase {
  readonly settings = inject(TogglePrecedenceSettings);
  readonly outputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}

@Component({
  selector: "toggle-precedence-factory-upper-first",
  imports: [PrecedenceFactoryToggle, OrigamiToggle, ToggleProbe],
  providers: [TogglePrecedenceSettings],
  host: { "data-toggle-case": "factory-upper-first" },
  template: toggleTemplate("precedenceFactoryToggle"),
})
export class ToggleFactoryUpperFirst extends TogglePrecedenceCase {}

@Component({
  selector: "toggle-precedence-factory-lower-first",
  imports: [OrigamiToggle, PrecedenceFactoryToggle, ToggleProbe],
  providers: [TogglePrecedenceSettings],
  host: { "data-toggle-case": "factory-lower-first" },
  template: toggleTemplate("precedenceFactoryToggle"),
})
export class ToggleFactoryLowerFirst extends TogglePrecedenceCase {}

@Component({
  selector: "toggle-precedence-existing-upper-first",
  imports: [PrecedenceExistingToggle, OrigamiToggle, ToggleProbe],
  providers: [TogglePrecedenceSettings],
  host: { "data-toggle-case": "existing-upper-first" },
  template: toggleTemplate("precedenceExistingToggle"),
})
export class ToggleExistingUpperFirst extends TogglePrecedenceCase {}

@Component({
  selector: "toggle-precedence-existing-lower-first",
  imports: [OrigamiToggle, PrecedenceExistingToggle, ToggleProbe],
  providers: [TogglePrecedenceSettings],
  host: { "data-toggle-case": "existing-lower-first" },
  template: toggleTemplate("precedenceExistingToggle"),
})
export class ToggleExistingLowerFirst extends TogglePrecedenceCase {}

@Component({
  selector: "toggle-precedence-factory-diamond",
  imports: [DiamondToggleA, DiamondToggleB, PrecedenceFactoryToggle, OrigamiToggle, ToggleProbe],
  providers: [TogglePrecedenceSettings],
  host: { "data-toggle-case": "factory-diamond" },
  template: toggleTemplate("precedenceFactoryToggle"),
})
export class ToggleFactoryDiamond extends TogglePrecedenceCase {}

@Component({
  selector: "toggle-precedence-existing-diamond",
  imports: [DiamondToggleA, DiamondToggleB, PrecedenceExistingToggle, OrigamiToggle, ToggleProbe],
  providers: [TogglePrecedenceSettings],
  host: { "data-toggle-case": "existing-diamond" },
  template: toggleTemplate("precedenceExistingToggle"),
})
export class ToggleExistingDiamond extends TogglePrecedenceCase {}

@Component({
  selector: "acceptance-toggle-precedence",
  imports: [
    ToggleFactoryUpperFirst,
    ToggleFactoryLowerFirst,
    ToggleExistingUpperFirst,
    ToggleExistingLowerFirst,
    ToggleFactoryDiamond,
    ToggleExistingDiamond,
  ],
  template: `
    <h2>Toggle replacement precedence</h2>
    <toggle-precedence-factory-upper-first />
    <toggle-precedence-factory-lower-first />
    <toggle-precedence-existing-upper-first />
    <toggle-precedence-existing-lower-first />
    <toggle-precedence-factory-diamond />
    <toggle-precedence-existing-diamond />
  `,
})
export class TogglePrecedence {}
