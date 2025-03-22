import { Directive } from '@angular/core';
import { RadianRadioIndicator } from './radio-indicator';

@Directive({
  selector: '[radianRadioGroupIndicator]',
  hostDirectives: [RadianRadioIndicator],
  host: {
    'data-radian-radio-grou-indicator': '',
    '[attr.data-radian-radio-indicator]': 'null',
  },
})
export class RadianRadioGroupIndicator {}
