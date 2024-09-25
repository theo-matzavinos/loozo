import { Directive, inject, input, output } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { LoozoFieldContainer } from './field-container';
import { LoozoAbstractControlContainer } from './abstract-control-container';

export type LoozoFormSubmitInvalid<T> = {
  valid: false;
  value: Partial<T>;
};

export type LoozoFormSubmitValid<T> = {
  valid: true;
  value: T;
};

export type LoozoFormSubmit<T> =
  | LoozoFormSubmitInvalid<T>
  | LoozoFormSubmitValid<T>;

let nextId = 0;

@Directive({
  selector: 'form[loozoForm]',
  standalone: true,
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
export class LoozoForm<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends LoozoAbstractControlContainer<T> {
  id = input(`loozo-form-${nextId++}`);
  initialValue = input<T | undefined>(undefined, { alias: 'loozoForm' });

  protected override type!: T;

  submitted = output<LoozoFormSubmit<T>>({ alias: 'loozoSubmit' });
  submittedValid = output<T>({ alias: 'loozoSubmit.valid' });
  submittedInvalid = output<Partial<T>>({ alias: 'loozoSubmit.invalid' });
  resetted = output<void>({ alias: 'loozoReset' });

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
}
