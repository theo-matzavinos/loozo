import { Directive, inject } from '@angular/core';
import { RadianPopperElementAnchor } from '@loozo/radian/popper';
import { RadianHoverCardContext } from './hover-card-context';

@Directive({
  selector: '[radianHoverCardTrigger]',
  hostDirectives: [RadianPopperElementAnchor],
  host: {
    '[attr.data-state]': 'context.isOpen() ? "open" : "closed"',
    '(focus)': 'context.open()',
    '(blur)': 'context.close()',
    '(pointerenter)': '$event.pointerType !== "touch" && context.open()',
    '(pointerleave)': '$event.pointerType !== "touch" && context.close()',
    // prevent focus event on touch devices
    '(touchstart)': '$event.preventDefault()',
  },
})
export class RadianHoverCardTrigger {
  protected context = inject(RadianHoverCardContext);
}
