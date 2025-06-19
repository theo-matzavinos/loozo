import { Directive, inject } from '@angular/core';
import { RadianPopperContent } from '@loozo/radian/popper';
import { RadianTooltipContext } from './tooltip-context';

@Directive({
  selector: '[radianTooltipContent]',
  hostDirectives: [RadianPopperContent],
  host: {
    role: 'tooltip',
    '[attr.id]': 'context.contentId',
  },
})
export class RadianTooltipContent {
  protected context = inject(RadianTooltipContext);
}
