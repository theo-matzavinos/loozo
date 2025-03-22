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

export type RadianRadioContext = ReturnType<
  (typeof RadianRadio)['contextFactory']
>;

export const RadianRadioContext = new InjectionToken<RadianRadioContext>(
  '[Radian] Radio Context',
);

@Directive({
  selector: '[radianRadio]',
  exportAs: 'radianRadio',
  providers: [
    {
      provide: RadianRadioContext,
      useFactory: RadianRadio.contextFactory,
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
    'data-radian-radio': '',
  },
})
export class RadianRadio {
  /** Whether this radio is checked. Emits when the radio is toggled. */
  checked = model<RadianCheckedState>(false);
  /** Whether this control is disabled. */
  disabled = input(false, {
    transform: booleanAttribute,
  });
  /** Whether the radio is required. For a11y purposes - does not perform validation. */
  required = input(false, { transform: booleanAttribute });
  /**
   * Name of the form control. Submitted with the form as part of a name/value pair.
   */
  name = input<string>();
  /**
   * A string representing the value of the radio.
   */
  value = input('on');
  /**
   * Associates the control with a form element.
   */
  form = input<string>();

  /** The current state of the radio. */
  state = computed(() =>
    this.controlValueAccessor.value() ? 'checked' : 'unchecked',
  );

  private controlValueAccessor = inject(RadianControlValueAccessor);

  /** Toggles the radio. */
  toggle() {
    /** Radios cannot be unchecked. */
    if (this.controlValueAccessor.value()) {
      return;
    }

    this.controlValueAccessor.setValue(true);
  }

  private static contextFactory() {
    const radio = inject(RadianRadio);
    const controlValueAccessor = inject<
      RadianControlValueAccessor<boolean | undefined>
    >(RadianControlValueAccessor);

    return {
      checked: controlValueAccessor.value,
      disabled: controlValueAccessor.disabled,
      required: radio.required,
      value: radio.value,
      name: radio.name,
      form: radio.form,
      state: computed(() => {
        return controlValueAccessor.value() ? 'checked' : 'unchecked';
      }),
      toggle() {
        radio.toggle();
      },
    };
  }
}
