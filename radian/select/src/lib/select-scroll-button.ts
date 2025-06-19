import {
  afterEveryRender,
  DestroyRef,
  Directive,
  inject,
  output,
} from '@angular/core';
import { RadianSelectContentContext } from './select-content-context';
import { RadianSelectContext } from './select-context';

@Directive({
  selector: '[radianSelectScrollButton]',
  host: {
    'aria-hidden': '',
    style: 'flex-shrink: 0',
    '(pointerdown)': 'pointerDown()',
    '(pointermove)': 'pointerMoved()',
    '(pointerleave)': 'clearTimer()',
  },
})
export class RadianSelectScrollButton {
  autoScroll = output<void>();
  protected autoScrollTimer?: number;
  private contentContext = inject(RadianSelectContentContext);

  constructor() {
    const context = inject(RadianSelectContext);

    afterEveryRender(() => {
      // When the viewport becomes scrollable on either side, the relevant scroll button will mount.
      // Because it is part of the normal flow, it will push down (top button) or shrink (bottom button)
      // the viewport, potentially causing the active item to now be partially out of view.
      // We re-run the `scrollIntoView` logic to make sure it stays within the viewport.
      const activeItem = context
        .options()
        .find(
          (item) => item.elementRef.nativeElement === document.activeElement,
        );
      activeItem?.elementRef.nativeElement?.scrollIntoView({
        block: 'nearest',
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.clearTimer();
    });
  }

  protected clearTimer() {
    if (this.autoScrollTimer !== undefined) {
      window.clearInterval(this.autoScrollTimer);
      this.autoScrollTimer = undefined;
    }
  }

  protected pointerDown() {
    if (this.autoScrollTimer === null) {
      this.autoScrollTimer = window.setInterval(
        () => this.autoScroll.emit(),
        50,
      );
    }
  }

  protected pointerMoved() {
    this.contentContext.itemUnhovered();

    if (this.autoScrollTimer === null) {
      this.autoScrollTimer = window.setInterval(
        () => this.autoScroll.emit(),
        50,
      );
    }
  }
}
