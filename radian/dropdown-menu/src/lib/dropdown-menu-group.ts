import { Directive } from '@angular/core';
import { RadianMenuGroup } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuGroup]',
  hostDirectives: [RadianMenuGroup],
})
export class RadianDropdownMenuGroup {}
