import { computed, Directive } from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import {
  provideRadianFocusableContext,
  RadianFocusable,
} from '@loozo/radian/roving-focus';

@Directive({
  selector: '[radianToolbarButton]',
  providers: [
    provideRadianFocusableContext(() => ({
      value: computed(() => uniqueId('radian-toolbar-button')),
    })),
  ],
  hostDirectives: [{ directive: RadianFocusable, inputs: ['disabled'] }],
  host: {
    type: 'button',
  },
})
export class RadianToolbarButton {}
