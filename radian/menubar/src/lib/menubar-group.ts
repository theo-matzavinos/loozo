import { Directive } from '@angular/core';
import { RadianMenuGroup } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarGroup]',
  hostDirectives: [RadianMenuGroup],
})
export class RadianMenubarGroup {}
