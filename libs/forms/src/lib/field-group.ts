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
export class LoozoFieldGroup<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends LoozoAbstractField<T> {
  override name = input.required<string | number>({ alias: 'loozoFieldGroup' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  valueType = input<T>(undefined as any, { alias: 'loozoFieldGroupType' });

  protected override type!: T;
}
