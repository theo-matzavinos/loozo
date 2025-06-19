import { Directive } from '@angular/core';
import { RadianMenuArrow } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuArrow]',
  hostDirectives: [RadianMenuArrow],
})
export class RadianDropdownMenuArrow {}
