import { Directive, inject } from '@angular/core';
import { RadianTabContext } from './tab';

@Directive({
  selector: '[radianTabContent]',
  exportAs: 'radianTabContent',
  host: {
    role: 'tabpanel',
    tabIndex: '0',
    '[attr.id]': 'context.contentId()',
    '[attr.data-state]': 'context.state()',
    '[attr.data-orientation]': 'context.orientation()',
    '[attr.aria-labelledby]': 'context.triggerId()',
    '[hidden]': '!context.active()',
  },
})
export class RadianTabContent {
  protected context = inject(RadianTabContext);
}
