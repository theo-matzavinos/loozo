import { Directive } from '@angular/core';
import { RadianMenuLabel } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarLabel]',
  hostDirectives: [RadianMenuLabel],
})
export class RadianMenubarLabel {}
