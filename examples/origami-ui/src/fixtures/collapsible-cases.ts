import { Component, signal } from "@angular/core";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
  type OrigamiCollapsibleHiding,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiTabs,
  OrigamiTabsList,
  OrigamiTabsTrigger,
  OrigamiTabsPanel,
} from "@loozo/origami-ui/tabs";

// L6: a Collapsible whose Trigger has its own disabled and focusableWhenDisabled inputs, beside
// the root's disabled, with controls that flip one of them at a time. Each case is identified by
// `data-collapsible-case`.
//
// L8: a collapsed Collapsible whose Panel holds a required field, in a form that validates
// natively, with controls for the root's hiding and disabled state, and one that collapses the
// root as soon as the field gets focus, and one that refuses expansion from the root's own
// output; and an expanded Collapsible Panel co-applied with a Tabs
// Panel, whose Tabs root can hide it.

/** A consumer component whose own template holds a required field; the Panel sits on its host. */
@Component({
  selector: "acceptance-contact-fields",
  host: { style: "display: block" },
  template: `<label>Email <input name="email" required data-role="required" /></label>`,
})
export class ContactFields {}

@Component({
  selector: "acceptance-collapsible-cases",
  imports: [
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    ContactFields,
  ],
  template: `
    <h2>Collapsible Trigger with its own disabled state</h2>
    <section data-collapsible-case="trigger-disabled">
      <div
        ogCollapsible
        #root="ogCollapsible"
        [(expanded)]="expanded"
        [disabled]="rootDisabled()"
        (expandedChange)="outputs.update(increment)"
        data-role="root"
      >
        <button
          ogCollapsibleTrigger
          [disabled]="triggerDisabled()"
          [focusableWhenDisabled]="focusable()"
          data-role="trigger"
        >
          Shipping details
        </button>
        <div ogCollapsiblePanel data-role="panel">Ships within two days.</div>
        <output data-role="state-disabled">{{ root.state.disabled() }}</output>
      </div>
      <button
        type="button"
        data-role="trigger-disable"
        (click)="triggerDisabled.set(!triggerDisabled())"
      >
        Toggle Trigger disabled
      </button>
      <button type="button" data-role="focusable" (click)="focusable.set(!focusable())">
        Toggle focusable when disabled
      </button>
      <button type="button" data-role="root-disable" (click)="rootDisabled.set(!rootDisabled())">
        Toggle root disabled
      </button>
      <button type="button" data-role="external" (click)="expanded.set(!expanded())">
        Toggle expanded from the application
      </button>
      <output data-role="expanded">{{ expanded() }}</output>
      <output data-role="outputs">{{ outputs() }}</output>
    </section>

    <h2>Collapsible holding a required field</h2>
    <section data-collapsible-case="invalid">
      <form (submit)="$event.preventDefault(); invalidSubmits.update(increment)">
        <label>Name <input name="name" data-role="outside" /></label>
        <div
          ogCollapsible
          #invalidRoot="ogCollapsible"
          [(expanded)]="invalidExpanded"
          [hiding]="invalidHiding()"
          [disabled]="invalidDisabled()"
          (expandedChange)="
            invalidOutputs.update(increment); veto($event, invalidPanel, invalidRoot)
          "
          data-role="root"
        >
          <button ogCollapsibleTrigger data-role="trigger">Contact</button>
          <div ogCollapsiblePanel #invalidPanel="ogCollapsiblePanel" data-role="panel">
            <label>
              Email
              <input
                name="email"
                required
                data-role="required"
                (focusin)="collapseOnFocus() && invalidRoot.expanded.set(false)"
              />
            </label>
          </div>
        </div>
        <button data-role="submit">Save</button>
      </form>
      <button type="button" data-role="hidden" (click)="invalidHiding.set('hidden')">
        Use ordinary hidden
      </button>
      <button type="button" data-role="disable" (click)="invalidDisabled.set(!invalidDisabled())">
        Toggle disabled
      </button>
      <button
        type="button"
        data-role="collapse-on-focus"
        (click)="collapseOnFocus.set(!collapseOnFocus())"
      >
        Collapse when the field gets focus
      </button>
      <button type="button" data-role="veto" (click)="vetoing.set(!vetoing())">
        Refuse expansion from the output listener
      </button>
      <output data-role="expanded">{{ invalidExpanded() }}</output>
      <output data-role="outputs">{{ invalidOutputs() }}</output>
      <output data-role="submits">{{ invalidSubmits() }}</output>
    </section>

    <h2>Expanded Collapsible Panel co-applied with a Tabs Panel</h2>
    <section data-collapsible-case="invalid-tabs">
      <form (submit)="$event.preventDefault()">
        <div ogTabs value="contact">
          <div ogTabsList>
            <button ogTabsTrigger value="contact" data-role="contact-tab">Contact</button>
            <button ogTabsTrigger value="notes" data-role="notes-tab">Notes</button>
          </div>
          <div ogCollapsible [(expanded)]="tabsExpanded">
            <button ogCollapsibleTrigger data-role="trigger">Contact details</button>
            <div ogTabsPanel ogCollapsiblePanel value="contact" data-role="panel">
              <label>Email <input name="email" required data-role="required" /></label>
            </div>
          </div>
          <div ogTabsPanel value="notes">Notes</div>
        </div>
        <button data-role="submit">Save</button>
      </form>
    </section>

    <h2>Collapsible Panel on a component host</h2>
    <section data-collapsible-case="invalid-component">
      <form (submit)="$event.preventDefault()">
        <div ogCollapsible hiding="until-found" data-role="root">
          <button ogCollapsibleTrigger data-role="trigger">Contact</button>
          <acceptance-contact-fields ogCollapsiblePanel data-role="panel" />
        </div>
        <button data-role="submit">Save</button>
      </form>
    </section>
  `,
})
export class CollapsibleCases {
  readonly expanded = signal(false);
  readonly rootDisabled = signal(false);
  readonly triggerDisabled = signal(false);
  readonly focusable = signal(false);
  readonly outputs = signal(0);
  readonly invalidExpanded = signal(false);
  readonly invalidHiding = signal<OrigamiCollapsibleHiding>("until-found");
  readonly invalidDisabled = signal(false);
  readonly invalidSubmits = signal(0);
  readonly invalidOutputs = signal(0);
  readonly collapseOnFocus = signal(false);
  readonly tabsExpanded = signal(true);
  readonly vetoing = signal(false);
  readonly increment = (value: number): number => value + 1;

  /** While vetoing, an expansion is refused from its own output, after the Panel's state is read. */
  veto(expanded: boolean, panel: OrigamiCollapsiblePanel, root: OrigamiCollapsible): void {
    if (!this.vetoing() || !expanded) {
      return;
    }

    // Reading retention makes Presence observe the opening before the refusal.
    panel.state.open();
    root.expanded.set(false);
  }
}
