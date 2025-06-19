import { Directive } from '@angular/core';

@Directive({
  selector: '[radianMenuSeparator]',
  host: {
    role: 'separator',
    'aria-orientation': 'horizontal',
  },
})
export class RadianMenuSeparator {}
