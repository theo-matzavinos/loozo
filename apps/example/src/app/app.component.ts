import { JsonPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { LoozoFormImports } from '@loozo/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoozoFormImports, NgTemplateOutlet, JsonPipe],
  template: `
    <form #form="loozoForm" [loozoForm]="formValue()">
      <div #a="loozoField" loozoField="a">
        <label loozoFieldLabel>A</label>
        <input loozoFieldControl />
        <div *loozoRequiredValidator>Required</div>
        <div *loozoMaxValidator="10">Max value 10</div>

        @if (a.control.invalid()) {
          @for (message of a.validationMessages(); track message) {
            <ng-container [ngTemplateOutlet]="message" />
          }
        }
      </div>

      <div #b="loozoField" loozoField="b">
        <label loozoFieldLabel>B</label>
        <input loozoFieldControl />
        <div *loozoRequiredValidator>Required</div>
        <div *loozoMinValidator="0">Min value 0</div>

        @if (b.control.invalid()) {
          @for (message of b.validationMessages(); track message) {
            <ng-container [ngTemplateOutlet]="message" />
          }
        }
      </div>

      <fieldset loozoFieldGroup="c">
        <legend>C</legend>

        <div loozoField="d">
          <label loozoFieldLabel>D</label>
          <input loozoFieldControl />
        </div>

        <div loozoField="e">
          <label loozoFieldLabel>E</label>
          <input loozoFieldControl />
        </div>
      </fieldset>

      <fieldset #x="loozoFieldArray" loozoFieldArray="x">
        <legend>
          X <button type="button" (click)="x.addItem()">Add</button>
        </legend>

        <div
          *loozoFieldArrayItem="let name; let remove = remove"
          [loozoField]="name"
        >
          <button type="button" (click)="remove()">Remove</button>
          <input loozoFieldControl />
        </div>
      </fieldset>

      <div>
        <button>Submit</button>
        <button type="reset">Reset</button>
        <button type="button" (click)="random()">Random</button>
      </div>
    </form>

    <div>
      {{ form.control.value() | json }}
    </div>
  `,
})
export class AppComponent {
  title = 'example';
  formValue = signal({
    a: 3,
    b: 5,
    c: {
      d: 12,
      e: 69,
    },
  });

  random() {
    this.formValue.set({
      a: Math.random() * 10,
      b: Math.random() * 10,
      c: {
        d: Math.random() * 10,
        e: Math.random() * 10,
      },
    });
  }
}
