import { Directive } from '@angular/core';
import { RadianMenuLabel } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuLabel]',
  hostDirectives: [RadianMenuLabel],
})
export class RadianDropdownMenuLabel {}
