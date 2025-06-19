import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianControlValueAccessor } from '@loozo/radian/common';

@Directive({
  selector: '[radianToggle]',
  exportAs: 'radianToggle',
  hostDirectives: [
    {
      directive: RadianControlValueAccessor,
      inputs: ['value:pressed', 'disabled'],
    },
  ],
  host: {
    type: 'button',
    '[attr.aria-pressed]': 'controlValueAccessor.value()',
    '[attr.data-state]': 'controlValueAccessor.value() ? "on" : "off:"',
    '[attr.data-disabled]': 'controlValueAccessor.disabled() || null',
    '(click)': 'pressed.set(!pressed())',
  },
})
export class RadianToggle {
  /** Whether the toggle is pressed. */
  pressed = input(false);
  /** Whether the toggle is disabled. */
  disabled = input(false, { transform: booleanAttribute });

  protected controlValueAccessor = inject(RadianControlValueAccessor);

  /** Emits when the button is toggled. */
  pressedChange = outputFromObservable(
    outputToObservable(this.controlValueAccessor.valueChange),
  );
}
