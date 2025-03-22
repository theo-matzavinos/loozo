import { computed, Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianCheckboxContext } from './checkbox';

@Directive({
  selector: 'ng-template[radianCheckboxIndicatorPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const context = inject(RadianCheckboxContext);

      return { present: computed(() => !!context.checked()) };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianCheckboxIndicatorPresence {}
