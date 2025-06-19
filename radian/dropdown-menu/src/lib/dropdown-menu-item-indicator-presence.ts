import { Directive } from '@angular/core';
import { RadianMenuItemIndicatorPresence } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuItemIndicatorPresence]',
  hostDirectives: [RadianMenuItemIndicatorPresence],
})
export class RadianDropdownMenuItemIndicatorPresence {}
