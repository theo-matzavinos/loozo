import {
  Component,
  Directive,
  DestroyRef,
  Service,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from "@angular/core";
import {
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiCollectionItemOptions,
  OrigamiCollectionState,
} from "@loozo/origami-ui/collection";
import { OrigamiPresence, OrigamiPresenceState } from "@loozo/origami-ui/presence";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
  OrigamiCollapsibleOptions,
  OrigamiCollapsibleState,
  type OrigamiCollapsibleHiding,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionSingleOptions,
  OrigamiAccordionMultiple,
  OrigamiAccordionMultipleOptions,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
  OrigamiAccordionState,
} from "@loozo/origami-ui/accordion";
import { CoreConsumer } from "./seeds/core-consumer.js";
import { TabsCases } from "./tabs-cases.js";
import { ToggleGroupCases } from "./toggle-group-cases.js";

@Directive({ selector: "[presenceObservation]", exportAs: "presenceObservation" })
export class PresenceObservation {
  readonly state = inject(OrigamiPresenceState);
}

@Directive({ selector: "[collectionValues]", exportAs: "collectionValues" })
export class CollectionValues {
  readonly state = inject(OrigamiCollectionState);
  readonly values = computed(() => {
    const values: string[] = [];

    for (const item of this.state.items()) {
      values.push(item.value());
    }

    return values.join(",");
  });
}

/** Reads Collection order only once requested, counting each published order it observes. */
@Directive({ selector: "[lateOrderObservation]", exportAs: "lateOrderObservation" })
export class LateOrderObservation {
  readonly read = signal(false);
  readonly values = signal("");
  readonly publications = signal(0);
  readonly #state = inject(OrigamiCollectionState);

  constructor() {
    effect(() => {
      if (!this.read()) {
        return;
      }

      const values: string[] = [];

      for (const item of this.#state.items()) {
        values.push(item.value());
      }

      this.values.set(values.join(","));
      this.publications.update((count) => count + 1);
    });
  }
}

@Service({ autoProvided: false })
export class SingleSettings {
  readonly disabled = signal(false);
  readonly collapsible = signal(true);
  readonly reenter = signal(false);
  readonly history = signal<readonly string[]>([]);
  readBilling?: () => boolean;
  readonly value = linkedSignal<string | null>(() => null, {
    set: (value, rawSet) => {
      rawSet(value);

      if (this.reenter() && value === "billing") {
        this.reenter.set(false);
        rawSet("security");
      }

      const readBilling = this.readBilling;

      if (readBilling) {
        const actualValue = this.value();
        const expanded = readBilling();

        this.history.update((entries) => [...entries, `${actualValue}:${expanded}`]);
      }
    },
  });
}

@Directive({
  selector: "[factorySingle]",
  exportAs: "factorySingle",
  hostDirectives: [
    { directive: OrigamiAccordionSingle, outputs: ["valueChange: unusedValueChange"] },
  ],
  providers: [
    SingleSettings,
    OrigamiAccordionSingleOptions.provideFactory(() => inject(SingleSettings)),
  ],
})
export class FactorySingle {
  readonly settings = inject(SingleSettings);
  readonly state = inject(OrigamiAccordionState);
}

@Directive({ selector: "[billingObservation]" })
export class BillingObservation {
  constructor() {
    const settings = inject(SingleSettings);
    const state = inject(OrigamiCollapsibleState);
    const read = () => state.expanded();

    settings.readBilling = read;
    inject(DestroyRef).onDestroy(() => {
      if (settings.readBilling === read) {
        settings.readBilling = undefined;
      }
    });
  }
}

@Service({ autoProvided: false })
export class MultipleSettings {
  readonly disabled = signal(false);
  readonly original: readonly string[] = Object.freeze(["unmounted"]);
  readonly reenter = signal(false);
  readonly history = signal<readonly string[]>([]);
  readBilling?: () => boolean;
  readonly value = linkedSignal<readonly string[]>(() => this.original, {
    set: (value, rawSet) => {
      rawSet(value);

      if (this.reenter() && value.includes("billing")) {
        this.reenter.set(false);
        rawSet(["unmounted", "security"]);
      }

      const readBilling = this.readBilling;

      if (readBilling) {
        const actualValue = this.value().join(",");
        const expanded = readBilling();

        this.history.update((entries) => [...entries, `${actualValue}:${expanded}`]);
      }
    },
  });
}
@Directive({
  selector: "[factoryMultiple]",
  exportAs: "factoryMultiple",
  hostDirectives: [
    { directive: OrigamiAccordionMultiple, outputs: ["valueChange: unusedValueChange"] },
  ],
  providers: [
    MultipleSettings,
    OrigamiAccordionMultipleOptions.provideFactory(() => inject(MultipleSettings)),
  ],
})
export class FactoryMultiple {
  readonly settings = inject(MultipleSettings);
}
@Directive({ selector: "[multipleBillingObservation]" })
export class MultipleBillingObservation {
  constructor() {
    const settings = inject(MultipleSettings);
    const state = inject(OrigamiCollapsibleState);
    const read = () => state.expanded();

    settings.readBilling = read;
    inject(DestroyRef).onDestroy(() => {
      if (settings.readBilling === read) {
        settings.readBilling = undefined;
      }
    });
  }
}

/** The effective Collapsible Options an Accordion Item exposes to its own descendants. */
@Directive({ selector: "[itemOptions]", exportAs: "itemOptions" })
export class ItemOptions {
  readonly options = inject(OrigamiCollapsibleOptions);
}

@Service({ autoProvided: false })
export class ReplacedItemValue {
  readonly value = signal("replacement-one");
}

/** Replaces only the public lower Collection Item Options on a consumer-composed Accordion Item. */
@Directive({
  selector: "[replacedAccordionItem]",
  hostDirectives: [OrigamiAccordionItem],
  providers: [
    OrigamiCollectionItemOptions.provideFactory(() => ({ value: inject(ReplacedItemValue).value })),
  ],
})
export class ReplacedAccordionItem {}

/** Bounded observable variants; no registration/context access or library mutation. */
@Component({
  selector: "acceptance-core-fixture",
  imports: [
    CoreConsumer,
    OrigamiCollection,
    OrigamiCollectionItem,
    CollectionValues,
    LateOrderObservation,
    OrigamiPresence,
    PresenceObservation,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiAccordionSingle,
    OrigamiAccordionMultiple,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    FactorySingle,
    BillingObservation,
    FactoryMultiple,
    MultipleBillingObservation,
    ItemOptions,
    ReplacedAccordionItem,
    TabsCases,
    ToggleGroupCases,
  ],
  providers: [ReplacedItemValue],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">Attach core behavior</button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <acceptance-core />
    <acceptance-tabs-cases />
    <acceptance-toggle-group-cases />
    <h2>Mounted collection order</h2>
    <section ogCollection collectionValues #items="collectionValues" data-testid="variant-collection">
      @for (key of keys(); track key) {
        <span ogCollectionItem [value]="key" [attr.data-key]="key">{{ key }}</span>
      }
      <span ogCollectionItem data-testid="default-collection-item">Generated value</span>
      <section ogCollection><span ogCollectionItem value="nested-only">Nested item</span></section>
      <output data-testid="variant-collection-values">{{ items.values() }}</output>
    </section>
    <button type="button" data-testid="collection-add" (click)="keys.set(['three', 'one', 'two'])">Insert item</button>
    <button type="button" data-testid="collection-remove" (click)="keys.set(['three', 'two'])">Remove item</button>
    <button type="button" data-testid="collection-move" (click)="keys.set(['two', 'three'])">Move keyed items</button>

    <h2>Late first order read</h2>
    <section ogCollection lateOrderObservation #late="lateOrderObservation">
      @for (key of lateKeys(); track key) {
        <span ogCollectionItem [value]="key" [attr.data-late-key]="key">{{ key }}</span>
      }
    </section>
    <button type="button" data-testid="late-reverse" (click)="lateKeys.set(['two', 'one'])">Move unread items</button>
    <button type="button" data-testid="late-insert" (click)="lateKeys.set(['three', 'two', 'one'])">Insert unread item</button>
    <button type="button" data-testid="late-read" (click)="late.read.set(true)">Read order</button>
    <button type="button" data-testid="late-unrelated" (click)="lateUnrelated.update(increment)">Unrelated update</button>
    <button type="button" data-testid="late-move" (click)="lateKeys.set(['one', 'three', 'two'])">Move read items</button>
    <output data-testid="late-values">{{ late.values() }}</output>
    <output data-testid="late-publications">{{ late.publications() }}</output>
    <output data-testid="late-unrelated-count">{{ lateUnrelated() }}</output>

    <h2>Presence transitions</h2>
    <label>Motion
      <select data-testid="motion" (change)="setMotion($event)">
        <option value="finite">Finite</option><option value="none">None</option>
        <option value="zero">Zero duration</option><option value="infinite">Infinite</option>
        <option value="mixed">Finite and infinite</option>
      </select>
    </label>
    <button type="button" data-testid="variant-present" (click)="present.set(!present())">Toggle first presence</button>
    <button type="button" data-testid="second-present" (click)="secondPresent.set(!secondPresent())">Toggle second presence</button>
    <button type="button" data-testid="presence-mount" (click)="presenceMounted.set(!presenceMounted())">Mount first presence</button>
    @if (presenceMounted()) {
      <div ogPresence #presence="ogPresence" [(present)]="present" data-testid="variant-presence"
        [attr.data-motion]="motion()" [attr.data-phase]="presence.state.phase()"
        [attr.data-retained]="presence.state.open()" class="motion">
        <p data-testid="unconditional-child">Unconditional child</p>
        @if (presence.state.open()) { <p data-testid="variant-presence-child">Retained child</p> }
      </div>
    }
    <div ogPresence #second="ogPresence" [(present)]="secondPresent" class="motion"
      [attr.data-motion]="motion()" data-testid="second-presence" [attr.data-phase]="second.state.phase()">
      @if (second.state.open()) { <p>Independent retained child</p> }
    </div>
    <div ogPresence #absent="ogPresence" data-testid="absent-presence">
      <p data-testid="absent-unconditional">Unconditional absent-host child</p>
      @if (absent.state.open()) { <p data-testid="absent-gated">Must not be in SSR</p> }
    </div>

    <h2>Collapsible parts and native form semantics</h2>
    <button type="button" data-testid="variant-disable" (click)="disabled.set(!disabled())">Toggle disabled</button>
    <button type="button" data-testid="variant-script-expand" (click)="expanded.set(true)">Authoritative expansion</button>
    <button type="button" data-testid="variant-trigger-mount" (click)="triggerMounted.set(!triggerMounted())">Mount trigger</button>
    <button type="button" data-testid="variant-panel-mount" (click)="panelMounted.set(!panelMounted())">Mount panel</button>
    <button type="button" data-testid="variant-change-ids" (click)="triggerId.set('replacement-trigger'); panelId.set('replacement-panel')">Change IDs</button>
    <button type="button" data-testid="until-found" (click)="hiding.set('until-found')">Use native find enhancement</button>
    <a href="/core#origami-fragment-target" data-testid="fragment-reveal">Reveal details by fragment navigation</a>
    <form (submit)="$event.preventDefault(); submits.update(increment)">
      <section ogCollapsible [(expanded)]="expanded" [disabled]="disabled()" [hiding]="hiding()"
        data-testid="variant-collapsible" (expandedChange)="expandedOutputs.update(increment)">
        @if (triggerMounted()) {
          <button ogCollapsibleTrigger [id]="triggerId()" data-testid="variant-trigger">Details in a form</button>
        }
        @if (panelMounted()) {
          <div ogCollapsiblePanel presenceObservation #panel="presenceObservation" [id]="panelId()"
            class="motion" [attr.data-motion]="motion()" data-testid="variant-panel"
            [attr.data-phase]="panel.state.phase()" [attr.data-retained]="panel.state.open()">
            @if (panel.state.open()) { <p data-testid="variant-panel-child">Retained details</p> }
            <p>origami-find-target-7392</p>
            <p id="origami-fragment-target">Fragment navigation target</p>
          </div>
        }
      </section>
    </form>
    <output data-testid="form-submits">{{ submits() }}</output>
    <output data-testid="variant-expanded-outputs">{{ expandedOutputs() }}</output>

    <h2>Accordion factory setter reentry</h2>
    <section factorySingle #factory="factorySingle" (unusedValueChange)="unusedOutputs.update(increment)">
      <button type="button" data-testid="single-reentry-arm" (click)="factory.settings.reenter.set(true)">Reenter actual Options setter</button>
      <button type="button" data-testid="single-root-disable" (click)="factory.settings.disabled.set(!factory.settings.disabled())">Toggle root disabled</button>
      <button type="button" data-testid="single-external" (click)="factory.settings.value.set('unmounted')">Set unknown selection</button>
      <button type="button" data-testid="single-item-disable" (click)="itemDisabled.set(!itemDisabled())">Toggle item disabled</button>
      <button type="button" data-testid="single-item-hiding" (click)="itemHiding.set('until-found')">Accordion native find enhancement</button>
      <button type="button" data-testid="single-item-move" (click)="accordionKeys.set(['security', 'billing'])">Move items</button>
      <button type="button" data-testid="single-item-remove" (click)="accordionKeys.set(['security'])">Unmount billing</button>
      <button type="button" data-testid="single-item-remount" (click)="accordionKeys.set(['billing', 'security'])">Remount billing</button>
      <button type="button" data-testid="single-item-rename" (click)="accordionValues.set({billing: 'renamed', security: 'security'})">Change mounted item value</button>
      @for (key of accordionKeys(); track key) {
        <article ogAccordionItem itemOptions #item="itemOptions" [value]="accordionValues()[key]" [disabled]="itemDisabled()" [hiding]="itemHiding()" [attr.data-accordion-key]="key">
          @if (key === 'billing') { <span billingObservation></span> }
          <button type="button" [attr.data-testid]="'single-idempotent-' + key" (click)="item.options.expanded.set(true)">Request expanded {{ key }} again</button>
          <button ogAccordionTrigger [attr.data-testid]="'factory-single-' + key">{{ key }}</button>
          <div ogAccordionPanel class="motion" [attr.data-motion]="motion()" [attr.data-testid]="'factory-single-panel-' + key">{{ key }} panel: {{ key }}-accordion-native-reveal-4816</div>
        </article>
      }
      <article ogAccordionItem><button ogAccordionTrigger data-testid="factory-generated-item">Generated item</button><div ogAccordionPanel>Generated panel</div></article>
      <output data-testid="factory-single-value">{{ factory.settings.value() }}</output>
      <output data-testid="factory-single-values">{{ factory.state.itemValues().join(',') }}</output>
      <output data-testid="single-setter-history">{{ factory.settings.history().join(',') }}</output>
      <output data-testid="unused-single-outputs">{{ unusedOutputs() }}</output>
    </section>

    <h2>Multiple setter and direct output reentry</h2>
    <section factoryMultiple #multiFactory="factoryMultiple" (unusedValueChange)="unusedOutputs.update(increment)">
      <button type="button" data-testid="multiple-reentry-arm" (click)="multiFactory.settings.reenter.set(true)">Reenter Multiple Options setter</button>
      <article ogAccordionItem value="billing"><span multipleBillingObservation></span><button ogAccordionTrigger data-testid="factory-multiple-billing">Billing</button><div ogAccordionPanel>Panel</div></article>
      <article ogAccordionItem value="security"><button ogAccordionTrigger data-testid="factory-multiple-security">Security</button><div ogAccordionPanel>Panel</div></article>
      <output data-testid="factory-multiple-value">{{ multiFactory.settings.value().join(',') }}</output>
      <output data-testid="multiple-setter-history">{{ multiFactory.settings.history().join('|') }}</output>
      <output data-testid="factory-multiple-original">{{ multiFactory.settings.original.join(',') }}</output>
    </section>
    <button type="button" data-testid="output-reentry-arm" (click)="outputAction.set('replace-selection')">Replace selection in model output listener</button>
    <button type="button" data-testid="output-destroy-arm" (click)="outputAction.set('destroy')">Destroy root in model output listener</button>
    <button type="button" data-testid="output-owner-mount" (click)="outputOwner.set(true)">Mount output owner</button>
    @if (outputOwner()) {
      <section ogAccordionSingle [(value)]="outputValue" (valueChange)="singleOutput($event)">
        <article ogAccordionItem value="billing"><button ogAccordionTrigger data-testid="output-billing">Billing output</button><div ogAccordionPanel>Panel</div></article>
        <article ogAccordionItem value="security"><button ogAccordionTrigger data-testid="output-security">Security output</button><div ogAccordionPanel>Panel</div></article>
      </section>
    }
    <output data-testid="output-value">{{ outputValue() }}</output><output data-testid="output-count">{{ outputCount() }}</output>

    <h2>Keyboard Single selection and clearing</h2>
    <section ogAccordionSingle [collapsible]="true" [(value)]="keyboardValue" (valueChange)="keyboardOutputs.update(increment)">
      <article ogAccordionItem value="first"><button ogAccordionTrigger data-testid="keyboard-first">First</button><div ogAccordionPanel>First panel</div></article>
      <article ogAccordionItem value="second"><button ogAccordionTrigger data-testid="keyboard-second">Second</button><div ogAccordionPanel>Second panel</div></article>
    </section>
    <output data-testid="keyboard-value">{{ keyboardValue() }}</output>
    <output data-testid="keyboard-outputs">{{ keyboardOutputs() }}</output>

    <h2>Generated values and replaced Item Options</h2>
    <section ogAccordionSingle #generatedRoot="ogAccordionSingle">
      @for (key of generatedKeys(); track key) {
        <article ogAccordionItem [attr.data-generated-key]="key">
          <button ogAccordionTrigger [attr.data-testid]="'generated-trigger-' + key">Generated {{ key }}</button>
          <div ogAccordionPanel>Generated {{ key }} panel</div>
        </article>
      }
      <output data-testid="generated-values">{{ generatedRoot.state.itemValues().join(',') }}</output>
      <output data-testid="generated-selection">{{ generatedRoot.value() }}</output>
    </section>
    <button type="button" data-testid="generated-reverse" (click)="generatedKeys.set(['two', 'one'])">Reverse generated items</button>
    <section ogAccordionSingle #replacedRoot="ogAccordionSingle">
      <article replacedAccordionItem>
        <button ogAccordionTrigger data-testid="replaced-value-trigger">Replaced Item value</button>
        <div ogAccordionPanel>Replaced Item panel</div>
      </article>
      <output data-testid="replaced-item-values">{{ replacedRoot.state.itemValues().join(',') }}</output>
      <output data-testid="replaced-item-selection">{{ replacedRoot.value() }}</output>
    </section>
    <button type="button" data-testid="replace-item-value" (click)="replacedItem.value.set('replacement-two')">Change replaced Item Options value</button>

    <h2>Multiple immutability and unmount</h2>
    <section ogAccordionMultiple [(value)]="multiple" (valueChange)="multipleOutputs.update(increment)">
      @if (multipleMounted()) {
        <article ogAccordionItem value="billing"><button ogAccordionTrigger data-testid="variant-multiple-billing">Billing</button><div ogAccordionPanel>Billing</div></article>
      }
      <article ogAccordionItem value="security"><button ogAccordionTrigger data-testid="variant-multiple-security">Security</button><div ogAccordionPanel>Security</div></article>
      <button type="button" data-testid="multiple-mount" (click)="multipleMounted.set(!multipleMounted())">Mount selected item</button>
      <output data-testid="variant-multiple-value">{{ multiple().join(',') }}</output>
      <output data-testid="variant-multiple-original">{{ original.join(',') }}</output>
      <output data-testid="variant-multiple-frozen">{{ originalFrozen }}</output>
      <output data-testid="variant-multiple-outputs">{{ multipleOutputs() }}</output>
    </section>
  `,
  styles: `
    :host {
      display: block;
      color-scheme: dark;
    }
    section {
      margin-block: 16px;
    }
    button,
    select {
      margin: 4px;
    }
    output {
      display: block;
    }
    .motion {
      padding: 4px;
    }
    .motion[data-entering][data-motion="finite"],
    .motion[data-entering][data-motion="mixed"] {
      animation: enter 800ms linear;
    }
    .motion[data-leaving][data-motion="finite"],
    .motion[data-leaving][data-motion="mixed"] {
      animation: leave 800ms linear;
    }
    .motion[data-entering][data-motion="zero"],
    .motion[data-leaving][data-motion="zero"] {
      animation: enter 0s linear;
    }
    .motion[data-entering][data-motion="infinite"],
    .motion[data-leaving][data-motion="infinite"] {
      animation: pulse 1s linear infinite;
    }
    .motion[data-entering][data-motion="mixed"] {
      animation:
        enter 800ms linear,
        pulse 1s linear infinite;
    }
    .motion[data-leaving][data-motion="mixed"] {
      animation:
        leave 800ms linear,
        pulse 1s linear infinite;
    }
    @keyframes enter {
      from {
        opacity: 0.2;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes leave {
      from {
        opacity: 1;
      }
      to {
        opacity: 0.2;
      }
    }
    @keyframes pulse {
      from {
        outline-offset: 0;
      }
      to {
        outline-offset: 2px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .motion {
        animation: none !important;
      }
    }
  `,
})
export class CoreFixture {
  readonly attached = signal(false);
  readonly keys = signal(["one", "two"]);
  readonly lateKeys = signal(["one", "two"]);
  readonly lateUnrelated = signal(0);
  readonly present = signal(true);
  readonly secondPresent = signal(true);
  readonly presenceMounted = signal(true);
  readonly motion = signal("finite");
  readonly expanded = signal(true);
  readonly disabled = signal(false);
  readonly triggerMounted = signal(true);
  readonly panelMounted = signal(true);
  readonly triggerId = signal("initial-variant-trigger");
  readonly panelId = signal("initial-variant-panel");
  readonly hiding = signal<OrigamiCollapsibleHiding>("hidden");
  readonly submits = signal(0);
  readonly expandedOutputs = signal(0);
  readonly unusedOutputs = signal(0);
  readonly itemDisabled = signal(false);
  readonly itemHiding = signal<OrigamiCollapsibleHiding>("hidden");
  readonly accordionKeys = signal(["billing", "security"]);
  readonly accordionValues = signal<Record<string, string>>({
    billing: "billing",
    security: "security",
  });
  readonly outputValue = signal<string | null>(null);
  readonly outputAction = signal("none");
  readonly outputOwner = signal(true);
  readonly outputCount = signal(0);
  readonly original: readonly string[] = Object.freeze(["unmounted"]);
  readonly originalFrozen = Object.isFrozen(this.original);
  readonly multiple = signal<readonly string[]>(this.original);
  readonly multipleMounted = signal(true);
  readonly multipleOutputs = signal(0);
  readonly keyboardValue = signal<string | null>(null);
  readonly keyboardOutputs = signal(0);
  readonly generatedKeys = signal(["one", "two"]);
  readonly replacedItem = inject(ReplacedItemValue);
  readonly increment = (value: number): number => value + 1;

  singleOutput(value: string | null): void {
    this.outputCount.update(this.increment);

    const action = this.outputAction();

    this.outputAction.set("none");

    if (action === "replace-selection" && value === "billing") {
      this.outputValue.set("security");
    }

    if (action === "destroy") {
      this.outputOwner.set(false);
    }
  }

  setMotion(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      throw new Error("Expected a motion select");
    }

    this.motion.set(event.target.value);
  }
}
