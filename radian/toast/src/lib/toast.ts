import {
  afterNextRender,
  booleanAttribute,
  ComponentRef,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  inputBinding,
  numberAttribute,
  output,
  ViewContainerRef,
} from '@angular/core';
import { RadianDismissibleLayer } from '@loozo/radian/dismissible-layer';
import {
  RadianToasterSwipeDirection,
  RadianToastsProviderContext,
} from './toasts-provider-context';
import { RadianToastAnnounce } from './toast-announce';
import { RadianPortal } from '@loozo/radian/portal';
import { RadianToastContext } from './toast-context';

type SwipeEvent = CustomEvent<{ delta: { x: number; y: number } }>;

@Directive({
  selector: '[radianToast]',
  providers: [
    { provide: RadianToastContext, useFactory: RadianToast.contextFactory },
  ],
  hostDirectives: [RadianDismissibleLayer, RadianPortal],
  host: {
    // Ensure toasts are announced as status list or status when focused
    role: 'status',
    'aria-live': 'off',
    'aria-atomic': '',
    tabindex: '0',
    '[attr.data-state]': 'open() ? "open" : "closed"',
    '[attr.data-swipe-direction]': 'context.swipeDirection()',
    '[style]': `{ userSelect: 'none', touchAction: 'none' }`,
    '(keydown)': 'keyDown($event)',
    '(pointerdown)': 'pointerDown($event)',
    '(pointermove)': 'pointerMoved($event)',
    '(pointerup)': 'pointerUp($event)',
  },
})
export class RadianToast {
  /**
   * Control the sensitivity of the toast for accessibility purposes.
   * For toasts that are the result of a user action, choose foreground.
   * Toasts generated from background tasks should use background.
   * @defaultValue 'foreground'
   */
  type = input<'foreground' | 'background'>('foreground');
  /**
   * Time in milliseconds that toast should remain visible for. Overrides value
   * given to `RadianToastsProvider`.
   */
  duration = input(NaN, { transform: numberAttribute });
  open = input(false, { transform: booleanAttribute });

  escapeKeyDown = output<KeyboardEvent>();
  paused = output<void>();
  resumed = output<void>();
  swipeStarted = output<SwipeEvent>();
  swipeMoved = output<SwipeEvent>();
  swipeEnded = output<SwipeEvent>();
  swipeCanceled = output<SwipeEvent>();
  openChange = output<boolean>();

  private context = inject(RadianToastsProviderContext);
  private pointerStart?: { x: number; y: number };
  private swipeDelta?: { x: number; y: number };
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private closeTimer?: number;
  private closeTimerStartTime?: number;
  private closeTimerRemainingTime?: number;

  constructor() {
    inject(RadianPortal).setContainer(this.context.list());

    effect(() => {
      if (this.context.isClosePaused()) {
        const elapsedTime =
          new Date().getTime() - (this.closeTimerStartTime ?? 0);

        this.closeTimerRemainingTime =
          (this.closeTimerRemainingTime ?? 0) - elapsedTime;
        window.clearTimeout(this.closeTimer);
        this.paused.emit();
      } else {
        this.startTimer(this.closeTimerRemainingTime ?? 0);
        this.resumed.emit();
      }
    });

    // start timer when toast opens or duration changes.
    // we include `open` in deps because closed !== unmounted when animating
    // so it could reopen before being completely unmounted
    effect(() => {
      const duration = this.duration() ?? this.context.duration();

      if (this.open() && !this.context.isClosePaused()) {
        this.startTimer(duration);
      }
    });

    const viewContainerRef = inject(ViewContainerRef);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const textContent = getAnnounceTextContent(this.elementRef.nativeElement);
      let announce: ComponentRef<RadianToastAnnounce> | undefined;
      let announceDestroyTimer: number | undefined;
      // render text content in the next frame to ensure toast is announced in NVDA
      const cleanupRafs = useNextFrame(() => {
        announce = viewContainerRef.createComponent(RadianToastAnnounce, {
          bindings: [
            inputBinding('type', this.type),
            inputBinding('text', () => textContent),
          ],
        });

        announceDestroyTimer = window.setTimeout(
          () => announce?.destroy(),
          1000,
        );
      });

      destroyRef.onDestroy(() => {
        cleanupRafs();
        window.clearTimeout(announceDestroyTimer);
        announce?.destroy();
      });
    });

    inject(RadianDismissibleLayer).escapeKeyDown.subscribe((e) => {
      this.escapeKeyDown.emit(e);

      if (e.defaultPrevented) {
        return;
      }

      if (!this.context.isFocusedToastEscapeKeyDown()) {
        this.close();
      }

      this.context.isFocusedToastEscapeKeyDown.set(false);
    });
  }

  protected keyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') {
      return;
    }

    this.escapeKeyDown.emit(event);

    if (!event.defaultPrevented) {
      this.context.isFocusedToastEscapeKeyDown.set(true);

      this.close();
    }
  }

  protected pointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    this.pointerStart = { x: event.clientX, y: event.clientY };
  }

  protected pointerMoved(event: PointerEvent) {
    if (!this.pointerStart) {
      return;
    }

    const x = event.clientX - this.pointerStart.x;
    const y = event.clientY - this.pointerStart.y;
    const hasSwipeMoveStarted = Boolean(this.swipeDelta);
    const isHorizontalSwipe = ['left', 'right'].includes(
      this.context.swipeDirection(),
    );
    const clamp = ['left', 'up'].includes(this.context.swipeDirection())
      ? Math.min
      : Math.max;
    const clampedX = isHorizontalSwipe ? clamp(0, x) : 0;
    const clampedY = !isHorizontalSwipe ? clamp(0, y) : 0;
    const moveStartBuffer = event.pointerType === 'touch' ? 10 : 2;
    const delta = { x: clampedX, y: clampedY };

    if (hasSwipeMoveStarted) {
      this.swipeDelta = delta;

      const swipeEvent = this.createSwipeEvent('swipemove', delta);

      this.swipeMoved.emit(swipeEvent);

      if (!swipeEvent.defaultPrevented) {
        const { x, y } = delta;

        this.elementRef.nativeElement.setAttribute('data-swipe', 'move');
        this.elementRef.nativeElement.style.setProperty(
          '--radian-toast-swipe-move-x',
          `${x}px`,
        );
        this.elementRef.nativeElement.style.setProperty(
          '--radian-toast-swipe-move-y',
          `${y}px`,
        );
      }
    } else if (
      isDeltaInDirection(delta, this.context.swipeDirection(), moveStartBuffer)
    ) {
      this.swipeDelta = delta;

      const swipeEvent = this.createSwipeEvent('swipestart', delta);

      this.swipeStarted.emit(swipeEvent);

      if (!swipeEvent.defaultPrevented) {
        this.elementRef.nativeElement.setAttribute('data-swipe', 'start');
      }

      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    } else if (Math.abs(x) > moveStartBuffer || Math.abs(y) > moveStartBuffer) {
      // User is swiping in wrong direction so we disable swipe gesture
      // for the current pointer down interaction
      this.pointerStart = undefined;
    }
  }

  protected pointerUp(event: PointerEvent) {
    const delta = this.swipeDelta;
    const target = event.target as HTMLElement;

    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    this.swipeDelta = undefined;
    this.pointerStart = undefined;

    if (delta) {
      const toast = event.currentTarget as HTMLElement;

      if (
        isDeltaInDirection(
          delta,
          this.context.swipeDirection(),
          this.context.swipeThreshold(),
        )
      ) {
        const swipeEvent = this.createSwipeEvent('swipeend', delta);

        this.swipeEnded.emit(swipeEvent);

        if (!swipeEvent.defaultPrevented) {
          const { x, y } = delta;

          this.elementRef.nativeElement.setAttribute('data-swipe', 'end');
          this.elementRef.nativeElement.style.removeProperty(
            '--radian-toast-swipe-move-x',
          );
          this.elementRef.nativeElement.style.removeProperty(
            '--radian-toast-swipe-move-y',
          );
          this.elementRef.nativeElement.style.setProperty(
            '--radian-toast-swipe-end-x',
            `${x}px`,
          );
          this.elementRef.nativeElement.style.setProperty(
            '--radian-toast-swipe-end-y',
            `${y}px`,
          );
        }
      } else {
        const swipeEvent = this.createSwipeEvent('swipecancel', delta);

        this.swipeCanceled.emit(swipeEvent);

        if (!swipeEvent.defaultPrevented) {
          this.elementRef.nativeElement.setAttribute('data-swipe', 'cancel');
          this.elementRef.nativeElement.style.removeProperty(
            '--radian-toast-swipe-move-x',
          );
          this.elementRef.nativeElement.style.removeProperty(
            '--radian-toast-swipe-move-y',
          );
          this.elementRef.nativeElement.style.removeProperty(
            '--radian-toast-swipe-end-x',
          );
          this.elementRef.nativeElement.style.removeProperty(
            '--radian-toast-swipe-end-y',
          );
        }
      }
      // Prevent click event from triggering on items within the toast when
      // pointer up is part of a swipe gesture
      toast.addEventListener('click', (event) => event.preventDefault(), {
        once: true,
      });
    }
  }

  private close() {
    // focus viewport if focus is within toast to read the remaining toast
    // count to SR users and ensure focus isn't lost
    const isFocusInToast = this.elementRef.nativeElement.contains(
      document.activeElement,
    );

    if (isFocusInToast) {
      this.context.list().nativeElement.focus();
    }

    this.openChange.emit(false);
  }

  private startTimer(duration: number) {
    if (!duration || duration === Infinity) {
      return;
    }

    window.clearTimeout(this.closeTimer);
    this.closeTimerStartTime = new Date().getTime();
    this.closeTimer = window.setTimeout(() => this.close(), duration);
  }

  private createSwipeEvent(name: string, delta: { x: number; y: number }) {
    return new CustomEvent(name, { detail: { delta }, cancelable: true });
  }

  private static contextFactory(): RadianToastContext {
    const toast = inject(RadianToast);

    return {
      close: () => toast.close(),
    };
  }
}

function getAnnounceTextContent(container: HTMLElement) {
  const textContent: string[] = [];
  const childNodes = Array.from(container.childNodes);

  childNodes.forEach((node) => {
    if (node.nodeType === node.TEXT_NODE && node.textContent)
      textContent.push(node.textContent);
    if (isHTMLElement(node)) {
      const isHidden =
        node.ariaHidden || node.hidden || node.style.display === 'none';
      const isExcluded = node.dataset['radianToastAnnounceExclude'] === '';

      if (!isHidden) {
        if (isExcluded) {
          const altText = node.dataset['radianToastAnnounceAlt'];
          if (altText) textContent.push(altText);
        } else {
          textContent.push(...getAnnounceTextContent(node));
        }
      }
    }
  });

  // We return a collection of text rather than a single concatenated string.
  // This allows SR VO to naturally pause break between nodes while announcing.
  return textContent;
}

function isHTMLElement(node: any): node is HTMLElement {
  return node.nodeType === node.ELEMENT_NODE;
}

function isDeltaInDirection(
  delta: { x: number; y: number },
  direction: RadianToasterSwipeDirection,
  threshold = 0,
) {
  const deltaX = Math.abs(delta.x);
  const deltaY = Math.abs(delta.y);
  const isDeltaX = deltaX > deltaY;
  if (direction === 'left' || direction === 'right') {
    return isDeltaX && deltaX > threshold;
  } else {
    return !isDeltaX && deltaY > threshold;
  }
}

function useNextFrame(callback: () => void) {
  let raf1 = 0;
  let raf2 = 0;

  raf1 = window.requestAnimationFrame(
    () => (raf2 = window.requestAnimationFrame(callback)),
  );

  return () => {
    window.cancelAnimationFrame(raf1);
    window.cancelAnimationFrame(raf2);
  };
}
