import { Directive, inject } from '@angular/core';
import { RadianCollapsibleContent } from '@loozo/radian/collapsible';
import { RadianAccordionItemContext } from './accordion-item';

@Directive({
  selector: '[radianAccordionContent]',
  hostDirectives: [RadianCollapsibleContent],
  host: {
    'data-radian-accordion-content': '',
    role: 'region',
    '[attr.data-orientation]': 'context.orientation()',
    '[attr.aria-labelledby]': 'context.triggerId()',
    '[style]': `{
        '--radian-accordion-content-height': 'var(--radian-collapsible-content-height)',
        '--radian-accordion-content-width': 'var(--radian-collapsible-content-width)',
      }`,
  },
})
export class RadianAccordionContent {
  protected context = inject(RadianAccordionItemContext);
}
