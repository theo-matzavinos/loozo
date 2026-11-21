import { Component, signal } from "@angular/core";
import {
  OrigamiAccordionItem,
  OrigamiAccordionMultiple,
  OrigamiAccordionPanel,
  OrigamiAccordionSingle,
  OrigamiAccordionTrigger,
} from "@loozo/origami-ui/accordion";

@Component({
  selector: "bench-root, bench-accordion",
  imports: [
    OrigamiAccordionSingle,
    OrigamiAccordionMultiple,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
  ],
  template: `
    <section ogAccordionSingle [(value)]="selected" collapsible>
      @for (question of questions; track question.value) {
        <article ogAccordionItem [value]="question.value">
          <h3>
            <button ogAccordionTrigger>{{ question.title }}</button>
          </h3>
          <div ogAccordionPanel role="region">{{ question.answer }}</div>
        </article>
      }
    </section>
    <section ogAccordionMultiple>
      <article ogAccordionItem value="warranty">
        <h3><button ogAccordionTrigger>Is there a warranty?</button></h3>
        <div ogAccordionPanel role="region">Two years.</div>
      </article>
    </section>
  `,
})
export class Workload {
  readonly selected = signal<string | null>("returns");
  readonly questions = [
    { value: "returns", title: "Can I return an order?", answer: "Within 30 days." },
    { value: "shipping", title: "Where do you ship?", answer: "Across the EU." },
  ];
}
