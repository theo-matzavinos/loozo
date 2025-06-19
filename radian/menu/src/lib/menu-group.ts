import { Directive } from '@angular/core';

@Directive({
  selector: '[radianMenuGroup]',

  host: {
    role: 'group',
  },
})
export class RadianMenuGroup {}
