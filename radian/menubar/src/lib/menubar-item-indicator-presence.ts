import { Directive } from '@angular/core';
import { RadianMenuItemIndicatorPresence } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarItemIndicatorPresence]',
  hostDirectives: [RadianMenuItemIndicatorPresence],
})
export class RadianMenubarItemIndicatorPresence {}
