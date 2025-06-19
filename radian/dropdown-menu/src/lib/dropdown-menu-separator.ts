import { Directive } from '@angular/core';
import { RadianMenuSeparator } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuSeparator]',
  hostDirectives: [RadianMenuSeparator],
})
export class RadianDropdownMenuSeparator {}
