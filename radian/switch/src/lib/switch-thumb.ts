import { Directive, inject } from '@angular/core';
import { RadianSwitchContext } from './switch';

@Directive({
  selector: '[radianSwitchThumb]',
  host: {
    'data-radian-switch-thumb': '',
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled()',
  },
})
export class RadianSwitchThumb {
  protected context = inject(RadianSwitchContext);
}
