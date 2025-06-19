import { Directive, ElementRef, input } from '@angular/core';
import { RadianPortal } from '@loozo/radian/portal';

@Directive({
  selector: '[radianSelectPortal]',
  hostDirectives: [{ directive: RadianPortal, inputs: ['container'] }],
})
export class RadianSelectPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement>>();
}
