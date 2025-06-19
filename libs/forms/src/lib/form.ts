import { Directive, inject, input, output } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { LoozoFieldContainer } from './field-container';
import { LoozoAbstractControlContainer } from './abstract-control-container';
import { createFieldsProxy } from './fields-proxy';

export type LoozoFormSubmitInvalid<T = unknown> = {
  valid: false;
  value: Partial<T>;
};

export type LoozoFormSubmitValid<T = unknown> = {
  valid: true;
  value: T;
};

export type LoozoFormSubmit<T = unknown> =
  | LoozoFormSubmitInvalid<T>
  | LoozoFormSubmitValid<T>;

let uniqueId = 0;

/** Directive that creates a form. */
@Directive({
  selector: 'form[loozoForm]',

  exportAs: 'loozoForm',
  providers: [
    { provide: AbstractControl, useFactory: () => new FormGroup({}) },
    { provide: LoozoAbstractControlContainer, useExisting: LoozoForm },
    {
      provide: LoozoFieldContainer,
      useFactory: () => {
        const formGroup = inject(AbstractControl, { self: true }) as FormGroup;
        const form = inject(LoozoForm, { self: true });

        return {
          id: form.id,
          addField(name, control) {
            formGroup.addControl(`${name}`, control);
          },
          removeField(name) {
            formGroup.removeControl(`${name}`);
          },
          getInitialValue(name) {
            return form.initialValue()?.[name];
          },
        } as LoozoFieldContainer;
      },
    },
  ],
  host: {
    '[id]': 'id()',
    novalidate: '',
    '(submit)': 'onSubmit($event)',
    '(reset)': 'onReset($event)',
  },
})
export class LoozoForm<T> extends LoozoAbstractControlContainer<T> {
  /** @internal */
  id = input(`loozo-form-${uniqueId++}`);
  /**
   * The initial value of the form (optional).
   * Can be used to define the type of this form's value.
   *  */
  initialValue = input<T | undefined>(undefined);

  /** Emits everytime the form is submitted. */
  submitted = output<LoozoFormSubmit<T>>({ alias: 'loozoSubmit' });
  /** Emits when the form is submitted and is valid. */
  submittedValid = output<T>({ alias: 'loozoSubmit.valid' });
  /** Emits when the form is submitted and is invalid. */
  submittedInvalid = output<Partial<T>>({ alias: 'loozoSubmit.invalid' });
  /** Emits when the form is reset. */
  resetted = output<void>({ alias: 'loozoReset' });

  /**
   * Can be used to get the property names from the form's value
   * to be bind them to the `name` input on `loozo-field`s.
   * You must provide the correct type with the `initialValue` input.
   * */
  fields = createFieldsProxy<T>();

  private formGroup = inject(AbstractControl, { self: true }) as FormGroup;

  protected onSubmit(event: SubmitEvent) {
    event.stopPropagation();
    event.preventDefault();
    this.formGroup.markAllAsTouched();
    this.submitted.emit({
      valid: this.formGroup.valid,
      value: this.formGroup.value as T,
    });

    if (this.formGroup.valid) {
      this.submittedValid.emit(this.formGroup.value as T);
    } else {
      this.submittedInvalid.emit(this.formGroup.value);
    }
  }

  protected onReset(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.resetted.emit();
  }

  /** Resets the form. */
  reset(value?: T, options?: Parameters<FormGroup['reset']>[1]): void {
    this.abstractControl.reset(value, options);
    this.resetted.emit();
  }
}
