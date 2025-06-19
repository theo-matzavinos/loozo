import { Directive, effect, inject } from '@angular/core';
import { RadianRadioTrigger } from './radio-trigger';
import {
  provideRadianFocusableContext,
  RadianFocusable,
} from '@loozo/radian/roving-focus';
import { RadianRadioGroupItemContext } from './radio-group-item-context';

@Directive({
  selector: '[radianRadioGroupTrigger]',
  providers: [
    provideRadianFocusableContext(() => {
      const radioGroupItemContext = inject(RadianRadioGroupItemContext);

      return {
        value: radioGroupItemContext.value,
      };
    }),
  ],
  hostDirectives: [RadianRadioTrigger, RadianFocusable],
})
export class RadianRadioGroupTrigger {
  constructor() {
    const focusable = inject(RadianFocusable);
    const radioGroupItemContext = inject(RadianRadioGroupItemContext);

    effect(() => {
      if (radioGroupItemContext.disabled()) {
        focusable.disable();
      } else {
        focusable.enable();
      }
    });
  }
}
