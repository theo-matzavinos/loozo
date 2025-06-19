import { Directive } from '@angular/core';

@Directive({
  selector: '[radianLabel]',
  host: {
    '(mousedown)': 'mouseDown($event)',
  },
})
export class RadianLabel {
  protected mouseDown(event: MouseEvent) {
    // only prevent text selection if clicking inside the label itself
    const target = event.target as HTMLElement;

    if (target.closest('button, input, select, textarea')) {
      return;
    }

    // prevent text selection when double clicking label
    if (!event.defaultPrevented && event.detail > 1) {
      event.preventDefault();
    }
  }
}
