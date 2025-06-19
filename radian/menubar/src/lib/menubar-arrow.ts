import { Directive } from '@angular/core';
import { RadianMenuArrow } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarArrow]',
  hostDirectives: [RadianMenuArrow],
})
export class RadianMenubarArrow {}
