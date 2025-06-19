import { Directive, ElementRef, input } from '@angular/core';
import { RadianPortal } from '@loozo/radian/portal';

@Directive({
  selector: '[radianPopoverPortal]',

  hostDirectives: [
    {
      directive: RadianPortal,
      inputs: ['container'],
    },
  ],
})
export class RadianPopoverPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement>>();
}
