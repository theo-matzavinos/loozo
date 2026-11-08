import { Component, signal } from "@angular/core";
import { FormField, form, required } from "@angular/forms/signals";
import {
  OrigamiDateField,
  OrigamiDateFieldInput,
  OrigamiDateFieldSegment,
  OrigamiTimeField,
} from "@loozo/origami-ui/date-field";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import { DateSegments } from "./date-field.js";

// The Screen reader workflow's speech-only date field page (date-field.spec.ts): nothing on it is
// live, so a reader's capture holds only what focus and the fields' own changes caused. Date of
// birth is a required date field in a Field with its errors; Opens at a 12-hour time field. The
// probes compare what an empty segment announces: probe one is Origami's default placeholder,
// probe two Origami with an "mm/dd/yyyy" placeholder, probe three static segments with
// aria-valuetext "Empty" (React Aria's choice), probe four static segments with the placeholder as
// aria-valuetext, and probe five an empty 12-hour time field. The static segments copy an empty
// Origami segment's attributes otherwise, with no value or bounds, and do nothing when typed into:
// only focus is driven on them.

const placeholders: Record<string, string> = { month: "mm", day: "dd", year: "yyyy" };

const errorMessages: Record<string, string> = {
  required: "Enter your date of birth",
  dateIncomplete: "Enter a complete date",
  dateInvalid: "Enter a date that exists",
};

@Component({
  selector: "acceptance-date-field-speech-fixture",
  imports: [
    FormField,
    OrigamiDateField,
    OrigamiDateFieldInput,
    OrigamiDateFieldSegment,
    OrigamiTimeField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    DateSegments,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach the page
    </button>
    <span data-testid="fixture-attached">{{ attached() }}</span>

    <section>
      <h2>Applicant</h2>
      <button type="button" data-testid="birth-before">Before the date of birth</button>
      <div ogField #birthField="ogField">
        <span ogFieldLabel>Date of birth</span>
        <div ogDateField locale="en-US" data-testid="birth-root" [formField]="applicant.birth">
          <date-segments group="birth-group" />
        </div>
        <p ogFieldDescription>Month, day, year</p>
        @if (birthField.state.errorsShown()) {
          <p ogFieldError>{{ message(birthField.state.errors()[0]?.kind) }}</p>
        }
      </div>
      <button type="button" data-testid="birth-after">After the date of birth</button>
    </section>

    <section>
      <h2>Shop</h2>
      <button type="button" data-testid="opens-before">Before the opening time</button>
      <div ogField>
        <span ogFieldLabel>Opens at</span>
        <div
          ogTimeField
          locale="en-US"
          data-testid="opens-root"
          [hourCycle]="12"
          [(value)]="opensAt"
        >
          <date-segments group="opens-group" />
        </div>
      </div>
      <button type="button" data-testid="opens-after">After the opening time</button>
    </section>

    <section>
      <h2>Empty segments</h2>
      <div ogField>
        <span ogFieldLabel>Probe one</span>
        <div ogDateField locale="en-US">
          <date-segments group="probe1-group" />
        </div>
      </div>

      <div ogField>
        <span ogFieldLabel>Probe two</span>
        <div ogDateField locale="en-US" #probe2="ogDateField">
          <div ogDateFieldInput data-testid="probe2-group">
            @for (part of probe2.state.segments(); track part.key) {
              @if (part.type === "literal") {
                <span aria-hidden="true">{{ part.text }}</span>
              } @else {
                <span
                  [ogDateFieldSegment]="part.type"
                  [placeholder]="placeholders[part.type] ?? null"
                  [attr.data-segment]="part.type"
                ></span>
              }
            }
          </div>
        </div>
      </div>

      <span id="probe3-label">Probe three</span>
      <div role="group" aria-labelledby="probe3-label" data-testid="probe3-group">
        <span
          id="probe3-month"
          role="spinbutton"
          contenteditable="true"
          tabindex="0"
          inputmode="numeric"
          aria-label="month"
          aria-labelledby="probe3-label probe3-month"
          aria-valuetext="Empty"
          data-segment="month"
          >––</span
        ><span aria-hidden="true">/</span
        ><span
          id="probe3-day"
          role="spinbutton"
          contenteditable="true"
          tabindex="0"
          inputmode="numeric"
          aria-label="day"
          aria-labelledby="probe3-label probe3-day"
          aria-valuetext="Empty"
          data-segment="day"
          >––</span
        ><span aria-hidden="true">/</span
        ><span
          id="probe3-year"
          role="spinbutton"
          contenteditable="true"
          tabindex="0"
          inputmode="numeric"
          aria-label="year"
          aria-labelledby="probe3-label probe3-year"
          aria-valuetext="Empty"
          data-segment="year"
          >––––</span
        >
      </div>

      <span id="probe4-label">Probe four</span>
      <div role="group" aria-labelledby="probe4-label" data-testid="probe4-group">
        <span
          id="probe4-month"
          role="spinbutton"
          contenteditable="true"
          tabindex="0"
          inputmode="numeric"
          aria-label="month"
          aria-labelledby="probe4-label probe4-month"
          aria-valuetext="mm"
          data-segment="month"
          >mm</span
        ><span aria-hidden="true">/</span
        ><span
          id="probe4-day"
          role="spinbutton"
          contenteditable="true"
          tabindex="0"
          inputmode="numeric"
          aria-label="day"
          aria-labelledby="probe4-label probe4-day"
          aria-valuetext="dd"
          data-segment="day"
          >dd</span
        ><span aria-hidden="true">/</span
        ><span
          id="probe4-year"
          role="spinbutton"
          contenteditable="true"
          tabindex="0"
          inputmode="numeric"
          aria-label="year"
          aria-labelledby="probe4-label probe4-year"
          aria-valuetext="yyyy"
          data-segment="year"
          >yyyy</span
        >
      </div>

      <div ogField>
        <span ogFieldLabel>Probe five</span>
        <div ogTimeField locale="en-US" [hourCycle]="12">
          <date-segments group="probe5-group" />
        </div>
      </div>
    </section>
  `,
  styles: `
    [role="group"] {
      display: inline-flex;
      gap: 2px;
      padding: 4px;
      border: 1px solid #555555;
    }

    [role="spinbutton"]:focus {
      background: #444466;
      outline: none;
    }

    [data-placeholder] {
      opacity: 0.6;
    }
  `,
})
export class DateFieldSpeechFixture {
  readonly attached = signal(false);
  readonly placeholders = placeholders;
  readonly model = signal({ birth: null as string | null });
  readonly applicant = form(this.model, (path) => {
    required(path.birth);
  });
  readonly opensAt = signal<string | null>("09:30");

  message(kind: string | undefined): string {
    if (kind === undefined) {
      return "";
    }

    return errorMessages[kind] ?? kind;
  }
}
