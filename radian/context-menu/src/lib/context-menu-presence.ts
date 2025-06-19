import { Directive } from '@angular/core';
import { RadianMenuPresence } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextMenuPresence]',
  hostDirectives: [RadianMenuPresence],
})
export class RadianContextMenuPresence {}
