import { Directive, inject } from '@angular/core';
import { RadianPopoverContext } from './popover';

@Directive({
  selector: 'button[radianPopoverClose]',
  standalone: true,
  host: {
    type: 'button',
    '(click)': 'context.setOpen(false)',
  },
})
export class RadianPopoverClose {
  protected context = inject(RadianPopoverContext);
}
