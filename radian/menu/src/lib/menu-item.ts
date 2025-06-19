import {
  booleanAttribute,
  Directive,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RadianMenuContentContext } from './menu-content-context';
import {
  provideRadianFocusableContext,
  RadianFocusable,
} from '@loozo/radian/roving-focus';
import { uniqueId } from '@loozo/radian/common';
import { RadianMenuContext } from './menu-context';

export const SELECTION_KEYS = ['Enter', ' '];

@Directive({
  selector: '[radianMenuItem]',
  providers: [
    provideRadianFocusableContext(() => {
      const menuItem = inject(RadianMenuItem);

      return {
        value: menuItem.value,
      };
    }),
  ],
  hostDirectives: [{ directive: RadianFocusable, inputs: ['disabled'] }],
  host: {
    role: 'menuitem',
    '[attr.data-highlighted]': 'isFocused() ? "" : null',
    '[attr.aria-disabled]': 'disabled() || null',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    /**
     * We focus items on `pointerMove` to achieve the following:
     *
     * - Mouse over an item (it focuses)
     * - Leave mouse where it is and use keyboard to focus a different item
     * - Wiggle mouse without it leaving previously focused item
     * - Previously focused item should re-focus
     *
     * If we used `mouseOver`/`mouseEnter` it would not re-focus when the mouse
     * wiggles. This is to match native menu implementation.
     */
    '(pointermove)': 'pointerMoved($event)',
    '(pointerleave)': 'unhovered($event)',
    '(focus)': 'isFocused.set(true)',
    '(blur)': 'isFocused.set(false)',
    '(click)': 'clicked($event)',
    '(pointerdown)': 'isPointerDown = true',
    '(pointerup)': 'pointerUp($event)',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianMenuItem {
  value = input(uniqueId('radian-menu-item'));
  disabled = input(false, { transform: booleanAttribute });

  // eslint-disable-next-line @angular-eslint/no-output-native
  select = output<Event>();

  protected contentContext = inject(RadianMenuContentContext);
  protected isFocused = signal(false);

  private rootContext = inject(RadianMenuContext);
  private isPointerDown = false;

  protected pointerMoved(event: PointerEvent) {
    if (event.pointerType !== 'button') {
      return;
    }

    if (this.disabled()) {
      this.contentContext.itemUnhovered(event);
    } else {
      this.contentContext.itemHovered(event);

      if (!event.defaultPrevented) {
        const item = event.currentTarget as HTMLElement;

        item.focus({ preventScroll: true });
      }
    }
  }
  protected clicked(event: MouseEvent) {
    if (this.disabled()) {
      return;
    }

    this.select.emit(event);

    if (event.defaultPrevented) {
      this.isPointerDown = false;
    } else {
      this.rootContext.close();
    }
  }

  protected pointerUp(event: PointerEvent) {
    if (!this.isPointerDown) {
      (event.currentTarget as HTMLElement)?.click();
    }
  }

  protected keyDown(event: KeyboardEvent) {
    const isTypingAhead = this.contentContext.search() !== '';

    if (this.disabled() || (isTypingAhead && event.key === ' ')) {
      return;
    }

    if (SELECTION_KEYS.includes(event.key)) {
      (event.currentTarget as HTMLElement).click();
      /**
       * We prevent default browser behaviour for selection keys as they should trigger
       * a selection only:
       * - prevents space from scrolling the page.
       * - if keydown causes focus to move, prevents keydown from firing on the new target.
       */
      event.preventDefault();
    }
  }

  protected unhovered(event: PointerEvent) {
    // We need to delay this so the event from sub-menu-triggers is emitted first.
    requestAnimationFrame(() => {
      this.contentContext.itemUnhovered(event);
    });
  }
}
