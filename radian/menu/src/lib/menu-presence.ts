import { Directive, effect, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianMenuContext } from './menu-context';

@Directive({
  selector: '[radianMenuPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianMenuContext);

      return {
        present: context.open,
      };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianMenuPresence {}
