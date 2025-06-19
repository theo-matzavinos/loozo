import { booleanAttribute, Directive, inject, input } from '@angular/core';
import { RadianDropdownMenuContext } from './dropdown-menu-context';
import { RadianMenuAnchor } from '@loozo/radian/menu';

@Directive({
  selector: '[radianDropdownMenuTrigger]',
  hostDirectives: [RadianMenuAnchor],
  host: {
    type: 'button',
    'aria-haspopup': 'menu',
    '[id]': 'context.triggerId()',
    '[attr.aria-expanded]': 'context.open()',
    '[attr.aria-controls]': 'context.open() ? context.contentId() : null',
    '[attr.data-state]': "context.open() ? 'open' : 'closed'",
    '[attr.data-disabled]': "disabled() ? '' : null",
    '[disabled]': 'disabled()',
    '(pointerdown)': 'pointerDown($event)',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianDropdownMenuTrigger {
  disabled = input(false, { transform: booleanAttribute });
  protected context = inject(RadianDropdownMenuContext);

  protected pointerDown(event: PointerEvent) {
    // only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
    // but not when the control key is pressed (avoiding MacOS right click)
    if (!this.disabled() && event.button === 0 && event.ctrlKey === false) {
      this.context.toggle();
      // prevent trigger focusing when opening
      // this allows the content to be given focus without competition
      if (!this.context.open()) {
        event.preventDefault();
      }
    }
  }

  protected keyDown(event: KeyboardEvent) {
    if (this.disabled()) {
      return;
    }

    if (['Enter', ' '].includes(event.key)) {
      this.context.toggle();
    }

    if (event.key === 'ArrowDown') {
      this.context.setOpen(true);
    }

    // prevent keydown from scrolling window / first focused item to execute
    // that keydown (inadvertently closing the menu)
    if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
    }
  }
}
