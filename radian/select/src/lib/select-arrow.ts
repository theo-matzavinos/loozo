import { Directive } from '@angular/core';
import { RadianPopperArrow } from '@loozo/radian/popper';

@Directive({
  selector: '[radianSelectArrow]',
  hostDirectives: [RadianPopperArrow],
})
export class RadianSelectArrow {}
