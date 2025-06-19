import { afterNextRender, DestroyRef, Directive, inject } from '@angular/core';
import { observeSize } from './observe-size';
import { RadianScrollAreaContext } from './scroll-area-context';

@Directive({
  selector: '[radianScrollAreaCorner]',
  host: {
    '[style]': `{
      width,
      height,
      position: 'absolute',
      right: context.dir() === 'ltr' ? 0 : undefined,
      left: context.dir() === 'rtl' ? 0 : undefined,
      bottom: 0,
    }`,
  },
})
export class RadianScrollAreaCorner {
  constructor() {
    const context = inject(RadianScrollAreaContext);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const destroyXObserver = observeSize(
        context.horizontalScrollbar()!.nativeElement,
        () => {
          const height =
            context.horizontalScrollbar()?.nativeElement.offsetHeight || 0;

          context.cornerHeight.set(height);
        },
      );

      const destroyYObserver = observeSize(
        context.verticalScrollbar()!.nativeElement,
        () => {
          const width =
            context.verticalScrollbar()?.nativeElement.offsetWidth || 0;

          context.cornerWidth.set(width);
        },
      );

      destroyRef.onDestroy(() => {
        destroyXObserver();
        destroyYObserver();
      });
    });
  }
}
