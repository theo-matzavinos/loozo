import { Directive, inject } from '@angular/core';
import { RadianAccordionItemContext } from './accordion-item';

@Directive({
  selector: '[radianAccordionHeader]',
  host: {
    'data-radian-accordion-header': '',
    '[attr.data-orientation]': 'context.orientation()',
    '[attr.data-state]': 'context.open() ? "open" : "closed"',
    '[attr.data-disabled]': 'context.disabled() ? "" : null',
  },
})
export class RadianAccordionHeader {
  protected context = inject(RadianAccordionItemContext);
}
