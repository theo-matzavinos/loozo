import { Directive, inject } from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianSelectItemContext } from './select-item-context';

@Directive({
  selector: '[radianSelectItemIndicatorPresence]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianSelectItemContext).isSelected,
    })),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianSelectItemIndicatorPresense {}
