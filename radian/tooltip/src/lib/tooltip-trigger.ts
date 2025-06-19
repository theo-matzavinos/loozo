import { Directive, ElementRef, inject, signal } from '@angular/core';
import { RadianPopperElementAnchor } from '@loozo/radian/popper';
import { RadianTooltipContext } from './tooltip-context';

@Directive({
  selector: '[radianTooltipTrigger]',
  hostDirectives: [RadianPopperElementAnchor],
  host: {
    '[attr.aria-describedby]': 'context.open() ? context.contentId : null',
    '[attr.data-state]': 'context.state()',
    '(pointermove)': 'pointerMoved($event)',
    '(pointerleave)': 'unhovered()',
    '(pointerdown)': 'pointerDown()',
    '(focus)': '!isPointerDown() && context.open()',
    '(blur)': 'context.close()',
    '(click)': 'context.close()',
  },
})
export class RadianTooltipTrigger {
  protected context = inject(RadianTooltipContext);
  protected isPointerDown = signal(false);
  private hasPointerMoveOpened = signal(false);

  /** @internal */
  elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected pointerMoved(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    if (!this.hasPointerMoveOpened() && !this.context.isPointerInTransit()) {
      this.context.triggerHovered();
      this.hasPointerMoveOpened.set(true);
    }
  }

  protected unhovered() {
    this.context.triggerUnhovered();
    this.hasPointerMoveOpened.set(false);
  }

  protected pointerDown() {
    if (this.context.isOpen()) {
      this.context.close();
    }

    this.isPointerDown.set(true);
    document.addEventListener(
      'pointerup',
      () => this.isPointerDown.set(false),
      { once: true },
    );
  }
}
