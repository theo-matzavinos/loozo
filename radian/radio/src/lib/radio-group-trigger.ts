import { Directive, effect, inject } from '@angular/core';
import { RadianRadioTrigger } from './radio-trigger';
import { RadianFocusable } from '@loozo/radian/roving-focus';
import { RadianRadioGroupItem } from './radio-group-item';

@Directive({
  selector: 'button[radianRadioGroupTrigger]',
  hostDirectives: [RadianRadioTrigger, RadianFocusable],
  host: {
    'data-radian-radio-group-trigger': '',
    '[attr.data-radian-radio-trigger]': 'null',
  },
})
export class RadianRadioGroupTrigger {
  constructor() {
    const focusable = inject(RadianFocusable);
    const radioGroupItem = inject(RadianRadioGroupItem);

    effect(() => {
      if (radioGroupItem.computedDisabled()) {
        focusable.disable();
      } else {
        focusable.enable();
      }
    });
  }
}
