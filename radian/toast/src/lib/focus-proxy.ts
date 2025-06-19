import { Directive } from '@angular/core';
import { RadianVisuallyHidden } from '@loozo/radian/visually-hidden';

@Directive({
  selector: '[radianFocusProxy]',
  hostDirectives: [RadianVisuallyHidden],
  host: {
    'aria-hidden': '',
    tabindex: '0',
    // Avoid page scrolling when focus is on the focus proxy
    '[style.position]': 'fixed',
  },
})
export class RadianFocusProxy {}
