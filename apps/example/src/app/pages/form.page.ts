import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { LoozoFormImports, LoozoFormSubmit } from '@loozo/forms';
import { Label } from '../shared/label';
import { Input } from '../shared/input';
import { Button } from '../shared/button';

export type Form = {
  name: string;
  address: {
    street: string;
    number: string;
  };
  email: string[];
};

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Label, Input, Button, LoozoFormImports],
  template: `
    <form
      [loozoForm]="formValue()"
      (loozoSubmit)="submit($event)"
      (loozoSubmit.invalid)="submitInvalid($event)"
      (loozoSubmit.valid)="submitValid($event)"
    >
      <div class="flex gap-2">
        <button type="reset" appBtn>Submit</button>
        <button type="reset" appBtn variant="secondary">Reset</button>
      </div>

      <div #name="loozoField" loozoField="name">
        <label loozoFieldLabel appLabel>Name</label>
        <input loozoFieldControl appInput />
        <div *loozoRequiredValidator>Required</div>
        <div *loozoMaxValidator="10">Max value 10</div>

        <!-- @if (a.invalid()) {
          @for (message of a.validationMessages(); track message) {
            <ng-container [ngTemplateOutlet]="message" />
          }
        } -->
      </div>

      <fieldset loozoFieldGroup="address">
        <legend appLabel>Address</legend>

        <div loozoField="street">
          <label loozoFieldLabel appLabel>Street</label>
          <input loozoFieldControl appInput />
        </div>

        <div loozoField="number">
          <label loozoFieldLabel appLabel>Number</label>
          <input loozoFieldControl appInput />
        </div>
      </fieldset>

      <fieldset #email="loozoFieldArray" loozoFieldArray="email">
        <legend>
          Email
          <button type="button" appBtn size="sm" (click)="email.addItem()">
            Add
          </button>
        </legend>

        <ul>
          <li
            *loozoFieldArrayItem="let index; let remove = remove"
            [loozoField]="index"
          >
            <button
              type="button"
              appBtn
              variant="destructive"
              size="sm"
              (click)="remove()"
            >
              Remove
            </button>
            <input loozoFieldControl appInput />
          </li>
        </ul>
      </fieldset>
    </form>
  `,
})
export default class FormPage {
  formValue = signal<Form>({
    name: '',
    address: {
      number: '',
      street: '',
    },
    email: [],
  });

  submit(event: LoozoFormSubmit) {
    console.log('Submit', event);
  }

  submitInvalid(event: Partial<Form>) {
    console.log('Submit Invalid', event);
  }

  submitValid(event: Form) {
    console.log('Submit Valid', event);
  }
}
