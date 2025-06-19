import { Directive } from '@angular/core';

@Directive({
  selector: '[radianAccessibleIcon]',
  host: {
    'aria-hidden': 'true',
    inert: 'true',
  },
})
export class RadianAccessibleIcon {}
