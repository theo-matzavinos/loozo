import { computed, Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianScrollAreaContext } from './scroll-area-context';

@Directive({
  selector: '[radianScrollAreaCornerPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianScrollAreaContext);

      return {
        present: computed(() => {
          if (context.type() === 'scroll') {
            return false;
          }

          if (!(context.horizontalScrollbar() && context.verticalScrollbar())) {
            return false;
          }

          return !!(context.cornerHeight() && context.cornerWidth());
        }),
      };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianScrollAreaCornerPresence {}
