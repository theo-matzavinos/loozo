import { computed, Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianMenuItemIndicatorContext } from './menu-item-indicator';

@Directive({
  selector: '[radianMenuItemIndicatorPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianMenuItemIndicatorContext);

      return {
        present: computed(() => !!context.checked()),
      };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianMenuItemIndicatorPresence {}
