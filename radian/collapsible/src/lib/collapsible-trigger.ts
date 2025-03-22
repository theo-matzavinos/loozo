import { Directive, inject } from '@angular/core';
import { RadianCollapsibleContext } from './collapsible';

@Directive({
  selector: 'button[radianCollapsibleTrigger]',
  host: {
    type: 'button',
    '[attr.disabled]': 'context.disabled() || null',
    '[attr.aria-controls]': 'context.content().id()',
    '[attr.aria-expanded]': 'context.open()',
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled() ? "" : null',
    '(click)': 'context.toggle()',
  },
})
export class RadianCollapsibleTrigger {
  protected context = inject(RadianCollapsibleContext);
}
