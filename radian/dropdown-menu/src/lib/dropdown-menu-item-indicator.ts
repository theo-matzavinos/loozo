import { Directive } from '@angular/core';
import { RadianMenuItemIndicator } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuItemIndicator]',
  hostDirectives: [RadianMenuItemIndicator],
})
export class RadianDropdownMenuItemIndicator {}
