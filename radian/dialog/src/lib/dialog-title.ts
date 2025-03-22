import { Directive, inject } from '@angular/core';
import { RadianDialogContext } from './dialog';

@Directive({
  selector: '[radianDialogTitle]',
  host: {
    '[attr.id]': 'context.titleId',
  },
})
export class RadianDialogTitle {
  protected context = inject(RadianDialogContext);
}
