import { Directive, inject } from '@angular/core';
import { RadianProgress } from './progress';

@Directive({
  selector: '[radianProgressIndicator]',
  host: {
    'data-radian-progress-indicator': '',
    '[attr.data-state]': 'progress.state()',
    '[attr.data-value]': 'progress.value()',
    '[attr.data-max]': 'progress.max()',
  },
})
export class RadianProgressIndicator {
  protected progress = inject(RadianProgress);
}
