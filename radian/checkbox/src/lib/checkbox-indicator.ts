import { Directive, inject } from '@angular/core';
import { RadianCheckboxContext } from './checkbox-context';

@Directive({
  selector: '[radianCheckboxIndicator]',
  host: {
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled()',
    '[hidden]': '!context.checked()',
    '[style]': `{ pointerEvents: 'none'}`,
  },
})
export class RadianCheckboxIndicator {
  protected context = inject(RadianCheckboxContext);
}
