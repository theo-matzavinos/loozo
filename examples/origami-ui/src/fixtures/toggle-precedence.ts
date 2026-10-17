import { Component, Directive, Service, inject, signal } from "@angular/core";
import { OrigamiToggle, OrigamiToggleOptions, OrigamiToggleState } from "@loozo/origami-ui/toggle";

// G2 precedence: whole replacement Toggle Options win over the composed Toggle's own inputs,
// bound through the consumer's exposed host-directive inputs. Both cases share one template; only
// the replacement provider differs.

@Service({ autoProvided: false })
export class TogglePrecedenceSettings {
  readonly pressed = signal(true);
  readonly disabled = signal(false);
}

@Directive({
  selector: "button[precedenceFactoryToggle]",
  exportAs: "precedenceFactoryToggle",
  hostDirectives: [
    { directive: OrigamiToggle, inputs: ["pressed", "disabled"], outputs: ["pressedChange"] },
  ],
  providers: [OrigamiToggleOptions.provideFactory(() => inject(TogglePrecedenceSettings))],
})
export class PrecedenceFactoryToggle {
  readonly state = inject(OrigamiToggleState);
}

@Directive({
  selector: "button[precedenceExistingToggle]",
  exportAs: "precedenceExistingToggle",
  hostDirectives: [
    { directive: OrigamiToggle, inputs: ["pressed", "disabled"], outputs: ["pressedChange"] },
  ],
  providers: [OrigamiToggleOptions.provideExisting(() => PrecedenceExistingToggle)],
})
export class PrecedenceExistingToggle implements OrigamiToggleOptions {
  readonly #settings = inject(TogglePrecedenceSettings);
  readonly pressed = this.#settings.pressed;
  readonly disabled = this.#settings.disabled;
  readonly state = inject(OrigamiToggleState);
}

@Directive({ selector: "[toggleProbe]", exportAs: "toggleProbe" })
export class ToggleProbe {
  readonly state = inject(OrigamiToggleState);
}

// The Toggle's own inputs deliberately contradict the replacement. One return statement keeps the
// template statically evaluable by the Angular compiler.
function toggleTemplate(prefix: "precedenceFactoryToggle" | "precedenceExistingToggle"): string {
  return `
  <button ${prefix} #consumer="${prefix}"
    [pressed]="false" [disabled]="true" data-role="toggle" (pressedChange)="outputs.update(increment)">
    <span toggleProbe #probe="toggleProbe">Bold</span>
  </button>
  <button ogToggle #independent="ogToggle" data-role="independent-toggle">Independent</button>
  <output data-role="pressed">{{ consumer.state.pressed() }}</output>
  <output data-role="disabled">{{ consumer.state.disabled() }}</output>
  <output data-role="shared">{{ consumer.state === probe.state }}</output>
  <output data-role="independent">{{ consumer.state !== independent.state }}</output>
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
  selector: "toggle-precedence-factory",
  imports: [PrecedenceFactoryToggle, OrigamiToggle, ToggleProbe],
  providers: [TogglePrecedenceSettings],
  host: { "data-toggle-case": "factory" },
  template: toggleTemplate("precedenceFactoryToggle"),
})
export class ToggleFactory extends TogglePrecedenceCase {}

@Component({
  selector: "toggle-precedence-existing",
  imports: [PrecedenceExistingToggle, OrigamiToggle, ToggleProbe],
  providers: [TogglePrecedenceSettings],
  host: { "data-toggle-case": "existing" },
  template: toggleTemplate("precedenceExistingToggle"),
})
export class ToggleExisting extends TogglePrecedenceCase {}

@Component({
  selector: "acceptance-toggle-precedence",
  imports: [ToggleFactory, ToggleExisting],
  template: `
    <h2>Toggle replacement precedence</h2>
    <toggle-precedence-factory />
    <toggle-precedence-existing />
  `,
})
export class TogglePrecedence {}
