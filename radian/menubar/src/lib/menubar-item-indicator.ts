import { Directive } from '@angular/core';
import { RadianMenuItemIndicator } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarItemIndicator]',
  hostDirectives: [RadianMenuItemIndicator],
})
export class RadianMenubarItemIndicator {}
