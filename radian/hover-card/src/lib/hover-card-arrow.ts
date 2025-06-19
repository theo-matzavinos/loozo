import { Directive } from '@angular/core';
import { RadianPopperArrow } from '@loozo/radian/popper';

@Directive({
  selector: '[radianHoverCardArrow]',
  hostDirectives: [RadianPopperArrow],
})
export class RadianHoverCardArrow {}
