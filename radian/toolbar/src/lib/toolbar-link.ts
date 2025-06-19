import { computed, Directive } from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import {
  provideRadianFocusableContext,
  RadianFocusable,
} from '@loozo/radian/roving-focus';

@Directive({
  selector: '[radianToolbarLink]',
  providers: [
    provideRadianFocusableContext(() => ({
      value: computed(() => uniqueId('radian-toolbar-link')),
    })),
  ],
  hostDirectives: [RadianFocusable],
  host: {
    '(keydown.space)': '$event.currentTarget.click()',
  },
})
export class RadianToolbarLink {}
