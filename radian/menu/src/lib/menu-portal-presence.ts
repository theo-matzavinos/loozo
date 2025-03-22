import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianMenuContext } from './menu';

@Directive({
  selector: '[radianMenuPortalPresence]',
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
export class RadianMenuPortalPresence {}
