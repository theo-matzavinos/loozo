import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';

@Directive({
  selector: '[radianToastPresense]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianToastPresence).present,
    })),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianToastPresence {
  present = input.required({ transform: booleanAttribute });
}
