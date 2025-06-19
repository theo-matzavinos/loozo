import { Directive, inject } from '@angular/core';

import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianSelectContent } from './select-content';

@Directive({
  selector: '[radianSelectPopperContent]',
  hostDirectives: [RadianSelectContent],
  host: {
    role: 'menu',
    'aria-orientation': 'vertical',
    '[attr.data-state]': 'rootContext.open() ? "open" : "closed"',
    '[attr.dir]': 'rootContext.dir()',
    '[style]': `{
      boxSizing: 'border-box',
      '--radix-select-content-transform-origin':
        'var(--radix-popper-transform-origin)',
      '--radix-select-content-available-width':
        'var(--radix-popper-available-width)',
      '--radix-select-content-available-height':
        'var(--radix-popper-available-height)',
      '--radix-select-trigger-width': 'var(--radix-popper-anchor-width)',
      '--radix-select-trigger-height': 'var(--radix-popper-anchor-height)',
    }`,
  },
})
export class RadianSelectPopperContent {
  private content = inject(RadianSelectContent);
  openAutoFocus = outputFromObservable(
    outputToObservable(this.content.openAutoFocus),
  );
  /**
   * Event handler called when auto-focusing on close.
   * Can be prevented.
   */
  closeAutoFocus = outputFromObservable(
    outputToObservable(this.content.closeAutoFocus),
  );
}
