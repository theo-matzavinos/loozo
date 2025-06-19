import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianSelectContentContext } from './select-content-context';

@Directive({
  selector: '[radianSelectScrollDownButtonPresence]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianSelectContentContext).canScrollDown,
    })),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianSelectScrollDownButtonPresence {}
