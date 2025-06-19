import { Directive, ElementRef, input } from '@angular/core';
import { RadianPortal } from '@loozo/radian/portal';

@Directive({
  selector: '[radianHoverCardPortal]',
  hostDirectives: [{ directive: RadianPortal, inputs: ['container'] }],
})
export class RadianHoverCardPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement>>();
}
