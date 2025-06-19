import { computed, Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianToastsProviderContext } from './toasts-provider-context';

@Directive({
  selector: '[radianFocusProxyPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianToastsProviderContext);

      return {
        present: computed(() => !!context.toastsCount()),
      };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianFocusProxyPresence {}
