import { Directive } from '@angular/core';
import { RadianMenuItemIndicator } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextMenuItemIndicator]',
  hostDirectives: [RadianMenuItemIndicator],
})
export class RadianContextMenuItemIndicator {}
