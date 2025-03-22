import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  InjectionToken,
  input,
  model,
} from '@angular/core';
import { RadianControlValueAccessor } from '@loozo/radian/common';

export type RadianCheckedState = boolean | 'indeterminate';

export type RadianCheckboxContext = ReturnType<
  (typeof RadianCheckbox)['contextFactory']
>;

export const RadianCheckboxContext = new InjectionToken<RadianCheckboxContext>(
  '[Radian] Checkbox Context',
);

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
      outputs: ['valueChange:checkedChange'],
    },
  ],
  host: {
    'data-radian-checkbox': '',
  },
})
export class RadianCheckbox {
  /** Whether this checkbox is checked. Emits when the checkbox is toggled. */
  checked = model<RadianCheckedState>(false);
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

  /** Toggles the checkbox. */
  toggle() {
    const checked = this.controlValueAccessor.value();

    if (checked === 'indeterminate') {
      this.controlValueAccessor.setValue(true);
    }

    this.controlValueAccessor.setValue(!checked);
  }

  private static contextFactory() {
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
