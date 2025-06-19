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
  selector: '[radianScrollAreaHorizontalScrollbar]',
  hostDirectives: [RadianScrollAreaScrollbar],
  host: {
    'data-orientation': 'horizontal',
    '[style]': `{
      bottom: 0,
      left: context.dir() === 'rtl' ? 'var(--radian-scroll-area-corner-width)' : 0,
      right:
        context.dir() === 'ltr' ? 'var(--radian-scroll-area-corner-width)' : 0,
      '--radian-scroll-area-thumb-width': getThumbSize(scrollbarContext.sizes()) + 'px',
    }`,
  },
})
export class RadianScrollAreaHorizontalScrollbar {
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
        (this.context.viewport().nativeElement.scrollLeft = getScrollPosition(
          pointerPos.x,
          this.scrollbarContext.pointerOffset(),
          this.scrollbarContext.sizes(),
          this.context.dir(),
        )),
    );

    scrollbar.resized.subscribe(() =>
      this.scrollbarContext.sizes.set({
        content: this.context.content().nativeElement.scrollWidth,
        viewport: this.context.viewport().nativeElement.offsetWidth,
        scrollbar: {
          size: this.scrollbarContext.scrollbar.nativeElement.clientWidth,
          paddingStart: numberAttribute(computedStyle.paddingLeft),
          paddingEnd: numberAttribute(computedStyle.paddingRight),
        },
      }),
    );

    scrollbar.thumbPointerDown.subscribe((pointerPos) =>
      this.scrollbarContext.pointerOffset.set(pointerPos.x),
    );

    scrollbar.wheelScrolled.subscribe(({ event, maxScrollPos }) => {
      const scrollPos =
        this.context.viewport().nativeElement.scrollLeft + event.deltaX;

      this.context.viewport().nativeElement.scrollLeft = scrollPos;

      // prevent window scroll when wheeling on scrollbar
      if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
        event.preventDefault();
      }
    });

    scrollbar.thumbPositionChanged.subscribe(() => {
      const scrollPos = this.context.viewport().nativeElement.scrollLeft;
      const offset = getThumbOffsetFromScroll(
        scrollPos,
        this.scrollbarContext.sizes(),
        this.context.dir(),
      );

      this.scrollbarContext.thumb().nativeElement.style.transform = `translate3d(${offset}px, 0, 0)`;
    });
  }
}
