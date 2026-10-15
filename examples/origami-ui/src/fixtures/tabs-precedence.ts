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

// S6 precedence: whole replacement Tabs root Options win over conflicting direct inputs in both
// directive import orders. Each case shares one template; only the import (registry) order differs.

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
  hostDirectives: [OrigamiTabs],
  providers: [OrigamiTabsOptions.provideFactory(() => inject(TabsPrecedenceSettings))],
})
export class PrecedenceFactoryTabs {
  readonly state = inject(OrigamiTabsState);
}

@Directive({
  selector: "[precedenceExistingTabs]",
  exportAs: "precedenceExistingTabs",
  hostDirectives: [OrigamiTabs],
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

// Direct inputs deliberately contradict the replacement. One return statement keeps the
// template statically evaluable by the Angular compiler.
function tabsTemplate(prefix: "precedenceFactoryTabs" | "precedenceExistingTabs"): string {
  return `
  <section ${prefix} ogTabs #upper="${prefix}" value="direct" [disabled]="true"
    orientation="horizontal" activation="automatic" (valueChange)="outputs.update(increment)">
    <div ogTabsList aria-label="Precedence" data-role="list">
      <button ogTabsTrigger value="one" data-role="one">One</button>
      <button ogTabsTrigger value="two" data-role="two">Two</button>
    </div>
    <div ogTabsPanel value="one" tabsPrecedenceProbe #probe="tabsPrecedenceProbe" data-role="panel-one">One</div>
    <div ogTabsPanel value="two" data-role="panel-two">Two</div>
  </section>
  <output data-role="value">{{ upper.state.value() }}</output>
  <output data-role="disabled">{{ upper.state.disabled() }}</output>
  <output data-role="shared">{{ upper.state === probe.state }}</output>
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
  selector: "tabs-precedence-factory-upper-first",
  imports: [
    PrecedenceFactoryTabs,
    OrigamiTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    TabsPrecedenceProbe,
  ],
  providers: [TabsPrecedenceSettings],
  host: { "data-tabs-case": "factory-upper-first" },
  template: tabsTemplate("precedenceFactoryTabs"),
})
export class TabsFactoryUpperFirst extends TabsPrecedenceCase {}

@Component({
  selector: "tabs-precedence-factory-lower-first",
  imports: [
    OrigamiTabs,
    PrecedenceFactoryTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    TabsPrecedenceProbe,
  ],
  providers: [TabsPrecedenceSettings],
  host: { "data-tabs-case": "factory-lower-first" },
  template: tabsTemplate("precedenceFactoryTabs"),
})
export class TabsFactoryLowerFirst extends TabsPrecedenceCase {}

@Component({
  selector: "tabs-precedence-existing-upper-first",
  imports: [
    PrecedenceExistingTabs,
    OrigamiTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    TabsPrecedenceProbe,
  ],
  providers: [TabsPrecedenceSettings],
  host: { "data-tabs-case": "existing-upper-first" },
  template: tabsTemplate("precedenceExistingTabs"),
})
export class TabsExistingUpperFirst extends TabsPrecedenceCase {}

@Component({
  selector: "tabs-precedence-existing-lower-first",
  imports: [
    OrigamiTabs,
    PrecedenceExistingTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    TabsPrecedenceProbe,
  ],
  providers: [TabsPrecedenceSettings],
  host: { "data-tabs-case": "existing-lower-first" },
  template: tabsTemplate("precedenceExistingTabs"),
})
export class TabsExistingLowerFirst extends TabsPrecedenceCase {}

@Component({
  selector: "acceptance-tabs-precedence",
  imports: [
    TabsFactoryUpperFirst,
    TabsFactoryLowerFirst,
    TabsExistingUpperFirst,
    TabsExistingLowerFirst,
  ],
  template: `
    <h2>Tabs replacement precedence</h2>
    <tabs-precedence-factory-upper-first />
    <tabs-precedence-factory-lower-first />
    <tabs-precedence-existing-upper-first />
    <tabs-precedence-existing-lower-first />
  `,
})
export class TabsPrecedence {}
