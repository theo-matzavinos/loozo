import { Directive } from '@angular/core';
import { RadianPopperArrow } from '@loozo/radian/popper';

@Directive({
  selector: '[radianPopoverArrow]',

  hostDirectives: [RadianPopperArrow],
})
export class RadianPopoverArrow {}
