import { Component, Directive, Service, inject, signal } from "@angular/core";
import { OrigamiToggle, OrigamiToggleOptions, OrigamiToggleState } from "@loozo/origami-ui/toggle";
import { injectUniqueId } from "@loozo/origami-ui/utils";

// G2 precedence: whole replacement Toggle Options win over the composed Toggle's own inputs,
// bound through the consumer's exposed host-directive inputs. Both cases share one template; only
// the replacement provider differs.

@Service({ autoProvided: false })
export class TogglePrecedenceSettings {
  readonly checked = signal(true);
  readonly disabled = signal(false);
  readonly focusableWhenDisabled = signal(false);
  readonly id = signal(injectUniqueId("precedence-toggle"));
}

@Directive({
  selector: "button[precedenceFactoryToggle]",
  exportAs: "precedenceFactoryToggle",
  hostDirectives: [
    { directive: OrigamiToggle, inputs: ["checked", "disabled"], outputs: ["checkedChange"] },
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
    { directive: OrigamiToggle, inputs: ["checked", "disabled"], outputs: ["checkedChange"] },
  ],
  providers: [OrigamiToggleOptions.provideExisting(() => PrecedenceExistingToggle)],
})
export class PrecedenceExistingToggle implements OrigamiToggleOptions {
  readonly #settings = inject(TogglePrecedenceSettings);
  readonly checked = this.#settings.checked;
  readonly disabled = this.#settings.disabled;
  readonly focusableWhenDisabled = this.#settings.focusableWhenDisabled;
  readonly id = this.#settings.id;
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
    [checked]="false" [disabled]="true" data-role="toggle" (checkedChange)="outputs.update(increment)">
    <span toggleProbe #probe="toggleProbe">Bold</span>
  </button>
  <button ogToggle #independent="ogToggle" data-role="independent-toggle">Independent</button>
  <output data-role="checked">{{ consumer.state.checked() }}</output>
  <output data-role="disabled">{{ consumer.state.disabled() }}</output>
  <output data-role="shared">{{ consumer.state === probe.state }}</output>
  <output data-role="independent">{{ consumer.state !== independent.state }}</output>
  <button type="button" data-role="disable" (click)="settings.disabled.set(!settings.disabled())">Disable</button>
  <button type="button" data-role="external" (click)="settings.checked.set(!settings.checked())">External intent</button>
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
