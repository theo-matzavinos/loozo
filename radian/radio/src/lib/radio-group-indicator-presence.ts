import { Directive } from '@angular/core';
import { RadianRadioIndicatorPresence } from './radio-indicator-presence';

@Directive({
  selector: '[radianRadioGroupIndicatorPresence]',
  hostDirectives: [RadianRadioIndicatorPresence],
})
export class RadianRadioGroupIndicatorPresence {}
