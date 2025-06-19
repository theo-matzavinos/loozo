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
import { RadianRadioContext } from './radio-context';

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
    },
  ],
})
export class RadianRadio {
  /** Whether this radio is checked. */
  checked = input(false, { transform: booleanAttribute });
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

  /** Emits when the radio is toggled. */
  checkedChange = outputFromObservable(
    outputToObservable(this.controlValueAccessor.valueChange),
  );

  /** Toggles the radio. */
  toggle() {
    /** Radios cannot be unchecked. */
    if (this.controlValueAccessor.value()) {
      return;
    }

    this.controlValueAccessor.setValue(true);
  }

  private static contextFactory(): RadianRadioContext {
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
