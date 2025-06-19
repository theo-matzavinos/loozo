import { Directive } from '@angular/core';
import { RadianMenuGroup } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextMenuGroup]',
  hostDirectives: [RadianMenuGroup],
})
export class RadianContextMenuGroup {}
