import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianScrollAreaScrollbarContext } from './scroll-area-scrollbar-context';

@Directive({
  selector: '[radianScrollAreaThumbPresence]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianScrollAreaScrollbarContext).hasThumb,
    })),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianScrollAreaThumbPresence {}
