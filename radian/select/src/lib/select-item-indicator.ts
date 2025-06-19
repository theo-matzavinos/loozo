import { Directive } from '@angular/core';

@Directive({
  selector: '[radianSelectItemIndicator]',
  host: {
    'aria-hidden': '',
  },
})
export class RadianSelectItemIndicator {}
