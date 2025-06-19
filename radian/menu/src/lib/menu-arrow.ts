import { Directive } from '@angular/core';
import { RadianPopperArrow } from '@loozo/radian/popper';

@Directive({
  selector: '[radianMenuArrow]',
  hostDirectives: [RadianPopperArrow],
})
export class RadianMenuArrow {}
