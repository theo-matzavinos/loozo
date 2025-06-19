import { Directive, inject } from '@angular/core';
import { RadianSwitchContext } from './switch-context';

@Directive({
  selector: '[radianSwitchThumb]',
  host: {
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled()',
  },
})
export class RadianSwitchThumb {
  protected context = inject(RadianSwitchContext);
}
