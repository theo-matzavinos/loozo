import {
  afterNextRender,
  Directive,
  inject,
  numberAttribute,
} from '@angular/core';
import {
  getScrollPosition,
  isScrollingWithinScrollbarBounds,
  RadianScrollAreaScrollbar,
} from './scroll-area-scrollbar';
import { RadianScrollAreaContext } from './scroll-area-context';
import {
  getThumbOffsetFromScroll,
  getThumbSize,
  RadianScrollAreaScrollbarContext,
} from './scroll-area-scrollbar-context';

@Directive({
  selector: '[radianScrollAreaVerticalScrollbar]',
  hostDirectives: [RadianScrollAreaScrollbar],
  host: {
    'data-orientation': 'vertical',
    '[style]': `{
        top: 0,
        right: context.dir() === 'ltr' ? 0 : undefined,
        top: context.dir() === 'rtl' ? 0 : undefined,
        bottom: 'var(--radian-scroll-area-corner-height)',
        '--radian-scroll-area-thumb-height': getThumbSize(sizes) + 'px',
    }`,
  },
})
export class RadianScrollAreaVerticalScrollbar {
  protected context = inject(RadianScrollAreaContext);
  protected scrollbarContext = inject(RadianScrollAreaScrollbarContext);
  protected getThumbSize = getThumbSize;

  constructor() {
    const scrollbar = inject(RadianScrollAreaScrollbar);
    let computedStyle: CSSStyleDeclaration;

    afterNextRender(() => {
      computedStyle = getComputedStyle(
        this.scrollbarContext.scrollbar.nativeElement,
      );
    });

    scrollbar.dragScrolled.subscribe(
      (pointerPos) =>
        (this.context.viewport().nativeElement.scrollTop = getScrollPosition(
          pointerPos.y,
          this.scrollbarContext.pointerOffset(),
          this.scrollbarContext.sizes(),
        )),
    );

    scrollbar.resized.subscribe(() =>
      this.scrollbarContext.sizes.set({
        content: this.context.content().nativeElement.scrollHeight,
        viewport: this.context.viewport().nativeElement.offsetHeight,
        scrollbar: {
          size: this.scrollbarContext.scrollbar.nativeElement.clientHeight,
          paddingStart: numberAttribute(computedStyle.paddingTop),
          paddingEnd: numberAttribute(computedStyle.paddingBottom),
        },
      }),
    );

    scrollbar.thumbPointerDown.subscribe((pointerPos) =>
      this.scrollbarContext.pointerOffset.set(pointerPos.y),
    );

    scrollbar.wheelScrolled.subscribe(({ event, maxScrollPos }) => {
      const scrollPos =
        this.context.viewport().nativeElement.scrollTop + event.deltaY;

      this.context.viewport().nativeElement.scrollTop = scrollPos;

      // prevent window scroll when wheeling on scrollbar
      if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
        event.preventDefault();
      }
    });

    scrollbar.thumbPositionChanged.subscribe(() => {
      const scrollPos = this.context.viewport().nativeElement.scrollTop;
      const offset = getThumbOffsetFromScroll(
        scrollPos,
        this.scrollbarContext.sizes(),
        this.context.dir(),
      );

      this.scrollbarContext.thumb().nativeElement.style.transform = `translate3d(0, ${offset}px, 0)`;
    });
  }
}
