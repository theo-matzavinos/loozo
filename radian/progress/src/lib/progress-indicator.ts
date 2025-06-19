import { Directive, inject } from '@angular/core';
import { RadianProgressContext } from './progress-context';

@Directive({
  selector: '[radianProgressIndicator]',
  host: {
    '[attr.data-state]': 'context.state()',
    '[attr.data-value]': 'context.value()',
    '[attr.data-max]': 'context.max()',
  },
})
export class RadianProgressIndicator {
  protected context = inject(RadianProgressContext);
}
