import { Directive, inject } from '@angular/core';
import { RadianPopperArrow } from '@loozo/radian/popper';
import { RadianVisuallyHidden } from '@loozo/radian/visually-hidden';

@Directive({
  selector: '[radianTooltipArrow]',
  hostDirectives: [RadianPopperArrow],
  host: {
    '[hidden]': 'isVisuallyHidden',
  },
})
export class RadianTooltipArrow {
  protected isVisuallyHidden = !!inject(RadianVisuallyHidden, {
    optional: true,
  });
}
