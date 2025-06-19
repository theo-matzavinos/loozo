import { Directive, inject } from '@angular/core';
import { RadianAccordionItemContext } from './accordion-item-context';

@Directive({
  selector: '[radianAccordionHeader]',
  host: {
    '[attr.data-orientation]': 'context.orientation()',
    '[attr.data-state]': 'context.open() ? "open" : "closed"',
    '[attr.data-disabled]': 'context.disabled() ? "" : null',
  },
})
export class RadianAccordionHeader {
  protected context = inject(RadianAccordionItemContext);
}
