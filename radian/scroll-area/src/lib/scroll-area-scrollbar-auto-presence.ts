import {
  afterNextRender,
  DestroyRef,
  Directive,
  inject,
  input,
  signal,
} from '@angular/core';
import { RadianScrollAreaContext } from './scroll-area-context';
import { debounceTime, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { observeSize } from './observe-size';

@Directive({
  selector: '[radianScrollAreaScrollbarAutoPresence]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianScrollAreaScrollbarAutoPresence).visible,
    })),
  ],
  hostDirectives: [RadianPresence],
  host: {
    '[attr.data-state]': 'visible() ? "visible" : "hidden"',
  },
})
export class RadianScrollAreaScrollbarAutoPresence {
  orientation = input.required<'horizontal' | 'vertical'>();
  protected visible = signal(false);

  constructor() {
    const context = inject(RadianScrollAreaContext);
    const viewport = context.viewport().nativeElement;
    const destroyRef = inject(DestroyRef);
    const resized = new Subject<void>();

    resized.pipe(debounceTime(10), takeUntilDestroyed()).subscribe(() => {
      const isOverflowX = viewport.offsetWidth < viewport.scrollWidth;
      const isOverflowY = viewport.offsetHeight < viewport.scrollHeight;
      const isHorizontal = this.orientation() === 'horizontal';

      this.visible.set(isHorizontal ? isOverflowX : isOverflowY);
    });

    afterNextRender(() => {
      const destroyViewportObserver = observeSize(
        context.viewport().nativeElement,
        () => resized.next(),
      );
      const destroyContentObserver = observeSize(
        context.content().nativeElement,
        () => resized.next(),
      );

      destroyRef.onDestroy(() => {
        destroyViewportObserver();
        destroyContentObserver();
      });
    });
  }
}
