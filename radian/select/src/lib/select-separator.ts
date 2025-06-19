import { Directive } from '@angular/core';

@Directive({
  selector: '[radianSelectSeparator]',
  host: {
    'aria-hidden': '',
  },
})
export class RadianSelectSeparator {}
