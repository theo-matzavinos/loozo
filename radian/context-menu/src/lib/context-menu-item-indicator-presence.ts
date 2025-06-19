import { Directive } from '@angular/core';
import { RadianMenuItemIndicatorPresence } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextMenuItemIndicatorPresence]',
  hostDirectives: [RadianMenuItemIndicatorPresence],
})
export class RadianContextMenuItemIndicatorPresence {}
