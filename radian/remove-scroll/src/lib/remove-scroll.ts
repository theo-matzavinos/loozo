import {
  afterNextRender,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Provider,
  Signal,
  signal,
} from '@angular/core';
import { Axis } from './types';
import { uniqueId } from '@loozo/radian/common';

let lockStack: RadianRemoveScroll[] = [];

export type RadianRemoveScrollContext = {
  /**
   * disables "event isolation" (suppressing of events happening outside of the Lock)
   * @default false
   */
  noIsolation?: boolean;
  /**
   * enabled complete Lock isolation using `pointer-events:none` for anything outside the Lock
   * you probably don't need it, except you do
   * @default false
   */
  inert?: boolean;
  /**
   * allows pinch-zoom, however might work not perfectly for normal scroll
   */
  allowPinchZoom?: boolean;

  /**
   * switches on/off the behavior of the component
   */
  enabled: Signal<boolean>;

  /**
   * array of refs to other Elements, which should be considered as a part of the Lock
   */
  shards?: Signal<Array<ElementRef<HTMLElement>>>;
};

export const RadianRemoveScrollContext =
  new InjectionToken<RadianRemoveScrollContext>(
    '[Radian] Remove Scroll Context',
  );

export function provideRadianRemoveScrollContext(
  factory: () => RadianRemoveScrollContext,
): Provider {
  return {
    provide: RadianRemoveScrollContext,
    useFactory: factory,
  };
}

@Directive({
  selector: '[radianRemoveScroll]',
})
export class RadianRemoveScroll {
  constructor() {
    const context = inject(RadianRemoveScrollContext);
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    const destroyRef = inject(DestroyRef);
    const id = uniqueId('readian-remove-scroll');
    const touchStart = signal<ReturnType<RadianRemoveScroll['getTouchXY']>>([
      0, 0,
    ]);
    let activeAxis: Axis | undefined;
    let shouldPreventQueue: Array<{
      name: string;
      delta: number[];
      target: HTMLElement;
      should: boolean;
      shadowParent: HTMLElement | null;
    }> = [];

    const shouldCancelEvent = (
      event: WheelEvent | TouchEvent,
      parent: HTMLElement,
    ) => {
      if (
        ('touches' in event && event.touches.length === 2) ||
        (event.type === 'wheel' && event.ctrlKey)
      ) {
        return !context.allowPinchZoom;
      }

      const touch = this.getTouchXY(event);
      const deltaX =
        'deltaX' in event ? event.deltaX : touchStart()[0] - touch[0];
      const deltaY =
        'deltaY' in event ? event.deltaY : touchStart()[1] - touch[1];

      let currentAxis: Axis | undefined;
      const target = event.target as unknown as HTMLElement;

      const moveDirection: Axis =
        Math.abs(deltaX) > Math.abs(deltaY) ? 'h' : 'v';

      // allow horizontal touch move on Range inputs. They will not cause any scroll
      if (
        'touches' in event &&
        moveDirection === 'h' &&
        (target as HTMLInputElement).type === 'range'
      ) {
        return false;
      }

      let canBeScrolledInMainDirection = this.locationCouldBeScrolled(
        moveDirection,
        target,
      );

      if (!canBeScrolledInMainDirection) {
        return true;
      }

      if (canBeScrolledInMainDirection) {
        currentAxis = moveDirection;
      } else {
        currentAxis = moveDirection === 'v' ? 'h' : 'v';
        canBeScrolledInMainDirection = this.locationCouldBeScrolled(
          moveDirection,
          target,
        );
        // other axis might be not scrollable
      }

      if (!canBeScrolledInMainDirection) {
        return false;
      }

      if (!activeAxis && 'changedTouches' in event && (deltaX || deltaY)) {
        activeAxis = currentAxis;
      }

      if (!currentAxis) {
        return true;
      }

      const cancelingAxis = activeAxis || currentAxis;

      return this.handleScroll(
        cancelingAxis,
        parent,
        event,
        cancelingAxis === 'h' ? deltaX : deltaY,
        true,
      );
    };

    const shouldPrevent = (event: WheelEvent | TouchEvent) => {
      if (!lockStack.length || lockStack[lockStack.length - 1] !== this) {
        // not the last active
        return;
      }

      const delta =
        'deltaY' in event ? this.getDeltaXY(event) : this.getTouchXY(event);
      const sourceEvent = shouldPreventQueue.filter(
        (e) =>
          e.name === event.type &&
          (e.target === event.target || event.target === e.shadowParent) &&
          this.deltaCompare(e.delta, delta),
      )[0];

      // self event, and should be canceled
      if (sourceEvent && sourceEvent.should) {
        if (event.cancelable) {
          event.preventDefault();
        }

        return;
      }

      // outside or shard event
      if (!sourceEvent) {
        const shardNodes = (context.shards?.() || []).filter((node) =>
          node.nativeElement.contains(event.target as HTMLElement),
        );

        const shouldStop =
          shardNodes.length > 0
            ? shouldCancelEvent(event, shardNodes[0].nativeElement)
            : !context.noIsolation;

        if (shouldStop) {
          if (event.cancelable) {
            event.preventDefault();
          }
        }
      }
    };

    const shouldCancel = (
      name: string,
      delta: number[],
      target: HTMLElement,
      should: boolean,
    ) => {
      const event = {
        name,
        delta,
        target,
        should,
        shadowParent: this.getOutermostShadowParent(target),
      };
      shouldPreventQueue.push(event);

      setTimeout(() => {
        shouldPreventQueue = shouldPreventQueue.filter((e) => e !== event);
      }, 1);
    };
    const scrollTouchStart = (event: TouchEvent) => {
      touchStart.set(this.getTouchXY(event));
      activeAxis = undefined;
    };

    const scrollWheel = (event: Event) => {
      shouldCancel(
        event.type,
        this.getDeltaXY(event as WheelEvent),
        event.target as HTMLElement,
        shouldCancelEvent(event as WheelEvent, elementRef.nativeElement),
      );
    };

    const scrollTouchMove = (event: TouchEvent) => {
      shouldCancel(
        event.type,
        this.getTouchXY(event),
        event.target as HTMLElement,
        shouldCancelEvent(event, elementRef.nativeElement),
      );
    };

    lockStack.push(this);

    destroyRef.onDestroy(() => {
      lockStack = lockStack.filter((v) => v !== this);
    });

    afterNextRender(() => {
      const styleElement = document.createElement('style');

      styleElement.textContent = `
      .block-interactivity-${id} {pointer-events: none;}
      .allow-interactivity-${id} {pointer-events: all;}
    `;
      document.head.appendChild(styleElement);
      document.addEventListener('wheel', shouldPrevent, { passive: false });
      document.addEventListener('touchmove', shouldPrevent, { passive: false });
      document.addEventListener('touchstart', scrollTouchStart, {
        passive: false,
      });

      elementRef.nativeElement.addEventListener('wheel', scrollWheel, {
        capture: true,
      });
      elementRef.nativeElement.addEventListener('scroll', scrollWheel, {
        capture: true,
      });
      elementRef.nativeElement.addEventListener('touchmove', scrollTouchMove, {
        capture: true,
      });

      destroyRef.onDestroy(() => {
        styleElement.remove();
        document.removeEventListener('wheel', shouldPrevent);
        document.removeEventListener('touchmove', shouldPrevent);
        document.removeEventListener('touchstart', scrollTouchStart);
        elementRef.nativeElement.removeEventListener('wheel', scrollWheel, {
          capture: true,
        });
        elementRef.nativeElement.removeEventListener('scroll', scrollWheel, {
          capture: true,
        });
        elementRef.nativeElement.removeEventListener(
          'touchmove',
          scrollTouchMove,
          { capture: true },
        );
      });
    });

    effect(() => {
      if (context.inert) {
        document.body.classList.add(`block-interactivity-${id}`);

        const allow = [elementRef, ...(context.shards?.() || [])].filter(
          Boolean,
        );

        allow.forEach((el) =>
          el.nativeElement.classList.add(`allow-interactivity-${id}`),
        );

        return () => {
          document.body.classList.remove(`block-interactivity-${id}`);
          allow.forEach((el) =>
            el.nativeElement.classList.remove(`allow-interactivity-${id}`),
          );
        };
      }

      return;
    });
  }

  private getTouchXY(event: TouchEvent | WheelEvent): [number, number] {
    return 'changedTouches' in event
      ? [event.changedTouches[0].clientX, event.changedTouches[0].clientY]
      : [0, 0];
  }

  private locationCouldBeScrolled(axis: Axis, node: HTMLElement): boolean {
    const ownerDocument = node.ownerDocument;
    let current = node;

    do {
      // Skip over shadow root
      if (typeof ShadowRoot !== 'undefined' && current instanceof ShadowRoot) {
        current = current.host as HTMLElement;
      }

      const isScrollable = this.elementCanBeScrolled(current, axis);

      if (isScrollable) {
        const [, scrollHeight, clientHeight] = this.getScrollVariables(
          axis,
          current,
        );

        if (scrollHeight > clientHeight) {
          return true;
        }
      }

      current = current.parentNode as HTMLElement;
    } while (current && current !== ownerDocument.body);

    return false;
  }

  private handleScroll = (
    axis: Axis,
    endTarget: HTMLElement,
    event: WheelEvent | TouchEvent,
    sourceDelta: number,
    noOverscroll: boolean,
  ) => {
    const directionFactor = this.getDirectionFactor(
      axis,
      window.getComputedStyle(endTarget).direction,
    );
    const delta = directionFactor * sourceDelta;

    // find scrollable target
    let target = event.target as HTMLElement;
    const targetInLock = endTarget.contains(target);

    let shouldCancelScroll = false;
    const isDeltaPositive = delta > 0;

    let availableScroll = 0;
    let availableScrollTop = 0;

    do {
      const [position, scroll, capacity] = this.getScrollVariables(
        axis,
        target,
      );

      const elementScroll = scroll - capacity - directionFactor * position;

      if (position || elementScroll) {
        if (this.elementCanBeScrolled(target, axis)) {
          availableScroll += elementScroll;
          availableScrollTop += position;
        }
      }

      if (target instanceof ShadowRoot) {
        target = target.host as HTMLElement;
      } else {
        target = target.parentNode as HTMLElement;
      }
    } while (
      // portaled content
      (!targetInLock && target !== document.body) ||
      // self content
      (targetInLock && (endTarget.contains(target) || endTarget === target))
    );

    // handle epsilon around 0 (non standard zoom levels)
    if (
      isDeltaPositive &&
      ((noOverscroll && Math.abs(availableScroll) < 1) ||
        (!noOverscroll && delta > availableScroll))
    ) {
      shouldCancelScroll = true;
    } else if (
      !isDeltaPositive &&
      ((noOverscroll && Math.abs(availableScrollTop) < 1) ||
        (!noOverscroll && -delta > availableScrollTop))
    ) {
      shouldCancelScroll = true;
    }

    return shouldCancelScroll;
  };

  private elementCanBeScrolled = (node: Element, axis: Axis): boolean => {
    const overflow = axis === 'v' ? 'overflowY' : 'overflowX';

    if (!(node instanceof Element)) {
      return false;
    }

    const styles = window.getComputedStyle(node);

    return (
      // not-not-scrollable
      styles[overflow] !== 'hidden' &&
      // contains scroll inside self
      !(
        styles.overflowY === styles.overflowX &&
        // textarea will always _contain_ scroll inside self. It only can be hidden
        node.tagName !== 'TEXTAREA' &&
        styles[overflow] === 'visible'
      )
    );
  };

  private getScrollVariables(axis: Axis, node: HTMLElement) {
    return axis === 'v'
      ? [node.scrollTop, node.scrollHeight, node.clientHeight]
      : [node.scrollLeft, node.scrollWidth, node.clientWidth];
  }

  private getOutermostShadowParent(node: Node | null): HTMLElement | null {
    let shadowParent: HTMLElement | null = null;
    while (node !== null) {
      if (node instanceof ShadowRoot) {
        shadowParent = node.host as HTMLElement;
        node = node.host;
      }
      node = node.parentNode;
    }
    return shadowParent;
  }

  private getDeltaXY(event: WheelEvent) {
    return [event.deltaX, event.deltaY];
  }

  private deltaCompare(x: number[], y: number[]) {
    return x[0] === y[0] && x[1] === y[1];
  }

  /**
   * If the element's direction is rtl (right-to-left), then scrollLeft is 0 when the scrollbar is at its rightmost position,
   * and then increasingly negative as you scroll towards the end of the content.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollLeft
   */
  private getDirectionFactor(axis: Axis, direction: string | null) {
    return axis === 'h' && direction === 'rtl' ? -1 : 1;
  }
}
