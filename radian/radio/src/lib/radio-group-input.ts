import { Directive, inject } from '@angular/core';
import { RadianRadioInput } from './radio-input';
import { RadianRadioGroup } from './radio-group';

@Directive({
  selector: 'input[radianRadioGroupInput]',
  hostDirectives: [RadianRadioInput],
  host: {
    'data-radian-radio-grou-input': '',
    '[attr.data-radian-radio-input]': 'null',
    '[attr.name]': 'radioGroup.name() || null',
  },
})
export class RadianRadioGroupInput {
  protected radioGroup = inject(RadianRadioGroup);
}
