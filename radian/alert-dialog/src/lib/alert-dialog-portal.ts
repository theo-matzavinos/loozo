import { Directive, ElementRef, input } from '@angular/core';
import { RadianDialogPortal } from '@loozo/radian/dialog';

@Directive({
  selector: '[radianAlertDialogPortal]',
  hostDirectives: [{ directive: RadianDialogPortal, inputs: ['container'] }],
})
export class RadianAlertDialogPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement> | HTMLElement>();
}
