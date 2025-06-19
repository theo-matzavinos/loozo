import { Directive } from '@angular/core';
import { RadianMenuLabel } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextMenuLabel]',
  hostDirectives: [RadianMenuLabel],
})
export class RadianContextMenuLabel {}
