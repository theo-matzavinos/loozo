import { Directive, inject } from '@angular/core';
import { RadianRadioInput } from './radio-input';
import { RadianRadioGroup } from './radio-group';

@Directive({
  selector: '[radianRadioGroupInput]',
  hostDirectives: [RadianRadioInput],
  host: {
    '[attr.name]': 'radioGroup.name() || null',
  },
})
export class RadianRadioGroupInput {
  protected radioGroup = inject(RadianRadioGroup);
}
