import { Component, Directive, computed, inject, signal } from "@angular/core";
import {
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiCollectionState,
} from "@loozo/origami-ui/collection";
import { OrigamiPresence } from "@loozo/origami-ui/presence";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionMultiple,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
} from "@loozo/origami-ui/accordion";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";
import {
  OrigamiTabs,
  OrigamiTabsList,
  OrigamiTabsTrigger,
  OrigamiTabsPanel,
} from "@loozo/origami-ui/tabs";
import {
  OrigamiToggleGroupSingle,
  OrigamiToggleGroupMultiple,
  OrigamiToggleGroupItem,
} from "@loozo/origami-ui/toggle-group";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  type OrigamiToolbarOrientation,
} from "@loozo/origami-ui/toolbar";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";

/** Observes public Collection State without accessing registration internals. */
@Directive({
  selector: "[collectionObservation]",
  exportAs: "collectionObservation",
})
export class CollectionObservation {
  readonly state = inject(OrigamiCollectionState);
  readonly values = computed(() => {
    const values: string[] = [];

    for (const item of this.state.items()) {
      values.push(item.value());
    }

    return values.join(",");
  });
}

/** Public-import consumer seed; not a compiled or executed acceptance result. */
@Component({
  selector: "acceptance-core",
  imports: [
    OrigamiCollection,
    OrigamiCollectionItem,
    CollectionObservation,
    OrigamiPresence,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiAccordionSingle,
    OrigamiAccordionMultiple,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    OrigamiToggle,
    OrigamiTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupMultiple,
    OrigamiToggleGroupItem,
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiRadioGroup,
    OrigamiRadioGroupItem,
  ],
  template: `
    <h1>Origami public contracts</h1>

    <section ogCollection collectionObservation #collection="collectionObservation">
      <h2>Collection</h2>
      <button type="button" data-testid="reverse-items" (click)="reverseItems()">
        Reverse items
      </button>
      <button type="button" data-testid="rename-item" (click)="firstValue.set('renamed')">
        Rename first value
      </button>
      @for (key of itemKeys(); track key) {
        <span ogCollectionItem [value]="key" [attr.data-item-key]="key">{{ key }}</span>
      }
      <span ogCollectionItem [value]="firstValue()" data-testid="reactive-item">Reactive item</span>
      <div ogCollection>
        <span ogCollectionItem value="nested">Nested item</span>
      </div>
      <output data-testid="collection-values">{{ collection.values() }}</output>
    </section>

    <section>
      <h2>Presence</h2>
      <button type="button" data-testid="toggle-presence" (click)="present.set(!present())">
        Toggle presence
      </button>
      <div
        ogPresence
        #presence="ogPresence"
        [(present)]="present"
        class="motion"
        data-testid="presence-host"
        [attr.data-phase]="presence.state.phase()"
      >
        @if (presence.state.open()) {
          <p data-testid="presence-child">Retained content</p>
        }
      </div>
      <output data-testid="presence-retained">{{ presence.state.open() }}</output>
    </section>

    <section>
      <h2>Collapsible</h2>
      <button type="button" data-testid="disable-collapsible" (click)="disabled.set(!disabled())">
        Toggle disabled
      </button>
      <button type="button" data-testid="script-expand" (click)="expanded.set(true)">
        Expand from consumer
      </button>
      <button
        type="button"
        data-testid="change-trigger-id"
        (click)="triggerId.set('changed-trigger')"
      >
        Change trigger ID
      </button>
      <div
        ogCollapsible
        [(expanded)]="expanded"
        [disabled]="disabled()"
        (expandedChange)="expandedOutputs.update(increment)"
      >
        <button ogCollapsibleTrigger [id]="triggerId()" data-testid="collapsible-trigger">
          Details
        </button>
        <div
          ogCollapsiblePanel
          id="acceptance-panel"
          class="motion"
          data-testid="collapsible-panel"
        >
          <p data-testid="collapsible-child">Consumer-owned panel</p>
        </div>
      </div>
      <output data-testid="expanded-outputs">{{ expandedOutputs() }}</output>
    </section>

    <section ogAccordionSingle [(value)]="single" [collapsible]="singleCollapsible()">
      <h2>Single Accordion</h2>
      <button
        type="button"
        data-testid="toggle-single-collapsible"
        (click)="singleCollapsible.set(!singleCollapsible())"
      >
        Allow clearing selection
      </button>
      <button type="button" data-testid="set-unknown-single" (click)="single.set('unmounted')">
        Select unmounted value
      </button>
      <article ogAccordionItem value="billing">
        <h3><button ogAccordionTrigger data-testid="single-billing">Billing</button></h3>
        <div ogAccordionPanel class="motion">Billing details</div>
      </article>
      <article ogAccordionItem value="security">
        <h3><button ogAccordionTrigger data-testid="single-security">Security</button></h3>
        <div ogAccordionPanel class="motion">Security details</div>
      </article>
      <output data-testid="single-value">{{ single() }}</output>
    </section>

    <section
      ogAccordionMultiple
      [(value)]="multiple"
      (valueChange)="multipleOutputs.update(increment)"
    >
      <h2>Multiple Accordion</h2>
      <article ogAccordionItem value="billing">
        <h3><button ogAccordionTrigger data-testid="multiple-billing">Billing</button></h3>
        <div ogAccordionPanel class="motion">Billing details</div>
      </article>
      <article ogAccordionItem value="security">
        <h3><button ogAccordionTrigger data-testid="multiple-security">Security</button></h3>
        <div ogAccordionPanel class="motion">Security details</div>
      </article>
      <output data-testid="multiple-value">{{ multiple() }}</output>
      <output data-testid="multiple-original">{{ originalMultiple }}</output>
      <output data-testid="multiple-outputs">{{ multipleOutputs() }}</output>
    </section>

    <section>
      <h2>Toggle</h2>
      <button
        type="button"
        data-testid="disable-toggle"
        (click)="toggleDisabled.set(!toggleDisabled())"
      >
        Toggle disabled
      </button>
      <button type="button" data-testid="script-pressed" (click)="pressed.set(!pressed())">
        Write pressed from consumer
      </button>
      <form (submit)="$event.preventDefault(); toggleSubmits.update(increment)">
        <button
          ogToggle
          #toggle="ogToggle"
          [(pressed)]="pressed"
          [disabled]="toggleDisabled()"
          (pressedChange)="pressedOutputs.update(increment)"
          data-testid="toggle"
        >
          Bold
        </button>
      </form>
      <output data-testid="toggle-state">{{ toggle.state.pressed() }}</output>
      <output data-testid="pressed-outputs">{{ pressedOutputs() }}</output>
      <output data-testid="toggle-submits">{{ toggleSubmits() }}</output>
    </section>

    <section>
      <h2>Tabs</h2>
      <button type="button" data-testid="disable-tabs" (click)="tabsDisabled.set(!tabsDisabled())">
        Toggle Tabs disabled
      </button>
      <button
        type="button"
        data-testid="disable-billing-tab"
        (click)="toggleTabDisabled('billing')"
      >
        Toggle billing tab disabled
      </button>
      <button type="button" data-testid="script-tab" (click)="tab.set('security')">
        Select security from consumer
      </button>
      <button type="button" data-testid="script-tab-null" (click)="tab.set(null)">
        Select nothing
      </button>
      <button type="button" data-testid="script-tab-unknown" (click)="tab.set('unmounted')">
        Select an unknown value
      </button>
      <button type="button" data-testid="remove-security-tab" (click)="removeTab('security')">
        Remove security tab
      </button>
      <button type="button" data-testid="reverse-tabs" (click)="reverseTabs()">Reverse tabs</button>
      <button type="button" data-testid="restore-tabs" (click)="restoreTabs()">Restore tabs</button>
      <button
        type="button"
        data-testid="billing-panel-mount"
        (click)="billingPanelMounted.set(!billingPanelMounted())"
      >
        Mount billing panel
      </button>
      <form (submit)="$event.preventDefault(); tabSubmits.update(increment)">
        <div
          ogTabs
          #tabs="ogTabs"
          [(value)]="tab"
          [disabled]="tabsDisabled()"
          (valueChange)="tabOutputs.update(increment)"
          data-testid="tabs"
        >
          <div ogTabsList aria-label="Account" data-testid="tabs-list">
            @for (key of tabKeys(); track key) {
              <!-- Consumer-owned keys: Delete removes and D disables the focused tab. -->
              <button
                ogTabsTrigger
                [value]="key"
                [disabled]="disabledTabs().includes(key)"
                [attr.data-testid]="'tab-' + key"
                (keydown.delete)="removeTab(key)"
                (keydown.d)="toggleTabDisabled(key)"
              >
                {{ key }}
              </button>
            }
          </div>
          <div ogTabsPanel value="profile" data-testid="panel-profile">Profile panel</div>
          @if (billingPanelMounted()) {
            <div ogTabsPanel value="billing" data-testid="panel-billing">Billing panel</div>
          }
          <div ogTabsPanel value="security" tabindex="-1" data-testid="panel-security">
            <button type="button">Security settings</button>
          </div>
        </div>
      </form>
      <button type="button" data-testid="tabs-outside">Outside the tabs</button>
      <output data-testid="tabs-state">{{ tabs.state.value() }}</output>
      <output data-testid="tab-outputs">{{ tabOutputs() }}</output>
      <output data-testid="tab-submits">{{ tabSubmits() }}</output>
    </section>

    <section>
      <h2>ToggleGroup</h2>
      <button
        type="button"
        data-testid="disable-alignment"
        (click)="alignmentDisabled.set(!alignmentDisabled())"
      >
        Toggle alignment disabled
      </button>
      <button
        type="button"
        data-testid="alignment-deselectable"
        (click)="alignmentDeselectable.set(!alignmentDeselectable())"
      >
        Toggle alignment deselectable
      </button>
      <button
        type="button"
        data-testid="disable-center-alignment"
        (click)="toggleAlignmentDisabled('center')"
      >
        Toggle center disabled
      </button>
      <button type="button" data-testid="script-alignment" (click)="alignment.set('end')">
        Align end from consumer
      </button>
      <button
        type="button"
        data-testid="script-alignment-unknown"
        (click)="alignment.set('unmounted')"
      >
        Write an unknown alignment
      </button>
      <button
        type="button"
        data-testid="remove-center-alignment"
        (click)="removeAlignment('center')"
      >
        Remove center
      </button>
      <button type="button" data-testid="restore-alignments" (click)="restoreAlignments()">
        Restore alignments
      </button>
      <form (submit)="$event.preventDefault(); alignmentSubmits.update(increment)">
        <div
          ogToggleGroupSingle
          #alignmentGroup="ogToggleGroupSingle"
          [(value)]="alignment"
          [disabled]="alignmentDisabled()"
          [deselectable]="alignmentDeselectable()"
          (valueChange)="alignmentOutputs.update(increment)"
          aria-label="Text alignment"
          data-testid="alignment"
        >
          @for (key of alignmentKeys(); track key) {
            <!-- Consumer-owned keys: Delete removes and D disables the focused item. -->
            <button
              ogToggleGroupItem
              [value]="key"
              [disabled]="disabledAlignments().includes(key)"
              [attr.data-testid]="'align-' + key"
              (keydown.delete)="removeAlignment(key)"
              (keydown.d)="toggleAlignmentDisabled(key)"
            >
              {{ key }}
            </button>
          }
        </div>
      </form>
      <button type="button" data-testid="alignment-outside">Outside the alignment group</button>
      <output data-testid="alignment-value">{{ alignment() }}</output>
      <output data-testid="alignment-disabled">{{ alignmentGroup.state.disabled() }}</output>
      <output data-testid="alignment-outputs">{{ alignmentOutputs() }}</output>
      <output data-testid="alignment-submits">{{ alignmentSubmits() }}</output>

      <button type="button" data-testid="remove-italic-mark" (click)="markKeys.set(['bold', 'underline'])">
        Remove italic
      </button>
      <div
        ogToggleGroupMultiple
        [(value)]="marks"
        (valueChange)="markOutputs.update(increment)"
        aria-label="Text formatting"
        data-testid="marks"
      >
        @for (key of markKeys(); track key) {
          <button ogToggleGroupItem [value]="key" [attr.data-testid]="'mark-' + key">
            {{ key }}
          </button>
        }
      </div>
      <output data-testid="marks-value">{{ marks() }}</output>
      <output data-testid="marks-original">{{ originalMarks }}</output>
      <output data-testid="mark-outputs">{{ markOutputs() }}</output>
    </section>

    <section>
      <h2>Toolbar</h2>
      <button type="button" data-testid="toolbar-redo-disable" (click)="redoDisabled.set(!redoDisabled())">
        Toggle redo disabled
      </button>
      <button type="button" data-testid="toolbar-vertical" (click)="toolbarOrientation.set('vertical')">
        Make the toolbar vertical
      </button>
      <form (submit)="$event.preventDefault(); toolbarSubmits.update(increment)">
        <div
          ogToolbar
          #editing="ogToolbar"
          [orientation]="toolbarOrientation()"
          aria-label="Editing"
          data-testid="toolbar"
        >
          <button ogToolbarItem data-testid="toolbar-undo" (click)="undos.update(increment)">Undo</button>
          <button
            ogToolbarItem
            [disabled]="redoDisabled()"
            data-testid="toolbar-redo"
            (click)="redos.update(increment)"
          >
            Redo
          </button>
          <span role="separator" aria-orientation="vertical"></span>
          <button ogToolbarItem data-testid="toolbar-clear" (click)="clears.update(increment)">
            Clear formatting
          </button>
        </div>
      </form>
      <output data-testid="toolbar-orientation">{{ editing.state.orientation() }}</output>
      <output data-testid="toolbar-undos">{{ undos() }}</output>
      <output data-testid="toolbar-redos">{{ redos() }}</output>
      <output data-testid="toolbar-clears">{{ clears() }}</output>
      <output data-testid="toolbar-submits">{{ toolbarSubmits() }}</output>
    </section>

    <section>
      <h2 id="shipping-speed-label">Shipping speed</h2>
      <button type="button" data-testid="speed-unknown" (click)="speed.set('unmounted')">
        Write an unknown speed
      </button>
      <button type="button" data-testid="speed-null" (click)="speed.set(null)">Write null</button>
      <button type="button" data-testid="speed-standard" (click)="speed.set('standard')">
        Write standard
      </button>
      <button type="button" data-testid="speed-disable" (click)="speedDisabled.set(!speedDisabled())">
        Toggle the group disabled
      </button>
      <button type="button" data-testid="speed-same-day" (click)="sameDayAvailable.set(!sameDayAvailable())">
        Toggle same day available
      </button>
      <form (submit)="$event.preventDefault(); speedSubmits.update(increment)">
        <div
          ogRadioGroup
          #shipping="ogRadioGroup"
          [(value)]="speed"
          [disabled]="speedDisabled()"
          (valueChange)="speedOutputs.update(increment)"
          aria-labelledby="shipping-speed-label"
          data-testid="speed-group"
        >
          <button ogRadioGroupItem value="standard" data-testid="speed-radio-standard">
            Standard · 3–5 days
          </button>
          <button ogRadioGroupItem value="express" data-testid="speed-radio-express">
            Express · next day
          </button>
          <button
            ogRadioGroupItem
            value="same-day"
            [disabled]="!sameDayAvailable()"
            data-testid="speed-radio-same-day"
          >
            Same day
          </button>
        </div>
      </form>
      <output data-testid="speed-value">{{ speed() }}</output>
      <output data-testid="speed-state">{{ shipping.state.value() }}</output>
      <output data-testid="speed-state-disabled">{{ shipping.state.disabled() }}</output>
      <output data-testid="speed-outputs">{{ speedOutputs() }}</output>
      <output data-testid="speed-submits">{{ speedSubmits() }}</output>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        color-scheme: dark;
        background: #141414;
        color: #eeeeee;
        padding: 1rem;
        font-family: system-ui, sans-serif;
      }
      section {
        margin-block: 1rem 2rem;
      }
      button {
        margin: 0.25rem;
      }
      output {
        display: block;
        margin-block: 0.5rem;
      }
      .motion[data-entering] {
        animation: enter 120ms linear;
      }
      .motion[data-leaving] {
        animation: leave 120ms linear;
      }
      @keyframes enter {
        from {
          opacity: 0;
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
          opacity: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .motion {
          animation: none !important;
        }
      }
    `,
  ],
})
export class CoreConsumer {
  readonly itemKeys = signal(["one", "two"]);
  readonly firstValue = signal("original");
  readonly present = signal(true);
  readonly expanded = signal(true);
  readonly disabled = signal(false);
  readonly triggerId = signal("acceptance-trigger");
  readonly expandedOutputs = signal(0);
  readonly single = signal<string | null>(null);
  readonly singleCollapsible = signal(false);
  readonly originalMultiple: readonly string[] = Object.freeze(["unmounted"]);
  readonly multiple = signal<readonly string[]>(this.originalMultiple);
  readonly multipleOutputs = signal(0);
  readonly pressed = signal(false);
  readonly toggleDisabled = signal(false);
  readonly pressedOutputs = signal(0);
  readonly toggleSubmits = signal(0);
  readonly tab = signal<string | null>("profile");
  readonly tabKeys = signal<readonly string[]>(["profile", "billing", "security"]);
  readonly disabledTabs = signal<readonly string[]>([]);
  readonly tabsDisabled = signal(false);
  readonly billingPanelMounted = signal(true);
  readonly tabOutputs = signal(0);
  readonly tabSubmits = signal(0);
  readonly alignment = signal<string | null>("start");
  readonly alignmentKeys = signal<readonly string[]>(["start", "center", "end"]);
  readonly disabledAlignments = signal<readonly string[]>([]);
  readonly alignmentDisabled = signal(false);
  readonly alignmentDeselectable = signal(false);
  readonly alignmentOutputs = signal(0);
  readonly alignmentSubmits = signal(0);
  readonly originalMarks: readonly string[] = Object.freeze(["unmounted"]);
  readonly marks = signal<readonly string[]>(this.originalMarks);
  readonly markKeys = signal<readonly string[]>(["bold", "italic", "underline"]);
  readonly markOutputs = signal(0);
  readonly toolbarOrientation = signal<OrigamiToolbarOrientation>("horizontal");
  readonly redoDisabled = signal(true);
  readonly undos = signal(0);
  readonly redos = signal(0);
  readonly clears = signal(0);
  readonly toolbarSubmits = signal(0);
  readonly speed = signal<string | null>(null);
  readonly speedDisabled = signal(false);
  readonly sameDayAvailable = signal(false);
  readonly speedOutputs = signal(0);
  readonly speedSubmits = signal(0);
  readonly increment = (value: number): number => value + 1;

  reverseItems(): void {
    const keys = [...this.itemKeys()];

    keys.reverse();
    this.itemKeys.set(keys);
  }

  toggleTabDisabled(key: string): void {
    const disabled = this.disabledTabs();

    if (disabled.includes(key)) {
      const remaining: string[] = [];

      for (const entry of disabled) {
        if (entry !== key) {
          remaining.push(entry);
        }
      }

      this.disabledTabs.set(remaining);

      return;
    }

    this.disabledTabs.set([...disabled, key]);
  }

  removeTab(key: string): void {
    const remaining: string[] = [];

    for (const entry of this.tabKeys()) {
      if (entry !== key) {
        remaining.push(entry);
      }
    }

    this.tabKeys.set(remaining);
  }

  reverseTabs(): void {
    const keys = [...this.tabKeys()];

    keys.reverse();
    this.tabKeys.set(keys);
  }

  restoreTabs(): void {
    this.tabKeys.set(["profile", "billing", "security"]);
  }

  toggleAlignmentDisabled(key: string): void {
    const disabled = this.disabledAlignments();

    if (disabled.includes(key)) {
      const remaining: string[] = [];

      for (const entry of disabled) {
        if (entry !== key) {
          remaining.push(entry);
        }
      }

      this.disabledAlignments.set(remaining);

      return;
    }

    this.disabledAlignments.set([...disabled, key]);
  }

  removeAlignment(key: string): void {
    const remaining: string[] = [];

    for (const entry of this.alignmentKeys()) {
      if (entry !== key) {
        remaining.push(entry);
      }
    }

    this.alignmentKeys.set(remaining);
  }

  restoreAlignments(): void {
    this.alignmentKeys.set(["start", "center", "end"]);
    this.disabledAlignments.set([]);
  }
}
