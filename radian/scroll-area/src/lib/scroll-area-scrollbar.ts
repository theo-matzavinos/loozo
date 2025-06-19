import {
  afterNextRender,
  computed,
  contentChild,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  getThumbRatio,
  getThumbSize,
  linearScale,
  RadianScrollAreaScrollbarContext,
  Sizes,
} from './scroll-area-scrollbar-context';
import { observeSize } from './observe-size';
import { Direction } from '../../../common/src';
import { RadianScrollAreaContext } from './scroll-area-context';
import { debounceTime, Subject } from 'rxjs';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { RadianScrollAreaThumb } from './scroll-area-thumb';

@Directive({
  selector: '[radianScrollAreaScrollbar]',
  providers: [
    {
      provide: RadianScrollAreaScrollbarContext,
      useFactory: RadianScrollAreaScrollbar.contextFactory,
    },
  ],
  host: {
    style: 'position: absolute',
    '(pointerdown)': 'pointerDown($event)',
    '(pointermove)': 'handleDragScroll(event)',
    '(pointerup)': 'pointerUp($event)',
  },
})
export class RadianScrollAreaScrollbar {
  wheelScrolled = output<{ event: WheelEvent; maxScrollPos: number }>();
  dragScrolled = output<{ x: number; y: number }>();
  private resized$ = new Subject<void>();
  resized = outputFromObservable(this.resized$.pipe(debounceTime(10)));
  thumbPositionChanged = output<void>();
  thumbPointerDown = output<{ x: number; y: number }>();

  private rect?: DOMRect;
  private pointerOffset = signal(0);

  private sizes = signal({
    content: 0,
    viewport: 0,
    scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 },
  });
  private thumbRatio = computed(() =>
    getThumbRatio(this.sizes().viewport, this.sizes().content),
  );
  private prevWebkitUserSelect?: string;
  private context = inject(RadianScrollAreaContext);

  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private thumb = contentChild.required(RadianScrollAreaThumb, {
    read: ElementRef,
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    const maxScrollPos = computed(
      () => this.sizes().content - this.sizes().viewport,
    );

    /**
     * We bind wheel event imperatively so we can switch off passive
     * mode for document wheel event to allow it to be prevented
     */
    afterNextRender(() => {
      const handleWheel = (event: WheelEvent) => {
        const element = event.target as HTMLElement;
        const isScrollbarWheel =
          this.elementRef.nativeElement.contains(element);
        if (isScrollbarWheel) {
          this.wheelScrolled.emit({ event, maxScrollPos: maxScrollPos() });
        }
      };
      document.addEventListener('wheel', handleWheel, { passive: false });

      destroyRef.onDestroy(() =>
        document.removeEventListener('wheel', handleWheel, {
          passive: false,
        } as any),
      );
    });

    afterNextRender(() => {
      const destroyScrollbarObserver = observeSize(
        this.elementRef.nativeElement,
        () => this.resized$.next(),
      );
      const destroyContentObserver = observeSize(
        this.context.content().nativeElement,
        () => this.resized$.next(),
      );

      destroyRef.onDestroy(() => {
        destroyScrollbarObserver();
        destroyContentObserver();
      });
    });

    /**
     * Update thumb position on sizes change
     */
    effect(() => {
      this.sizes();
      this.thumbPositionChanged.emit();
    });
  }

  protected pointerDown(event: PointerEvent) {
    const mainPointer = 0;

    if (event.button === mainPointer) {
      const element = event.target as HTMLElement;
      element.setPointerCapture(event.pointerId);
      this.rect = this.elementRef.nativeElement.getBoundingClientRect();
      // pointer capture doesn't prevent text selection in Safari
      // so we remove text selection manually when scrolling
      this.prevWebkitUserSelect = document.body.style.webkitUserSelect;
      document.body.style.webkitUserSelect = 'none';
      this.context.viewport().nativeElement.style.scrollBehavior = 'auto';
      this.handleDragScroll(event);
    }
  }

  protected pointerUp(event: PointerEvent) {
    const element = event.target as HTMLElement;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    document.body.style.webkitUserSelect = this.prevWebkitUserSelect!;
    this.context.viewport().nativeElement.style.scrollBehavior = '';
    this.rect = undefined;
  }

  private handleDragScroll(event: PointerEvent) {
    if (this.rect) {
      const x = event.clientX - this.rect.left;
      const y = event.clientY - this.rect.top;

      this.dragScrolled.emit({ x, y });
    }
  }

  private static contextFactory(): RadianScrollAreaScrollbarContext {
    const scrollbar = inject(RadianScrollAreaScrollbar);

    return {
      hasThumb: computed(
        () => scrollbar.thumbRatio() > 0 && scrollbar.thumbRatio() < 1,
      ),
      onThumbPointerDown(pointerPos) {
        scrollbar.thumbPointerDown.emit(pointerPos);
      },
      onThumbPointerUp() {
        scrollbar.pointerOffset.set(0);
      },
      onThumbPositionChange() {
        scrollbar.thumbPositionChanged.emit();
      },
      pointerOffset: scrollbar.pointerOffset,
      scrollbar: scrollbar.elementRef,
      sizes: scrollbar.sizes,
      thumb: scrollbar.thumb,
    };
  }
}

export function getScrollPosition(
  pointerPos: number,
  pointerOffset: number,
  sizes: Sizes,
  dir: Direction = 'ltr',
) {
  const thumbSizePx = getThumbSize(sizes);
  const thumbCenter = thumbSizePx / 2;
  const offset = pointerOffset || thumbCenter;
  const thumbOffsetFromEnd = thumbSizePx - offset;
  const minPointerPos = sizes.scrollbar.paddingStart + offset;
  const maxPointerPos =
    sizes.scrollbar.size - sizes.scrollbar.paddingEnd - thumbOffsetFromEnd;
  const maxScrollPos = sizes.content - sizes.viewport;
  const scrollRange =
    dir === 'ltr' ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
  const interpolate = linearScale(
    [minPointerPos, maxPointerPos],
    scrollRange as [number, number],
  );
  return interpolate(pointerPos);
}

export function isScrollingWithinScrollbarBounds(
  scrollPos: number,
  maxScrollPos: number,
) {
  return scrollPos > 0 && scrollPos < maxScrollPos;
}
