import { computed, Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianRadioContext } from './radio';

@Directive({
  selector: 'ng-template[radianRadioIndicatorPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianRadioContext);

      return { present: computed(() => !!context.checked()) };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianRadioIndicatorPresence {}
