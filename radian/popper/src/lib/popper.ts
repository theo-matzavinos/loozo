import { computed, contentChild, Directive, inject } from '@angular/core';
import { RadianPopperContext } from './popper-context';
import { RadianPopperAnchor } from './popper-anchor';

@Directive({
  providers: [
    { provide: RadianPopperContext, useFactory: RadianPopper.contextFactory },
  ],
})
export class RadianPopper {
  private anchor = contentChild.required(RadianPopperAnchor);

  private static contextFactory(): RadianPopperContext {
    const popper = inject(RadianPopper);

    return {
      anchor: computed(() => popper.anchor()),
    };
  }
}
