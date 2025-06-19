import { Directive, inject } from '@angular/core';
import { RadianDialogContext } from './dialog-context';

@Directive({
  selector: '[radianDialogClose]',
  host: {
    type: 'button',
    '(click)': 'context.setOpen(false)',
  },
})
export class RadianDialogClose {
  protected context = inject(RadianDialogContext);
}
