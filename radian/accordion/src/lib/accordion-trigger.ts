import { Directive, inject } from '@angular/core';
import { RadianCollapsibleTrigger } from '@loozo/radian/collapsible';
import { RadianAccordionItemContext } from './accordion-item';
import { RadianFocusable } from '@loozo/radian/roving-focus';

@Directive({
  selector: 'button[radianAccordionTrigger]',
  hostDirectives: [RadianCollapsibleTrigger, RadianFocusable],
  host: {
    '[attr.id]': 'context.triggerId()',
    '[attr.orientation]': 'context.orientation()',
    '[attr.aria-disabled]':
      'context.open() && context.disabled() ? "true" : null',
  },
})
export class RadianAccordionTrigger {
  protected context = inject(RadianAccordionItemContext);
}
