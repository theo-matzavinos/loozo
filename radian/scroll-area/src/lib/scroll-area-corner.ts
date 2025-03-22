import {
  afterNextRender,
  computed,
  DestroyRef,
  Directive,
  effect,
  inject,
  Injector,
  signal,
  Signal,
} from '@angular/core';
import { RadianScrollAreaContext } from './scroll-area-context';
import { RadianDirection } from '@loozo/radian/common';

@Directive({
  selector: '[radianScrollAreaCorner]',
  host: {
    'data-radian-scroll-area-corner': '',
    '[style]': `{
      width: width(),
      height: height(),
      position: 'absolute',
      right: direction.value() === 'ltr' ? 0 : '',
      left: direction.value() === 'rtl' ? 0 : '',
      bottom: 0,
      display: hidden() ? 'none' : 'block',
    }`,
  },
})
export class RadianScrollAreaCorner {
  protected direction = inject(RadianDirection);
  private scrollAreaContext = inject(RadianScrollAreaContext);

  protected hasBothScrollbarsVisible = computed(() => {
    const vertical = this.scrollAreaContext.verticalScrollbar();
    const horizontal = this.scrollAreaContext.horizontalScrollbar();

    if (!(vertical && horizontal)) {
      return false;
    }

    return vertical.state() === 'visible' && horizontal.state() === 'visible';
  });
  protected hidden = computed(
    () =>
      this.scrollAreaContext.type() === 'scroll' ||
      !this.hasBothScrollbarsVisible(),
  );

  protected height = signal(0);
  protected width = signal(0);

  constructor() {
    const injector = inject(Injector);

    afterNextRender(() => {
      resizeEffect({
        injector,
        scrollbar: this.scrollAreaContext.horizontalScrollbar,
        onResize: ([{ target }]) =>
          this.height.set((target as HTMLElement).offsetHeight),
      });

      resizeEffect({
        injector,
        scrollbar: this.scrollAreaContext.verticalScrollbar,
        onResize: ([{ target }]) =>
          this.width.set((target as HTMLElement).offsetWidth),
      });
    });
  }
}

function resizeEffect({
  injector,
  scrollbar,
  onResize,
}: {
  injector: Injector;
  scrollbar: Signal<unknown>;
  onResize: ResizeObserverCallback;
}) {
  return effect(
    (onCleanup) => {
      const instance = scrollbar();

      if (!instance) {
        return;
      }

      const resizeObserver = new ResizeObserver(onResize);

      resizeObserver.observe(instance.elementRef.nativeElement);

      onCleanup(() => resizeObserver.disconnect());
    },
    { injector },
  );
}
