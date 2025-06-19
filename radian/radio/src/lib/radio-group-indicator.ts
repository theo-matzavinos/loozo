import { Directive } from '@angular/core';
import { RadianRadioIndicator } from './radio-indicator';

@Directive({
  selector: '[radianRadioGroupIndicator]',
  hostDirectives: [RadianRadioIndicator],
})
export class RadianRadioGroupIndicator {}
