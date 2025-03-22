import { Directive, ElementRef, input } from '@angular/core';
import { RadianPortal } from '@loozo/radian/portal';

@Directive({
  selector: '[radianTooltipPortal]',
  hostDirectives: [{ directive: RadianPortal, inputs: ['container'] }],
})
export class RadianTooltipPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement> | HTMLElement>();
}
