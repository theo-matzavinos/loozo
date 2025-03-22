import { Directive, ElementRef, input } from '@angular/core';
import { RadianPortal } from '@loozo/radian/portal';

@Directive({
  selector: '[radianMenuPortal]',
  hostDirectives: [{ directive: RadianPortal, inputs: ['container'] }],
})
export class RadianMenuPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement>>();
}
