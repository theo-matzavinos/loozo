import {
  afterNextRender,
  computed,
  DestroyRef,
  Directive,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { RadianNavigationMenuContext } from './navigation-menu-context';

@Directive({
  selector: '[radianNavigationMenuIndicator]',
  host: {
    'aria-hidden': '',
    '[attr.data-state]': 'isVisible() ? "visible" : "hidden"',
    '[attr.data-orientation]': 'context.orientation()',
    '[style]': 'style()',
  },
})
export class RadianNavigationMenuIndicator {
  private context = inject(RadianNavigationMenuContext);

  isVisible = computed(() => !!this.context.value());

  private position = signal<{ size: number; offset: number } | undefined>(
    undefined,
  );

  private activeTrigger = computed(
    () =>
      this.context.triggers().find((i) => i.value() === this.context.value())
        ?.elementRef.nativeElement,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    const injector = inject(Injector);

    afterNextRender(() => {
      const resizeObserver = new ResizeObserver(() => {
        const isHorizontal = this.context.orientation() === 'horizontal';
        const activeTrigger = this.activeTrigger();

        if (!activeTrigger) {
          return;
        }

        this.position.set({
          size: isHorizontal
            ? activeTrigger.offsetWidth
            : activeTrigger.offsetHeight,
          offset: isHorizontal
            ? activeTrigger.offsetLeft
            : activeTrigger.offsetTop,
        });
      });

      effect(
        (onCleanup) => {
          const activeTrigger = this.activeTrigger();

          if (!activeTrigger) {
            return;
          }

          resizeObserver.observe(activeTrigger);

          onCleanup(() => resizeObserver.unobserve(activeTrigger));
        },
        { injector },
      );

      effect(
        (onCleanup) => {
          const track = this.context.track();

          if (!track) {
            return;
          }

          resizeObserver.observe(track.nativeElement);

          onCleanup(() => resizeObserver.unobserve(track.nativeElement));
        },
        { injector },
      );

      destroyRef.onDestroy(() => {
        resizeObserver.disconnect();
      });
    });
  }

  protected style = computed(() => {
    // We need to wait for the indicator position to be available before rendering to
    // snap immediately into position rather than transitioning from initial
    if (!this.position()) {
      return { display: 'none' };
    }

    if (this.context.orientation() === 'horizontal') {
      return {
        position: 'absolute',
        left: 0,
        width: `${this.position()?.size}px`,
        transform: `translateX(${this.position()?.offset}px)`,
      };
    }

    return {
      position: 'absolute',
      top: 0,
      height: `${this.position()?.size}px`,
      transform: `translateY(${this.position()?.offset}px)`,
    };
  });
}
