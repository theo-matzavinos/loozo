import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  input,
} from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianControlValueAccessor } from '@loozo/radian/common';
import { RadianCheckboxContext, RadianCheckedState } from './checkbox-context';

@Directive({
  selector: '[radianCheckbox]',
  exportAs: 'radianCheckbox',
  providers: [
    {
      provide: RadianCheckboxContext,
      useFactory: RadianCheckbox.contextFactory,
    },
  ],
  hostDirectives: [
    {
      directive: RadianControlValueAccessor,
      inputs: ['value:checked', 'disabled'],
    },
  ],
})
export class RadianCheckbox {
  /** Whether this checkbox is checked. */
  checked = input<RadianCheckedState>(false);
  /** Whether this control is disabled. */
  disabled = input(false, {
    transform: booleanAttribute,
  });
  /** Whether the checkbox is required. For a11y purposes - does not perform validation. */
  required = input(false, { transform: booleanAttribute });
  /**
   * Name of the form control. Submitted with the form as part of a name/value pair.
   */
  name = input<string>();
  /**
   * A string representing the value of the checkbox.
   */
  value = input('on');
  /**
   * Associates the control with a form element.
   */
  form = input<string>();

  private controlValueAccessor = inject(RadianControlValueAccessor);

  /** Emits when the checkbox is toggled. */
  checkedChange = outputFromObservable(
    outputToObservable(this.controlValueAccessor.valueChange),
  );

  /** Toggles the checkbox. */
  toggle() {
    const checked = this.controlValueAccessor.value();

    if (checked === 'indeterminate') {
      this.controlValueAccessor.setValue(true);
    }

    this.controlValueAccessor.setValue(!checked);
  }

  private static contextFactory(): RadianCheckboxContext {
    const checkbox = inject(RadianCheckbox);
    const controlValueAccessor = inject<
      RadianControlValueAccessor<RadianCheckedState | undefined>
    >(RadianControlValueAccessor);

    return {
      checked: controlValueAccessor.value,
      disabled: controlValueAccessor.disabled,
      required: checkbox.required,
      value: checkbox.value,
      name: checkbox.name,
      form: checkbox.form,
      state: computed(() => {
        const checked = controlValueAccessor.value();

        if (checked === 'indeterminate') {
          return checked;
        }

        return checked ? 'checked' : 'unchecked';
      }),
      toggle() {
        checkbox.toggle();
      },
    };
  }
}
