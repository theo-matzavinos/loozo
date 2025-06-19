import { Directive } from '@angular/core';
import { RadianMenuPresence } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarPresence]',
  hostDirectives: [RadianMenuPresence],
})
export class RadianMenubarPresence {}
