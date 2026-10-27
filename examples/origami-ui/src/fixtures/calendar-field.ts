import { Component, signal } from "@angular/core";
import { FormField, disabled, form, readonly, required, submit } from "@angular/forms/signals";
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarGrid,
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
} from "@loozo/origami-ui/calendar";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";

// Calendar case CA14: Field and Signal Forms. Controls the tests use as script actions are buttons.

function flip(value: boolean): boolean {
  return !value;
}

@Component({
  selector: "calendar-field-cases",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiCalendar,
    OrigamiCalendarGrid,
    OrigamiCalendarCell,
    OrigamiCalendarHeading,
    OrigamiCalendarPrevious,
    OrigamiCalendarNext,
  ],
  template: `
    <section>
      <h2>Signal Forms</h2>
      <button type="button" data-testid="appeal-before">Before the appeal date</button>
      <div ogField #appealField="ogField" data-testid="appeal-field">
        <span ogFieldLabel id="appeal-label">Appeal date</span>
        <div
          ogCalendar
          #appealDate="ogCalendar"
          data-testid="appeal-root"
          today="2026-10-27"
          locale="en-US"
          minDate="2026-10-05"
          [formField]="appeal.date"
        >
          <button ogCalendarPrevious aria-label="Previous month" data-testid="appeal-previous">
            ‹
          </button>
          <h3 ogCalendarHeading id="appeal-heading">{{ appealDate.state.heading() }}</h3>
          <button ogCalendarNext aria-label="Next month" data-testid="appeal-next">›</button>
          <table ogCalendarGrid data-testid="appeal-grid">
            <tbody>
              @for (week of appealDate.state.weeks(); track $index) {
                <tr>
                  @for (day of week; track day.date) {
                    <td ogCalendarCell [date]="day.date" [attr.data-date]="day.date">
                      {{ day.label }}
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p ogFieldDescription id="appeal-description">On or after 5 October.</p>
        @if (appealField.state.errorsShown()) {
          <p ogFieldError id="appeal-error">{{ appealField.state.errors()[0]?.message }}</p>
        }
      </div>
      <button type="button" data-testid="appeal-after">After the appeal date</button>
      <output data-testid="appeal-value">{{ model().date ?? "null" }}</output>
      <output data-testid="appeal-touched">{{ appeal.date().touched() }}</output>
      <button type="button" data-testid="write-appeal" (click)="writeAppeal()">
        Write 15 October
      </button>
      <button type="button" data-testid="focus-appeal" (click)="appeal.date().focusBoundControl()">
        Focus the appeal date
      </button>
      <button type="button" data-testid="freeze-appeal" (click)="frozen.update(flip)">
        Freeze the appeal date
      </button>
      <button type="button" data-testid="lock-appeal" (click)="locked.update(flip)">
        Lock the appeal date
      </button>
      <button type="button" data-testid="submit-appeal" (click)="submitAppeal()">Submit</button>
      <output data-testid="appeal-submits">{{ submits() }}</output>
    </section>
  `,
})
export class CalendarFieldCases {
  readonly flip = flip;
  readonly frozen = signal(false);
  readonly locked = signal(false);
  readonly submits = signal(0);
  readonly model = signal<{ date: string | null }>({ date: null });
  readonly appeal = form(this.model, (path) => {
    required(path.date, { message: "Choose the appeal date." });
    readonly(path.date, () => this.frozen());
    disabled(path.date, () => this.locked());
  });

  writeAppeal(): void {
    this.model.set({ date: "2026-10-15" });
  }

  async submitAppeal(): Promise<void> {
    await submit(this.appeal, async () => {
      this.submits.update((count) => count + 1);
    });
  }
}
