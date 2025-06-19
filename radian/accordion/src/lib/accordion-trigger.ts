import { Directive, inject } from '@angular/core';
import { RadianCollapsibleTrigger } from '@loozo/radian/collapsible';
import {
  provideRadianFocusableContext,
  RadianFocusable,
} from '@loozo/radian/roving-focus';
import { RadianAccordionItemContext } from './accordion-item-context';

@Directive({
  selector: '[radianAccordionTrigger]',
  providers: [
    provideRadianFocusableContext(() => {
      const context = inject(RadianAccordionItemContext);

      return {
        value: context.triggerId,
      };
    }),
  ],
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
