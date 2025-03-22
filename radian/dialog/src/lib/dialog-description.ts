import { Directive, inject } from '@angular/core';
import { RadianDialogContext } from './dialog';

@Directive({
  selector: '[radianDialogDescription]',
  host: {
    '[attr.id]': 'context.descriptionId',
  },
})
export class RadianDialogDescription {
  protected context = inject(RadianDialogContext);
}
