import { Directive } from '@angular/core';
import { RadianPopperArrow } from '@loozo/radian/popper';

@Directive({
  selector: '[radianPopoverArrow]',
  standalone: true,
  hostDirectives: [RadianPopperArrow],
})
export class RadianPopoverArrow {}
