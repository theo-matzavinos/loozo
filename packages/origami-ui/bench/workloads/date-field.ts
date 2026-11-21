import { Component, signal } from "@angular/core";
import {
  OrigamiDateField,
  OrigamiDateFieldInput,
  OrigamiDateFieldSegment,
} from "@loozo/origami-ui/date-field";

@Component({
  selector: "bench-root, bench-date-field",
  imports: [OrigamiDateField, OrigamiDateFieldInput, OrigamiDateFieldSegment],
  template: `
    <div ogDateField [(value)]="birthDate" #date="ogDateField">
      <div ogDateFieldInput aria-label="Date of birth">
        @for (part of date.state.segments(); track part.key) {
          @if (part.type === "literal") {
            <span aria-hidden="true">{{ part.text }}</span>
          } @else {
            <span [ogDateFieldSegment]="part.type"></span>
          }
        }
      </div>
    </div>
    <p>Date of birth: {{ birthDate() ?? "none" }}</p>
  `,
})
export class Workload {
  readonly birthDate = signal<string | null>(null);
}
