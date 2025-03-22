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

export type RadianSwitchContext = ReturnType<
  (typeof RadianSwitch)['contextFactory']
>;

export const RadianSwitchContext = new InjectionToken<RadianSwitchContext>(
  '[Radian] Switch Context',
);

@Directive({
  selector: '[radianSwitch]',
  exportAs: 'radianSwitch',
  providers: [
    { provide: RadianSwitchContext, useFactory: RadianSwitch.contextFactory },
  ],
  hostDirectives: [
    {
      directive: RadianControlValueAccessor,
      inputs: ['value:checked', 'disabled'],
      outputs: ['valueChange:checkedChange'],
    },
  ],
  host: {
    'data-radian-switch': '',
  },
})
export class RadianSwitch {
  /** Whether this switch is checked. Emits when the switch is toggled. */
  checked = model(false);
  /** Whether this control is disabled. */
  disabled = input(false, {
    transform: booleanAttribute,
  });
  /** Whether the switch is required. For a11y purposes - does not perform validation. */
  required = input(false, { transform: booleanAttribute });
  /**
   * Name of the form control. Submitted with the form as part of a name/value pair.
   */
  name = input<string>();
  /**
   * A string representing the value of the switch.
   */
  value = input('on');
  /**
   * Associates the control with a form element.
   */
  form = input<string>();

  /** The current state of the switch. */
  state = computed(() => {
    return this.controlValueAccessor.value() ? 'checked' : 'unchecked';
  });

  private controlValueAccessor = inject(RadianControlValueAccessor);

  /** Toggles the switch. */
  toggle() {
    const checked = this.controlValueAccessor.value();

    this.controlValueAccessor.setValue(!checked);
  }

  private static contextFactory() {
    const instance = inject(RadianSwitch);
    const controlValueAccessor = inject<
      RadianControlValueAccessor<boolean | undefined>
    >(RadianControlValueAccessor);

    return {
      checked: controlValueAccessor.value,
      disabled: controlValueAccessor.disabled,
      required: instance.required,
      value: instance.value,
      name: instance.name,
      form: instance.form,
      state: instance.state,
      toggle() {
        instance.toggle();
      },
    };
  }
}
