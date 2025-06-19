import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
} from '@angular/core';
import { RadianScrollAreaScrollbarContext } from './scroll-area-scrollbar-context';
import { debounceTime, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RadianScrollAreaContext } from './scroll-area-context';

@Directive({
  selector: '[radianScrollAreaThumb]',
  host: {
    '[attr.data-state]': "scrollbarContext.hasThumb() ? 'visible' : 'hidden'",
    '[style]': `{
      width: 'var(--radian-scroll-area-thumb-width)',
      height: 'var(--radian-scroll-area-thumb-height)',
    }`,
    '(pointerup)': 'scrollbarContext.onThumbPointerUp()',
  },
})
export class RadianScrollAreaThumb {
  protected scrollbarContext = inject(RadianScrollAreaScrollbarContext);

  constructor() {
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    const destroyRef = inject(DestroyRef);
    const scrollEnded = new Subject<void>();
    const context = inject(RadianScrollAreaContext);
    const viewport = context.viewport().nativeElement;
    let removeUnlinkedScrollListener: (() => void) | undefined;

    scrollEnded.pipe(debounceTime(100), takeUntilDestroyed()).subscribe(() => {
      if (removeUnlinkedScrollListener) {
        removeUnlinkedScrollListener();
        removeUnlinkedScrollListener = undefined;
      }
    });

    afterNextRender(() => {
      elementRef.nativeElement.addEventListener(
        'pointerdown',
        (event) => {
          const thumb = event.target as HTMLElement;
          const thumbRect = thumb.getBoundingClientRect();
          const x = event.clientX - thumbRect.left;
          const y = event.clientY - thumbRect.top;

          this.scrollbarContext.onThumbPointerDown({ x, y });
        },
        { capture: true },
      );

      /**
       * We only bind to native scroll event so we know when scroll starts and ends.
       * When scroll starts we start a requestAnimationFrame loop that checks for
       * changes to scroll position. That rAF loop triggers our thumb position change
       * when relevant to avoid scroll-linked effects. We cancel the loop when scroll ends.
       * https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Scroll-linked_effects
       */
      const handleScroll = () => {
        scrollEnded.next();
        if (!removeUnlinkedScrollListener) {
          const listener = addUnlinkedScrollListener(viewport, () =>
            this.scrollbarContext.onThumbPositionChange(),
          );
          removeUnlinkedScrollListener = listener;
          this.scrollbarContext.onThumbPositionChange();
        }
      };

      this.scrollbarContext.onThumbPositionChange();
      viewport.addEventListener('scroll', handleScroll);
      destroyRef.onDestroy(() =>
        viewport.removeEventListener('scroll', handleScroll),
      );
    });
  }
}

// Custom scroll handler to avoid scroll-linked effects
// https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Scroll-linked_effects
// eslint-disable-next-line @typescript-eslint/no-empty-function
const addUnlinkedScrollListener = (node: HTMLElement, handler = () => {}) => {
  let prevPosition = { left: node.scrollLeft, top: node.scrollTop };
  let rAF = 0;
  (function loop() {
    const position = { left: node.scrollLeft, top: node.scrollTop };
    const isHorizontalScroll = prevPosition.left !== position.left;
    const isVerticalScroll = prevPosition.top !== position.top;
    if (isHorizontalScroll || isVerticalScroll) handler();
    prevPosition = position;
    rAF = window.requestAnimationFrame(loop);
  })();
  return () => window.cancelAnimationFrame(rAF);
};
