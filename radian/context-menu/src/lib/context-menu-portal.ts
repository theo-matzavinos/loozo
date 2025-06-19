import { Directive, ElementRef, input } from '@angular/core';
import { RadianMenuPortal } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextMenuPortal]',
  hostDirectives: [{ directive: RadianMenuPortal, inputs: ['container'] }],
})
export class RadianContextMenuPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement>>();
}
