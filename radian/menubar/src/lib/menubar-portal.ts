import { Directive } from '@angular/core';
import { RadianMenuPortal } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarPortal]',
  hostDirectives: [{ directive: RadianMenuPortal, inputs: ['container'] }],
})
export class RadianMenubarPortal {}
