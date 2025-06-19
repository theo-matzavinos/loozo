import { Directive, inject } from '@angular/core';
import { RadianRadioContext } from './radio-context';

@Directive({
  selector: '[radianRadioIndicator]',
  host: {
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled()',
    '[style]': `{ pointerEvents: 'none' }`,
    '[hidden]': '!context.checked()',
  },
})
export class RadianRadioIndicator {
  protected context = inject(RadianRadioContext);
}
