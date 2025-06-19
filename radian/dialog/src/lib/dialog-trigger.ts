import { Directive, inject } from '@angular/core';
import { RadianDialogContext } from './dialog-context';

@Directive({
  selector: '[radianDialogTrigger]',
  host: {
    type: 'button',
    'aria-haspopup': 'dialog',
    '[attr.aria-expanded]': 'context.open()',
    '[attr.aria-controls]': 'context.contentId()',
    '[attr.data-state]': 'context.state()',
    '(click)': 'context.toggle()',
  },
})
export class RadianDialogTrigger {
  protected context = inject(RadianDialogContext);
}
