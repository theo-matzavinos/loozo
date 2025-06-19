import { Directive } from '@angular/core';

@Directive({
  selector: '[radianToastsList]',
  host: {
    /**
     * tabindex on the the list so that it can be focused when items are removed. we focus
     * the list instead of the viewport so it announces number of items remaining.
     */
    tabindex: '-1',
  },
})
export class RadianToastsList {}
