import {
  computed,
  contentChild,
  Directive,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { LoozoForm } from './form';
import {
  AbstractControl,
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { LoozoFieldControl } from './field-control';
import { LoozoAbstractField } from './abstract-field';
import { LoozoAbstractControlContainer } from './abstract-control-container';

@Directive({
  selector: '[loozoField]',
  standalone: true,
  exportAs: 'loozoField',
  providers: [
    { provide: AbstractControl, useFactory: () => new FormControl() },
    { provide: LoozoAbstractControlContainer, useExisting: LoozoField },
    { provide: LoozoAbstractField, useExisting: LoozoField },
  ],
})
export class LoozoField<T = unknown> extends LoozoAbstractField<T> {
  override name = input.required<string | number>({ alias: 'loozoField' });

  fieldType = input<T>(undefined as T, { alias: 'loozoFieldType' });

  protected override type!: T;

  private formControl = inject(AbstractControl, {
    self: true,
  }) as FormControl<T>;
  private form = inject(LoozoForm);

  private valueAccessorsQuery = contentChild.required(LoozoFieldControl, {
    read: NG_VALUE_ACCESSOR,
  });
  private valueAccessors = computed<ControlValueAccessor[]>(() => {
    const result = this.valueAccessorsQuery();

    return Array.isArray(result) ? result : [result];
  });

  constructor() {
    super();
    effect(() => {
      for (const valueAccessor of this.valueAccessors()) {
        valueAccessor.registerOnChange((value?: unknown) => {
          this.formControl.setValue(value as T);
        });
        valueAccessor.registerOnTouched(() => this.formControl.markAsTouched());

        const initialValue = this.initialValue();

        for (const valueAccessor of this.valueAccessors()) {
          valueAccessor.writeValue(initialValue);
        }
      }
    });

    effect(() => {
      const initialValue = this.initialValue();

      untracked(() => {
        const value = this.value();

        if (initialValue !== value) {
          this.formControl.reset(initialValue as T);

          for (const valueAccessor of this.valueAccessors()) {
            valueAccessor.writeValue(initialValue);
          }
        }
      });
    });

    effect(() => {
      const disabled = this.disabled();

      untracked(() => {
        for (const valueAccessor of this.valueAccessors()) {
          valueAccessor.setDisabledState?.(disabled);
        }
      });
    });

    this.form.resetted.subscribe(() => {
      const initialValue = this.initialValue();

      this.formControl.reset(initialValue);

      for (const valueAccessor of this.valueAccessors()) {
        valueAccessor.writeValue(initialValue);
      }
    });
  }
}
