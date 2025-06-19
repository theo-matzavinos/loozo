import { booleanAttribute, Directive, inject, input } from '@angular/core';
import { RadianMenuAnchor } from './menu-anchor';
import { RadianMenuItem, SELECTION_KEYS } from './menu-item';
import { RadianSubMenuContext } from './sub-menu-context';
import { RadianMenuContext, RadianRootMenuContext } from './menu-context';
import { Direction, uniqueId } from '@loozo/radian/common';
import {
  RadianMenuContentContext,
  RadianMenuContentSide,
} from './menu-content-context';

const SUB_OPEN_KEYS: Record<Direction, string[]> = {
  ltr: [...SELECTION_KEYS, 'ArrowRight'],
  rtl: [...SELECTION_KEYS, 'ArrowLeft'],
};

@Directive({
  selector: '[radianSubMenuTrigger]',
  hostDirectives: [
    RadianMenuAnchor,
    { directive: RadianMenuItem, inputs: ['value', 'disabled'] },
  ],
  host: {
    'aria-haspopup': 'menu',
    '[attr.id]': 'subMenuContext.triggerId',
    '[attr.aria-expanded]': 'context.open()',
    '[attr.aria-controls]': 'subMenuContext.contentId',
    '[attr.data-state]': 'context.open() ? "open" : "closed"',
    '(click)': 'clicked($event)',
    '(pointermove)': 'pointerMoved($event)',
    '(pointerleave)': 'unhovered($event)',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianSubMenuTrigger {
  value = input(uniqueId('radian-sub-menu-trigger'));
  disabled = input(false, { transform: booleanAttribute });

  protected subMenuContext = inject(RadianSubMenuContext);
  protected context = inject(RadianMenuContext);
  private contentContext = inject(RadianMenuContentContext);
  private rootContext = inject(RadianRootMenuContext);
  private openTimer = 0;
  private pointerGraceTimer = 0;

  // This is redundant for mouse users but we cannot determine pointer type from
  // click event and we cannot use pointerup event (see git history for reasons why)
  protected clicked(event: MouseEvent) {
    if (this.disabled() || event.defaultPrevented) {
      return;
    }
    /**
     * We manually focus because iOS Safari doesn't always focus on click (e.g. buttons)
     * and we rely heavily on `onFocusOutside` for submenus to close when switching
     * between separate submenus.
     */
    (event.currentTarget as HTMLElement).focus();
    if (!this.context.open()) {
      this.context.setOpen(true);
    }
  }

  protected pointerMoved(event: PointerEvent) {
    if (event.pointerType !== 'mouse') {
      return;
    }
    this.contentContext.itemHovered(event);
    if (event.defaultPrevented) {
      return;
    }
    if (!this.disabled() && !this.context.open() && !this.openTimer) {
      this.contentContext.onPointerGraceIntentChange(null);
      this.openTimer = window.setTimeout(() => {
        this.context.setOpen(true);
        this.clearOpenTimer();
      }, 100);
    }
  }

  protected unhovered(event: PointerEvent) {
    this.clearOpenTimer();

    const contentRect = this.context.content()?.getBoundingClientRect();

    if (contentRect) {
      const side = this.context.content()?.dataset[
        'side'
      ] as RadianMenuContentSide;
      const rightSide = side === 'right';
      const bleed = rightSide ? -5 : +5;
      const contentNearEdge = contentRect[rightSide ? 'left' : 'right'];
      const contentFarEdge = contentRect[rightSide ? 'right' : 'left'];

      this.contentContext.onPointerGraceIntentChange({
        area: [
          // Apply a bleed on clientX to ensure that our exit point is
          // consistently within polygon bounds
          { x: event.clientX + bleed, y: event.clientY },
          { x: contentNearEdge, y: contentRect.top },
          { x: contentFarEdge, y: contentRect.top },
          { x: contentFarEdge, y: contentRect.bottom },
          { x: contentNearEdge, y: contentRect.bottom },
        ],
        side,
      });

      window.clearTimeout(this.pointerGraceTimer);
      this.pointerGraceTimer = window.setTimeout(
        () => this.contentContext.onPointerGraceIntentChange(null),
        300,
      );
    } else {
      this.contentContext.onTriggerLeave(event);

      if (event.defaultPrevented) {
        return;
      }

      // There's 100ms where the user may leave an item before the submenu was opened.
      this.contentContext.onPointerGraceIntentChange(null);
    }
  }

  protected keyDown(event: KeyboardEvent) {
    const isTypingAhead = this.contentContext.search() !== '';

    if (this.disabled() || (isTypingAhead && event.key === ' ')) {
      return;
    }
    if (SUB_OPEN_KEYS[this.rootContext.dir()].includes(event.key)) {
      this.context.setOpen(true);
      // The trigger may hold focus if opened via pointer interaction
      // so we ensure content is given focus again when switching to keyboard.
      // prevent window from scrolling
      event.preventDefault();
    }
  }

  private clearOpenTimer() {
    window.clearTimeout(this.openTimer);
    this.openTimer = 0;
  }
}
