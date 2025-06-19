import { Directive } from '@angular/core';
import { RadianMenuPresence } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuPresence]',
  hostDirectives: [RadianMenuPresence],
})
export class RadianDropdownMenuPresence {}
