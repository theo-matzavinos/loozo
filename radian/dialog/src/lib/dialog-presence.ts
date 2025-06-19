import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianDialogContext } from './dialog-context';

@Directive({
  selector: '[radianDialogPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianDialogContext);

      return { present: context.open };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianDialogPresence {}
