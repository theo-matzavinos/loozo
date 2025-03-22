import {
  booleanAttribute,
  Directive,
  inject,
  input,
  model,
} from '@angular/core';
import { RadianControlValueAccessor } from '@loozo/radian/common';

@Directive({
  selector: 'button[radianToggle]',
  exportAs: 'radianToggle',
  hostDirectives: [
    {
      directive: RadianControlValueAccessor,
      inputs: ['value:pressed', 'disabled'],
      outputs: ['valueChange:pressedChange'],
    },
  ],
  host: {
    'data-radian-toggle': '',
    type: 'button',
    '[attr.aria-pressed]': 'controlValueAccessor.value()',
    '[attr.data-state]': 'controlValueAccessor.value() ? "on" : "off:"',
    '[attr.data-disabled]': 'controlValueAccessor.disabled() || null',
    '(click)': 'pressed.set(!pressed())',
  },
})
export class RadianToggle {
  /** Whether the toggle is pressed. Emits when toggled. */
  pressed = model(false);
  /** Whether the toggle is disabled. */
  disabled = input(false, { transform: booleanAttribute });

  protected controlValueAccessor = inject(RadianControlValueAccessor);
}
