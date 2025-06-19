import { Directive } from '@angular/core';
import { RadianMenuSeparator } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextMenuSeparator]',
  hostDirectives: [RadianMenuSeparator],
})
export class RadianContextMenuSeparator {}
