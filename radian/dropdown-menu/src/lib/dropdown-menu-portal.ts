import { Directive, ElementRef, input } from '@angular/core';
import { RadianMenuPortal } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuPortal]',
  hostDirectives: [{ directive: RadianMenuPortal, inputs: ['container'] }],
})
export class RadianDropdownMenuPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement>>();
}
