import { Directive, inject } from '@angular/core';
import { RadianPopoverContext } from './popover-context';

@Directive({
  selector: '[radianPopoverClose]',

  host: {
    type: 'button',
    '(click)': 'context.setOpen(false)',
  },
})
export class RadianPopoverClose {
  protected context = inject(RadianPopoverContext);
}
