import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  LoozoFieldArray,
  LoozoFieldArrayItem,
  LoozoFieldGroup,
  LoozoForm,
  LoozoFormSubmit,
} from '@loozo/forms';
import { Input } from '../shared/input';
import { Button } from '../shared/button';
import { Field } from '../shared/form/field';
import { FieldLabel } from '../shared/form/field-label';
import { RequiredValidator } from '../shared/form/required-validator';
import { LoozoMaxLengthValidator } from '../shared/form/max-length-validator';
import { MaxValidator } from '../shared/form/max-validator';

export type FormValue = {
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
  imports: [
    Input,
    Button,
    LoozoForm,
    Field,
    FieldLabel,
    RequiredValidator,
    LoozoMaxLengthValidator,
    MaxValidator,
    LoozoFieldGroup,
    LoozoFieldArray,
    LoozoFieldArrayItem,
  ],
  template: `
    <form
      #form="loozoForm"
      loozoForm
      [initialValue]="formValue"
      (loozoSubmit)="submit($event)"
      (loozoSubmit.invalid)="submitInvalid($event)"
      (loozoSubmit.valid)="submitValid($event)"
    >
      <div class="flex gap-2">
        <button type="submit" appBtn>Submit</button>
        <button type="reset" appBtn variant="secondary">Reset</button>
      </div>

      <app-field [name]="form.fields.name">
        <label appFieldLabel>Name</label>
        <input appInput />
        <app-required-validator />
        <app-max-validator value="10" />
      </app-field>

      <fieldset
        #address="loozoFieldGroup"
        [loozoFieldGroup]="form.fields.address"
        [loozoFieldGroupType]="formValue?.address"
      >
        <legend>Address</legend>

        <app-field [name]="address.fields.street">
          <label appLabel>Street</label>
          <input appInput />
        </app-field>

        <app-field [name]="address.fields.number">
          <label appLabel>Number</label>
          <input appInput />
        </app-field>
      </fieldset>

      <fieldset #email="loozoFieldArray" [loozoFieldArray]="form.fields.email">
        <legend>
          Email
          <button type="button" appBtn size="sm" (click)="email.addItem()">
            Add
          </button>
        </legend>

        <ul>
          <li *loozoFieldArrayItem="let index; let remove = remove">
            <button
              type="button"
              appBtn
              variant="destructive"
              size="sm"
              (click)="remove()"
            >
              Remove
            </button>
            <app-field [name]="index">
              <input appInput />
            </app-field>
          </li>
        </ul>
      </fieldset>
    </form>
  `,
})
export default class FormPage {
  formValue!: FormValue;

  submit(event: LoozoFormSubmit) {
    console.log('Submit', event);
  }

  submitInvalid(event: Partial<FormValue>) {
    console.log('Submit Invalid', event);
  }

  submitValid(event: FormValue) {
    console.log('Submit Valid', event);
  }
}
