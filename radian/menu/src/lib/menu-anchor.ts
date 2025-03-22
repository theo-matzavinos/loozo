import { Directive } from '@angular/core';
import { RadianPopperAnchor } from '@loozo/radian/popper';

@Directive({
  selector: '[radianMenuAnchor]',
  hostDirectives: [RadianPopperAnchor],
})
export class RadianMenuAnchor {}
