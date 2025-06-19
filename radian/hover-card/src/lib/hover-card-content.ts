import { Directive } from '@angular/core';
import { RadianPopperContent } from '@loozo/radian/popper';

@Directive({
  selector: '[radianHoverCardContent]',
  hostDirectives: [RadianPopperContent],
})
export class RadianHoverCardContent {}
