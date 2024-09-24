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
  ],
  hostDirectives: [
    {
      directive: LoozoAbstractControlContainer,
      inputs: ['type:loozoFieldType', 'disabled'],
    },
    {
      directive: LoozoAbstractField,
      inputs: ['name:loozoField'],
    },
  ],
})
export class LoozoField<T = unknown> {
  type = input<T>(undefined as T, { alias: 'loozoFieldType' });

  control = inject<LoozoAbstractControlContainer<T>>(
    LoozoAbstractControlContainer,
  );
  validationMessages = this.control.validationMessages;
  controlEvent = this.control.controlEvent;
  statusChange = this.control.statusChange;
  valueChange = this.control.valueChange;
  config = inject<LoozoAbstractField<T>>(LoozoAbstractField, { self: true });
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
    effect(() => {
      for (const valueAccessor of this.valueAccessors()) {
        valueAccessor.registerOnChange((value?: unknown) => {
          this.formControl.setValue(value as T);
        });
        valueAccessor.registerOnTouched(() => this.formControl.markAsTouched());

        const initialValue = this.config.initialValue();

        for (const valueAccessor of this.valueAccessors()) {
          valueAccessor.writeValue(initialValue);
        }
      }
    });

    effect(() => {
      const initialValue = this.config.initialValue();

      untracked(() => {
        const value = this.control.value();

        if (initialValue !== value) {
          this.formControl.reset(initialValue as T);

          for (const valueAccessor of this.valueAccessors()) {
            valueAccessor.writeValue(initialValue);
          }
        }
      });
    });

    effect(() => {
      const disabled = this.control.disabled();

      untracked(() => {
        for (const valueAccessor of this.valueAccessors()) {
          valueAccessor.setDisabledState?.(disabled);
        }
      });
    });

    this.form.resetted.subscribe(() => {
      const initialValue = this.config.initialValue();

      this.formControl.reset(initialValue);

      for (const valueAccessor of this.valueAccessors()) {
        valueAccessor.writeValue(initialValue);
      }
    });
  }
}
