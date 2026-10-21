import { Component, signal } from "@angular/core";
import { OrigamiPresence } from "@loozo/origami-ui/presence";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
} from "@loozo/origami-ui/accordion";
import { OrigamiToggleGroupSingle, OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";
import { OrigamiToolbar, OrigamiToolbarToggleGroupMultiple } from "@loozo/origami-ui/toolbar";

// L7 A7 A8 U8: the `state` that composing directives expose through their template references.
// Each case sits under an ancestor that provides a contradicting State of the same kind, so a
// `state` resolved from an ancestor instead of the element's own composed primitive shows. Each
// case is identified by `data-state-case`.

@Component({
  selector: "acceptance-composed-state-cases",
  imports: [
    OrigamiPresence,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiAccordionSingle,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupItem,
    OrigamiToolbar,
    OrigamiToolbarToggleGroupMultiple,
  ],
  template: `
    <h2>Collapsible Panel state</h2>
    <section data-state-case="collapsible-panel">
      <div ogPresence [present]="true">
        <div ogCollapsible [(expanded)]="detailsExpanded">
          <button ogCollapsibleTrigger data-role="trigger">Shipping details</button>
          <div ogCollapsiblePanel #panel="ogCollapsiblePanel" class="exit" data-role="panel">
            @if (panel.state.open()) {
              <p data-role="gated">Ships within two days.</p>
            }
          </div>
          <output data-role="open">{{ panel.state.open() }}</output>
        </div>
      </div>
    </section>

    <h2>Accordion Item and Panel state</h2>
    <section data-state-case="accordion">
      <div ogPresence [present]="true">
        <div ogCollapsible [expanded]="true" [disabled]="false">
          <div
            ogAccordionSingle
            [(value)]="accordionValue"
            [disabled]="accordionDisabled()"
            [collapsible]="true"
          >
            <article
              ogAccordionItem
              #billing="ogAccordionItem"
              value="billing"
              [disabled]="billingDisabled()"
            >
              <button ogAccordionTrigger data-role="billing-trigger">Billing</button>
              <div
                ogAccordionPanel
                #billingPanel="ogAccordionPanel"
                class="exit"
                data-role="billing-panel"
              >
                @if (billingPanel.state.open()) {
                  <p data-role="billing-gated">Invoices are sent monthly.</p>
                }
              </div>
              <output data-role="billing-expanded">{{ billing.state.expanded() }}</output>
              <output data-role="billing-disabled">{{ billing.state.disabled() }}</output>
              <output data-role="billing-open">{{ billingPanel.state.open() }}</output>
            </article>
            <article ogAccordionItem #security="ogAccordionItem" value="security">
              <button ogAccordionTrigger data-role="security-trigger">Security</button>
              <div ogAccordionPanel>Two-factor sign-in is on.</div>
              <output data-role="security-expanded">{{ security.state.expanded() }}</output>
              <output data-role="security-disabled">{{ security.state.disabled() }}</output>
            </article>
          </div>
        </div>
      </div>
      <button
        type="button"
        data-role="root-disable"
        (click)="accordionDisabled.set(!accordionDisabled())"
      >
        Toggle Accordion disabled
      </button>
      <button
        type="button"
        data-role="item-disable"
        (click)="billingDisabled.set(!billingDisabled())"
      >
        Toggle billing disabled
      </button>
      <button type="button" data-role="external" (click)="accordionValue.set('billing')">
        Select billing from the application
      </button>
      <output data-role="value">{{ accordionValue() }}</output>
    </section>

    <h2>ToggleGroup item state</h2>
    <section data-state-case="toggle-group-item">
      <div
        ogToggleGroupSingle
        [(value)]="alignment"
        [disabled]="alignmentDisabled()"
        aria-label="Alignment"
      >
        <button
          ogToggleGroupItem
          #start="ogToggleGroupItem"
          value="start"
          [disabled]="startDisabled()"
          data-role="start"
        >
          Start
        </button>
        <button ogToggleGroupItem #end="ogToggleGroupItem" value="end" data-role="end">End</button>
      </div>
      <output data-role="start-pressed">{{ start.state.checked() }}</output>
      <output data-role="start-disabled">{{ start.state.disabled() }}</output>
      <output data-role="end-pressed">{{ end.state.checked() }}</output>
      <output data-role="end-disabled">{{ end.state.disabled() }}</output>
      <button
        type="button"
        data-role="root-disable"
        (click)="alignmentDisabled.set(!alignmentDisabled())"
      >
        Toggle alignment disabled
      </button>
      <button type="button" data-role="item-disable" (click)="startDisabled.set(!startDisabled())">
        Toggle start disabled
      </button>
      <button type="button" data-role="external" (click)="alignment.set('start')">
        Align start from the application
      </button>

      <div ogToolbar aria-label="Format">
        <div ogToolbarToggleGroupMultiple [(value)]="marks" aria-label="Marks">
          <button
            ogToggleGroupItem
            #bold="ogToggleGroupItem"
            value="bold"
            [disabled]="boldDisabled()"
            data-role="bold"
          >
            Bold
          </button>
          <button ogToggleGroupItem #italic="ogToggleGroupItem" value="italic" data-role="italic">
            Italic
          </button>
        </div>
      </div>
      <output data-role="bold-pressed">{{ bold.state.checked() }}</output>
      <output data-role="bold-disabled">{{ bold.state.disabled() }}</output>
      <output data-role="italic-pressed">{{ italic.state.checked() }}</output>
      <button type="button" data-role="bold-disable" (click)="boldDisabled.set(!boldDisabled())">
        Toggle bold disabled
      </button>
    </section>
  `,
  styles: `
    output {
      display: block;
    }
    .exit[data-leaving] {
      animation: state-exit 1000ms linear;
    }
    @keyframes state-exit {
      from {
        opacity: 1;
      }
      to {
        opacity: 0.2;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .exit {
        animation: none !important;
      }
    }
  `,
})
export class ComposedStateCases {
  readonly detailsExpanded = signal(false);
  readonly accordionValue = signal<string | null>(null);
  readonly accordionDisabled = signal(false);
  readonly billingDisabled = signal(false);
  readonly alignment = signal<string | null>(null);
  readonly alignmentDisabled = signal(false);
  readonly startDisabled = signal(false);
  readonly marks = signal<readonly string[]>([]);
  readonly boldDisabled = signal(false);
}
