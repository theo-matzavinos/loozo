import {
  computed,
  contentChild,
  effect,
  inject,
  input,
  untracked,
  Directive,
} from '@angular/core';
import { LoozoForm } from './form';
import {
  AbstractControl,
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { LoozoAbstractField } from './abstract-field';
import { LoozoAbstractControlContainer } from './abstract-control-container';

/** Component that contains a field. */
@Directive({
  selector: '[loozoField]',
  exportAs: 'loozoField',

  providers: [
    { provide: AbstractControl, useFactory: () => new FormControl() },
    { provide: LoozoAbstractControlContainer, useExisting: LoozoField },
    { provide: LoozoAbstractField, useExisting: LoozoField },
  ],
})
export class LoozoField<T = unknown> extends LoozoAbstractField<T> {
  override _name = input.required<string | number>({ alias: 'loozoField' });
  /** The type of this field's value (optional). */
  type = input<T>();

  private formControl = inject(AbstractControl, {
    self: true,
  }) as FormControl<T>;
  private form = inject(LoozoForm);

  private valueAccessorsQuery = contentChild.required(NG_VALUE_ACCESSOR, {
    descendants: true,
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

  /** Sets the value of the control. */
  setValue(value: T, options?: Parameters<FormControl['setValue']>[1]): void {
    throw this.abstractControl.setValue(value, options);
  }

  /** Patches the value of the control. */
  patchValue(
    value: T,
    options?: Parameters<FormControl['patchValue']>[1],
  ): void {
    this.abstractControl.patchValue(value, options);
  }

  /** Resets the control. */
  reset(value?: T, options?: Parameters<FormControl['reset']>[1]): void {
    this.abstractControl.reset(value, options);
  }
}
