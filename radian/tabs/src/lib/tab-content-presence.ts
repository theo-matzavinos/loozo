import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianTabContext } from './tab-context';

@Directive({
  selector: '[radianTabContentPresence]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianTabContext).active,
    })),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianTabContentPresence {}
