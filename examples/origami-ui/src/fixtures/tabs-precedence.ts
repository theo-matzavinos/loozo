import { Component, Directive, Service, inject, signal } from "@angular/core";
import {
  OrigamiTabs,
  OrigamiTabsOptions,
  OrigamiTabsState,
  OrigamiTabsList,
  OrigamiTabsTrigger,
  OrigamiTabsPanel,
  type OrigamiTabsOrientation,
  type OrigamiTabsActivation,
} from "@loozo/origami-ui/tabs";

// S6 precedence: whole replacement Tabs root Options win over the composed root's own inputs,
// bound through the consumer's exposed host-directive inputs. Both cases share one template; only
// the replacement provider differs.

@Service({ autoProvided: false })
export class TabsPrecedenceSettings {
  readonly value = signal<string | null>("one");
  readonly disabled = signal(false);
  readonly orientation = signal<OrigamiTabsOrientation>("vertical");
  readonly activation = signal<OrigamiTabsActivation>("manual");
}

@Directive({
  selector: "[precedenceFactoryTabs]",
  exportAs: "precedenceFactoryTabs",
  hostDirectives: [
    {
      directive: OrigamiTabs,
      inputs: ["value", "disabled", "orientation", "activation"],
      outputs: ["valueChange"],
    },
  ],
  providers: [OrigamiTabsOptions.provideFactory(() => inject(TabsPrecedenceSettings))],
})
export class PrecedenceFactoryTabs {
  readonly state = inject(OrigamiTabsState);
}

@Directive({
  selector: "[precedenceExistingTabs]",
  exportAs: "precedenceExistingTabs",
  hostDirectives: [
    {
      directive: OrigamiTabs,
      inputs: ["value", "disabled", "orientation", "activation"],
      outputs: ["valueChange"],
    },
  ],
  providers: [OrigamiTabsOptions.provideExisting(() => PrecedenceExistingTabs)],
})
export class PrecedenceExistingTabs implements OrigamiTabsOptions {
  readonly #settings = inject(TabsPrecedenceSettings);
  readonly value = this.#settings.value;
  readonly disabled = this.#settings.disabled;
  readonly orientation = this.#settings.orientation;
  readonly activation = this.#settings.activation;
  readonly state = inject(OrigamiTabsState);
}

@Directive({ selector: "[tabsPrecedenceProbe]", exportAs: "tabsPrecedenceProbe" })
export class TabsPrecedenceProbe {
  readonly state = inject(OrigamiTabsState);
}

// The root's own inputs deliberately contradict the replacement. One return statement keeps the
// template statically evaluable by the Angular compiler.
function tabsTemplate(prefix: "precedenceFactoryTabs" | "precedenceExistingTabs"): string {
  return `
  <section ${prefix} #consumer="${prefix}" value="direct" [disabled]="true"
    orientation="horizontal" activation="automatic" (valueChange)="outputs.update(increment)">
    <div ogTabsList aria-label="Precedence" data-role="list">
      <button ogTabsTrigger value="one" data-role="one">One</button>
      <button ogTabsTrigger value="two" data-role="two">Two</button>
    </div>
    <div ogTabsPanel value="one" tabsPrecedenceProbe #probe="tabsPrecedenceProbe" data-role="panel-one">One</div>
    <div ogTabsPanel value="two" data-role="panel-two">Two</div>
  </section>
  <output data-role="value">{{ consumer.state.value() }}</output>
  <output data-role="disabled">{{ consumer.state.disabled() }}</output>
  <output data-role="shared">{{ consumer.state === probe.state }}</output>
  <button type="button" data-role="disable" (click)="settings.disabled.set(!settings.disabled())">Disable</button>
  <button type="button" data-role="external" (click)="settings.value.set('one')">External selection</button>
  <output data-role="outputs">{{ outputs() }}</output>
`;
}

abstract class TabsPrecedenceCase {
  readonly settings = inject(TabsPrecedenceSettings);
  readonly outputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}

@Component({
  selector: "tabs-precedence-factory",
  imports: [
    PrecedenceFactoryTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    TabsPrecedenceProbe,
  ],
  providers: [TabsPrecedenceSettings],
  host: { "data-tabs-case": "factory" },
  template: tabsTemplate("precedenceFactoryTabs"),
})
export class TabsFactory extends TabsPrecedenceCase {}

@Component({
  selector: "tabs-precedence-existing",
  imports: [
    PrecedenceExistingTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    TabsPrecedenceProbe,
  ],
  providers: [TabsPrecedenceSettings],
  host: { "data-tabs-case": "existing" },
  template: tabsTemplate("precedenceExistingTabs"),
})
export class TabsExisting extends TabsPrecedenceCase {}

@Component({
  selector: "acceptance-tabs-precedence",
  imports: [TabsFactory, TabsExisting],
  template: `
    <h2>Tabs replacement precedence</h2>
    <tabs-precedence-factory />
    <tabs-precedence-existing />
  `,
})
export class TabsPrecedence {}
