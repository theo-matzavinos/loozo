import { Directive, inject } from '@angular/core';
import { RadianCollapsibleContext } from './collapsible-context';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';

@Directive({
  selector: '[radianCollapsiblePresence]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianCollapsibleContext).open,
    })),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianCollapsiblePresence {}
