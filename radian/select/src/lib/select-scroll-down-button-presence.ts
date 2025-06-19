import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianSelectContentContext } from './select-content-context';

@Directive({
  selector: '[radianSelectScrollUpButtonPresence]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianSelectContentContext).canScrollUp,
    })),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianSelectScrollUpButtonPresence {}
