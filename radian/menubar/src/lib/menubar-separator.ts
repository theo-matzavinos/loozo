import { Directive } from '@angular/core';
import { RadianMenuSeparator } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarSeparator]',
  hostDirectives: [RadianMenuSeparator],
})
export class RadianMenubarSeparator {}
