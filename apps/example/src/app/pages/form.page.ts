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
import { MaxLengthValidator } from '../shared/form/max-length-validator';
import { MaxValidator } from '../shared/form/max-validator';
import { Form } from '../shared/form/form';
import { FieldGroup } from '../shared/form/field-group';
import { FormImports } from '../shared/form';

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
  imports: [Input, Button, FormImports],
  host: {
    class: 'block py-6',
  },
  template: `
    <form
      #form="appForm"
      appForm
      [initialValue]="formValue"
      (formSubmit)="submit($event)"
      (formSubmit.invalid)="submitInvalid($event)"
      (formSubmit.valid)="submitValid($event)"
    >
      <div class="flex gap-2 p-1 border border-border rounded">
        <button type="submit" appBtn>Submit</button>
        <button type="reset" appBtn variant="secondary">Reset</button>
      </div>

      <app-field [name]="form.api.fields.name">
        <app-field-label>Name</app-field-label>
        <input appInput />
        <app-required-validator />
        <app-max-validator value="10" />
      </app-field>

      <app-field-group
        #address
        [name]="form.api.fields.address"
        [type]="formValue?.address"
      >
        <app-field-label>Address</app-field-label>

        <app-field [name]="address.api.fields.street">
          <app-field-label>Street</app-field-label>
          <input appInput />
        </app-field>

        <app-field [name]="address.api.fields.number">
          <app-field-label>Number</app-field-label>
          <input appInput />
        </app-field>
      </app-field-group>

      <app-field-array #email [name]="form.api.fields.email">
        <app-field-label> Email </app-field-label>

        <app-field-array-item
          *appFieldArrayItem="let index; let remove = remove"
          (remove)="remove()"
        >
          <app-field [name]="index">
            <input appInput />
          </app-field>
        </app-field-array-item>
      </app-field-array>
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
