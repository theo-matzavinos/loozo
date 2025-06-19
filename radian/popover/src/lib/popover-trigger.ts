import { Directive, ElementRef, inject } from '@angular/core';
import { RadianPopoverContext } from './popover-context';

@Directive({
  selector: '[radianPopoverTrigger]',

  host: {
    type: 'button',
    'aria-haspopup': 'dialog',
    '[attr.aria-expanded]': 'context.open()',
    '[attr.aria-controls]': 'context.contentId()',
    '[attr.data-state]': 'context.open() ? "open" : "closed"',
    '(click)': 'context.toggle()',
  },
})
export class RadianPopoverTrigger {
  protected context = inject(RadianPopoverContext);
  private elementRef = inject<ElementRef<HTMLButtonElement>>(ElementRef);

  focus() {
    this.elementRef.nativeElement.focus();
  }

  contains(node: Node) {
    return this.elementRef.nativeElement.contains(node);
  }
}
