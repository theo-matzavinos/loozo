import { Directive, inject, input } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { LoozoFieldContainer } from './field-container';
import { LoozoAbstractControlContainer } from './abstract-control-container';
import { LoozoAbstractField } from './abstract-field';

@Directive({
  selector: '[loozoFieldGroup]',
  standalone: true,
  exportAs: 'loozoForm',
  providers: [
    { provide: AbstractControl, useFactory: () => new FormGroup({}) },
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
  hostDirectives: [
    {
      directive: LoozoAbstractControlContainer,
      inputs: ['type:loozoFieldGroupType', 'disabled'],
    },
    {
      directive: LoozoAbstractField,
      inputs: ['name:loozoFieldGroup'],
    },
  ],
})
export class LoozoFieldGroup<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type = input<T>(undefined as any, { alias: 'loozoFieldGroupType' });

  control = inject<LoozoAbstractControlContainer<T>>(
    LoozoAbstractControlContainer,
    { self: true },
  );
  validationMessages = this.control.validationMessages;
  controlEvent = this.control.controlEvent;
  statusChange = this.control.statusChange;
  valueChange = this.control.valueChange;
  config = inject<LoozoAbstractField<T>>(LoozoAbstractField, { self: true });
}
