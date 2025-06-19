import {
  booleanAttribute,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  provideRadianFocusableContext,
  RadianFocusable,
} from '@loozo/radian/roving-focus';
import { RadianMenubarMenuContext } from './menubar-menu-context';
import { RadianMenubarContext } from './menubar-context';
import { uniqueId } from '@loozo/radian/common';
import { RadianMenuAnchor } from '@loozo/radian/menu';

@Directive({
  selector: '[radianMenubarTrigger]',
  providers: [
    provideRadianFocusableContext(() => {
      const menubarTrigger = inject(RadianMenubarTrigger);

      return {
        value: menubarTrigger.value,
      };
    }),
  ],
  hostDirectives: [
    { directive: RadianFocusable, inputs: ['disabled'] },
    RadianMenuAnchor,
  ],
  host: {
    type: 'button',
    role: 'menuitem',
    'aria-haspopup': 'menu',
    '[attr.id]': 'menuContext.triggerId()',
    '[attr.aria-expanded]': 'menuContext.open()',
    '[attr.aria-controls]':
      'menuContext.open() ? menuContext.contentId() : null',
    '[attr.data-highlighted]': "isFocused() ? '' : null",
    '[attr.data-state]': "menuContext.open() ? 'open' : 'closed'",
    '[attr.data-disabled]': "disabled() ? '' : null",
    '[attr.data-value]': 'value()',
    '[disabled]': 'disabled()',
    '(pointerdown)': 'pointerDown($event)',
    '(pointerenter)': 'hovered()',
    '(keydown)': 'keyDown($event)',
    '(focus)': 'isFocused.set(true)',
    '(blur)': 'isFocused.set(false)',
  },
})
export class RadianMenubarTrigger {
  /**
   * A unique value that identifies this item in the group.
   * Will be auto-generated if not provided.
   * */
  value = input<string>(uniqueId('radian-menubar-trigger'));
  /** Whether this item is disabled. */
  disabled = input(false, { transform: booleanAttribute });

  protected menuContext = inject(RadianMenubarMenuContext);
  protected isFocused = signal(false);
  private context = inject(RadianMenubarContext);
  private elementRef = inject(ElementRef);
  protected pointerDown(event: PointerEvent) {
    // only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
    // but not when the control key is pressed (avoiding MacOS right click)
    if (!this.disabled() && event.button === 0 && event.ctrlKey === false) {
      this.context.openMenu(this.menuContext.value());
      // prevent trigger focusing when opening
      // this allows the content to be given focus without competition
      if (!this.menuContext.open()) {
        event.preventDefault();
      }
    }
  }

  protected hovered() {
    const menubarOpen = Boolean(this.context.value());
    if (menubarOpen && !this.menuContext.open()) {
      this.context.openMenu(this.menuContext.value());
      this.elementRef.nativeElement.focus();
    }
  }

  protected keyDown(event: KeyboardEvent) {
    if (this.disabled()) {
      return;
    }
    if (['Enter', ' '].includes(event.key)) {
      this.context.toggleMenu(this.menuContext.value());
    }
    if (event.key === 'ArrowDown') {
      this.context.openMenu(this.menuContext.value());
    }
    // prevent keydown from scrolling window / first focused item to execute
    // that keydown (inadvertently closing the menu)
    if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      this.menuContext.wasKeyboardTriggerOpen.set(true);
      event.preventDefault();
    }
  }
}
