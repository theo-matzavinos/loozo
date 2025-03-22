import { Directive, inject } from '@angular/core';
import { RadianCheckboxContext } from './checkbox';

@Directive({
  selector: '[radianCheckboxIndicator]',
  host: {
    'data-radian-checkbox-indicator': '',
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled()',
    '[hidden]': '!context.checked()',
    '[style]': `{ pointerEvents: 'none'}`,
  },
})
export class RadianCheckboxIndicator {
  protected context = inject(RadianCheckboxContext);
}
