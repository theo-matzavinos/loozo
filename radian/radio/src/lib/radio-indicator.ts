import { Directive, inject } from '@angular/core';
import { RadianRadioContext } from './radio';

@Directive({
  selector: '[radianRadioIndicator]',
  host: {
    'data-radian-radio-indicator': '',
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled()',
    '[style]': `{ pointerEvents: 'none' }`,
    '[hidden]': '!context.checked()',
  },
})
export class RadianRadioIndicator {
  protected context = inject(RadianRadioContext);
}
