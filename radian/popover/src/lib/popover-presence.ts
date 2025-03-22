import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianPopoverContext } from './popover';

@Directive({
  selector: '[radianPopoverPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianPopoverContext);

      return {
        present: context.open,
      };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianPopoverPresence {}
