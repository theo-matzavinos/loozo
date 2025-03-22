import { Directive } from '@angular/core';
import { RadianRadioIndicatorPresence } from './radio-indicator-presence';

@Directive({
  selector: 'ng-template[radianRadioGroupIndicatorPresence]',
  hostDirectives: [RadianRadioIndicatorPresence],
})
export class RadianRadioGroupIndicatorPresence {}
