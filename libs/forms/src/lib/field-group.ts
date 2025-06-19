import { Directive, inject, input } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { LoozoFieldContainer } from './field-container';
import { LoozoAbstractControlContainer } from './abstract-control-container';
import { LoozoAbstractField } from './abstract-field';
import { createFieldsProxy } from './fields-proxy';

/** Directive used to define fields that have an object value. */
@Directive({
  selector: '[loozoFieldGroup]',

  exportAs: 'loozoFieldGroup',
  providers: [
    { provide: AbstractControl, useFactory: () => new FormGroup({}) },
    { provide: LoozoAbstractControlContainer, useExisting: LoozoFieldGroup },
    { provide: LoozoAbstractField, useExisting: LoozoFieldGroup },
    {
      provide: LoozoFieldContainer,
      useFactory: () => {
        const formGroup = inject(AbstractControl, { self: true }) as FormGroup;
        const field = inject(LoozoAbstractField, { self: true });

        return {
          id: field.id,
          addField(name, control) {
            formGroup.addControl(`${name}`, control);
          },
          removeField(name) {
            formGroup.removeControl(`${name}`);
          },
          getInitialValue(name) {
            return field.initialValue()?.[name];
          },
        } as LoozoFieldContainer;
      },
    },
  ],
})
export class LoozoFieldGroup<T> extends LoozoAbstractField<T> {
  /** The name of the field. */
  override _name = input.required<string | number>({
    alias: 'loozoFieldGroup',
  });
  /** The type of this field's value (optional). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  valueType = input<T>(undefined as any, { alias: 'loozoFieldGroupType' });

  /**
   * Can be used to get the property names from the field group's value
   * to be bind them to the `name` input on `loozo-field`s.
   * */
  fields = createFieldsProxy<T>();

  /** Sets the value of the control. */
  setValue(value: T, options?: Parameters<FormGroup['setValue']>[1]): void {
    throw this.abstractControl.setValue(value, options);
  }

  /** Patches the value of the control. */
  patchValue(value: T, options?: Parameters<FormGroup['patchValue']>[1]): void {
    this.abstractControl.patchValue(value, options);
  }

  /** Resets the control. */
  reset(value?: T, options?: Parameters<FormGroup['reset']>[1]): void {
    this.abstractControl.reset(value, options);
  }
}
