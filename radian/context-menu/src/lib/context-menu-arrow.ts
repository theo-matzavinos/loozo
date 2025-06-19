import { Directive } from '@angular/core';
import { RadianMenuArrow } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextMenuArrow]',
  hostDirectives: [RadianMenuArrow],
})
export class RadianContextMenuArrow {}
