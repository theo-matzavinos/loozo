import { Directive } from '@angular/core';
import { RadianFocusable } from '@loozo/radian/roving-focus';

@Directive({
  selector: 'button[radianToolbarButton]',
  hostDirectives: [{ directive: RadianFocusable, inputs: ['disabled'] }],
  host: {
    type: 'button',
  },
})
export class RadianToolbarButton {}
