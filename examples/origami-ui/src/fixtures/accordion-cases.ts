import { Component, input, linkedSignal, signal } from "@angular/core";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
} from "@loozo/origami-ui/accordion";

// A6: a non-collapsible Single Accordion whose locked Trigger is also root- or item-disabled, in
// each initial state, with controls that flip one disabled source at a time. Each case is
// identified by `data-accordion-case`.
//
// A10: a Single Accordion whose collapsed until-found items hold required fields, in a form that
// validates natively. Item `a` starts selected; `b` and `c` each hold an empty required field.

/** One Single Accordion [a, b] whose value, root and item `a` disabled state start from inputs. */
@Component({
  selector: "acceptance-locked-accordion",
  imports: [
    OrigamiAccordionSingle,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
  ],
  host: { "[attr.data-accordion-case]": "name()" },
  template: `
    <section
      ogAccordionSingle
      [(value)]="value"
      [collapsible]="collapsible()"
      [disabled]="rootDisabled()"
    >
      <article ogAccordionItem value="a" [disabled]="itemDisabled()">
        <h3>
          <button ogAccordionTrigger data-role="a">{{ name() }} A</button>
        </h3>
        <div ogAccordionPanel>{{ name() }} A details</div>
      </article>
      <article ogAccordionItem value="b">
        <h3>
          <button ogAccordionTrigger data-role="b">{{ name() }} B</button>
        </h3>
        <div ogAccordionPanel>{{ name() }} B details</div>
      </article>
    </section>
    <button type="button" data-role="item" (click)="itemDisabled.set(!itemDisabled())">
      Toggle {{ name() }} item A disabled
    </button>
    <button type="button" data-role="root" (click)="rootDisabled.set(!rootDisabled())">
      Toggle {{ name() }} root disabled
    </button>
    <button type="button" data-role="collapsible" (click)="collapsible.set(!collapsible())">
      Toggle {{ name() }} collapsible
    </button>
    <button type="button" data-role="select-a" (click)="value.set('a')">
      Select {{ name() }} A
    </button>
    <button type="button" data-role="select-b" (click)="value.set('b')">
      Select {{ name() }} B
    </button>
    <output data-role="value">{{ value() }}</output>
  `,
})
export class LockedAccordion {
  readonly name = input.required<string>();
  readonly initialValue = input<string | null>("a");
  readonly initialItemDisabled = input(false);
  readonly initialRootDisabled = input(false);
  readonly value = linkedSignal(() => this.initialValue());
  readonly itemDisabled = linkedSignal(() => this.initialItemDisabled());
  readonly rootDisabled = linkedSignal(() => this.initialRootDisabled());
  readonly collapsible = signal(false);
}

@Component({
  selector: "acceptance-invalid-accordion",
  imports: [
    OrigamiAccordionSingle,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
  ],
  host: { "data-accordion-case": "invalid" },
  template: `
    <form (submit)="$event.preventDefault(); submits.update(increment)">
      <section ogAccordionSingle [(value)]="value">
        @for (key of keys; track key) {
          <article ogAccordionItem [value]="key" hiding="until-found">
            <h3>
              <button ogAccordionTrigger [attr.data-role]="key">Section {{ key }}</button>
            </h3>
            <div ogAccordionPanel [attr.data-role]="key + '-panel'">
              <label>
                Field {{ key }}
                <input [name]="key" [required]="key !== 'a'" [attr.data-role]="key + '-field'" />
              </label>
            </div>
          </article>
        }
      </section>
      <button data-role="submit">Save</button>
    </form>
    <output data-role="value">{{ value() }}</output>
    <output data-role="submits">{{ submits() }}</output>
  `,
})
export class InvalidAccordion {
  readonly keys = ["a", "b", "c"];
  readonly value = signal<string | null>("a");
  readonly submits = signal(0);
  readonly increment = (value: number): number => value + 1;
}

@Component({
  selector: "acceptance-accordion-cases",
  imports: [LockedAccordion, InvalidAccordion],
  template: `
    <h2>Accordion locked Trigger with a disabled source</h2>
    <acceptance-locked-accordion name="item-disabled" [initialItemDisabled]="true" />
    <acceptance-locked-accordion name="root-disabled" [initialRootDisabled]="true" />
    <acceptance-locked-accordion name="enabled" />
    <acceptance-locked-accordion name="unselected" initialValue="b" [initialItemDisabled]="true" />
    <h2>Accordion holding required fields</h2>
    <acceptance-invalid-accordion />
  `,
})
export class AccordionCases {}
