import { Directive, inject } from '@angular/core';
import { RadianToastContext } from './toast-context';
import { RadianToastAnnounceExclude } from './toast-announce-exclude';

@Directive({
  selector: '[radianToastClose]',
  hostDirectives: [RadianToastAnnounceExclude],
  host: {
    type: 'button',
    '(click)': 'toastContext.close()',
  },
})
export class RadianToastClose {
  protected toastContext = inject(RadianToastContext);
}
