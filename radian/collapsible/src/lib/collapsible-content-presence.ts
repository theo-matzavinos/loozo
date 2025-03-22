import { Directive, inject } from '@angular/core';
import { RadianCollapsibleContext } from './collapsible';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';

@Directive({
  selector: 'ng-template[radianCollapsibleContentPresence]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianCollapsibleContext).open,
    })),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianCollapsibleContentPresence {}
