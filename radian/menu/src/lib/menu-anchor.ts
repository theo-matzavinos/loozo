import { Directive } from '@angular/core';
import { RadianPopperElementAnchor } from '@loozo/radian/popper';

@Directive({
  selector: '[radianMenuAnchor]',
  hostDirectives: [RadianPopperElementAnchor],
})
export class RadianMenuAnchor {}
