import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianTooltipContext } from './tooltip';

@Directive({
  selector: '[radianTooltipPortalPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianTooltipContext);

      return { present: context.isOpen };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianTooltipPortalPresence {}
