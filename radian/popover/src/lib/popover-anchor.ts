import { Directive } from '@angular/core';
import { RadianPopperElementAnchor } from '@loozo/radian/popper';

@Directive({
  selector: '[radianPopoverAnchor]',

  hostDirectives: [RadianPopperElementAnchor],
})
export class RadianPopoverAnchor {}
