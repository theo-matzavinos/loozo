import { Component, signal } from "@angular/core";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
} from "@loozo/origami-ui/collapsible";

// L6: a Collapsible whose Trigger has its own disabled and focusableWhenDisabled inputs, beside
// the root's disabled, with controls that flip one of them at a time. Each case is identified by
// `data-collapsible-case`.

@Component({
  selector: "acceptance-collapsible-cases",
  imports: [OrigamiCollapsible, OrigamiCollapsibleTrigger, OrigamiCollapsiblePanel],
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
  `,
})
export class CollapsibleCases {
  readonly expanded = signal(false);
  readonly rootDisabled = signal(false);
  readonly triggerDisabled = signal(false);
  readonly focusable = signal(false);
  readonly outputs = signal(0);
  readonly increment = (value: number): number => value + 1;
}
