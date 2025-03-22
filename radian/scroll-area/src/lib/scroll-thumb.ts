import { afterNextRender, DestroyRef, Directive, inject } from '@angular/core';
import { RadianScrollAreaContext } from './scroll-area-context';
import {
  debounceTime,
  exhaustMap,
  fromEvent,
  animationFrames,
  takeUntil,
  map,
  pairwise,
  filter,
  startWith,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Directive({
  selector: '[radianScrollThumb]',
  host: {
    'data-radian-scroll-thumb': '',
    '[style]': `{
      width: 'var(--radian-scroll-area-thumb-width)',
      height: 'var(--radian-scroll-area-thumb-height)',
    }`,
  },
})
export class RadianScrollThumb {
  private scrollAreaContext = inject(RadianScrollAreaContext);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const viewport =
        this.scrollAreaContext.viewport().elementRef.nativeElement;

      /**
       * We only bind to native scroll event so we know when scroll starts and ends.
       * When scroll starts we start a requestAnimationFrame loop that checks for
       * changes to scroll position. That rAF loop triggers our thumb position change
       * when relevant to avoid scroll-linked effects. We cancel the loop when scroll ends.
       * https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Scroll-linked_effects
       */
      const scrollStart = fromEvent(viewport, 'scroll');
      const scrollEnd = scrollStart.pipe(debounceTime(100));

      scrollStart
        .pipe(
          exhaustMap(() =>
            animationFrames().pipe(
              map(() => ({
                left: viewport.scrollLeft,
                top: viewport.scrollTop,
              })),
              startWith({ left: NaN, top: NaN }),
              pairwise(),
              filter(([previous, current]) => {
                if (previous.left !== current.left) {
                  return true;
                }

                if (previous.top !== current.top) {
                  return true;
                }

                return false;
              }),
              takeUntil(scrollEnd),
            ),
          ),
          takeUntilDestroyed(destroyRef),
        )
        .subscribe(() => {
          // update position
          this.scrollbarContext.updateThumbPosition();
        });
    });
  }
}
