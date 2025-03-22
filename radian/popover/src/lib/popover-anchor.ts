import { Directive } from '@angular/core';
import { RadianPopperAnchor } from '@loozo/radian/popper';

@Directive({
  selector: '[radianPopoverAnchor]',
  standalone: true,
  hostDirectives: [RadianPopperAnchor],
})
export class RadianPopoverAnchor {}
