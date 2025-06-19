import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianHoverCardContext } from './hover-card-context';

@Directive({
  selector: '[radianHoverCardPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianHoverCardContext);

      return {
        present: context.isOpen,
      };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianHoverCardPresence {}
