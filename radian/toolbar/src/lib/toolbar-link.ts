import { Directive } from '@angular/core';
import { RadianFocusable } from '@loozo/radian/roving-focus';

@Directive({
  selector: 'a[radianToolbarLink]',
  hostDirectives: [RadianFocusable],
  host: {
    '(keydown.space)': '$event.currentTarget.click()',
  },
})
export class RadianToolbarLink {}
