import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  output,
} from '@angular/core';

@Directive({
  selector: '[radianPointerDownOutside]',
})
export class RadianPointerDownOutside {
  /** Emits when a `pointerdown` event happens outside of the `RadianPointerDownOutside`. */
  pointerDownOutside = output<PointerEvent>({
    alias: 'radianPointerDownOutside',
  });

  constructor() {
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    const destroyRef = inject(DestroyRef);
    let isPointerInside = false;

    afterNextRender(() => {
      const ownerDocument =
        elementRef.nativeElement.ownerDocument ?? globalThis.document;
      const clickHandlerFactory = (e: PointerEvent) => () =>
        this.pointerDownOutside.emit(e);
      let clickHandler: () => void | undefined;
      const pointerDownHandler = (event: PointerEvent) => {
        if (event.target && !isPointerInside) {
          /**
           * On touch devices, we need to wait for a click event because browsers implement
           * a ~350ms delay between the time the user stops touching the display and when the
           * browser executres events. We need to ensure we don't reactivate pointer-events within
           * this timeframe otherwise the browser may execute events that should have been prevented.
           *
           * Additionally, this also lets us deal automatically with cancellations when a click event
           * isn't raised because the page was considered scrolled/drag-scrolled, long-pressed, etc.
           *
           * This is why we also continuously remove the previous listener, because we cannot be
           * certain that it was raised, and therefore cleaned-up.
           */
          if (event.pointerType === 'touch') {
            ownerDocument.removeEventListener('click', clickHandler);
            clickHandler = clickHandlerFactory(event);
            ownerDocument.addEventListener('click', clickHandler, {
              once: true,
            });
          } else {
            this.pointerDownOutside.emit(event);
          }
        } else {
          // We need to remove the event listener in case the outside click has been canceled.
          // See: https://github.com/radix-ui/primitives/issues/2171
          ownerDocument.removeEventListener('click', clickHandler);
        }
        isPointerInside = false;
      };
      /**
       * if this directive executes in a component that mounts via a `pointerdown` event, the event
       * would bubble up to the document and trigger a `pointerDownOutside` event. We avoid
       * this by delaying the event listener registration on the document.
       * This is not Angular specific, but rather how the DOM works, ie:
       * ```
       * button.addEventListener('pointerdown', () => {
       *   console.log('I will log');
       *   document.addEventListener('pointerdown', () => {
       *     console.log('I will also log');
       *   })
       * });
       */
      const timerId = window.setTimeout(() => {
        ownerDocument.addEventListener('pointerdown', pointerDownHandler);
      }, 0);
      const pointerDownCaptureHandler = () => (isPointerInside = true);

      elementRef.nativeElement.addEventListener(
        'pointerdown',
        pointerDownCaptureHandler,
        { capture: true },
      );

      destroyRef.onDestroy(() => {
        window.clearTimeout(timerId);
        ownerDocument.removeEventListener('pointerdown', pointerDownHandler);
        ownerDocument.removeEventListener('click', clickHandler);
        elementRef.nativeElement.removeEventListener(
          'pointerdown',
          pointerDownCaptureHandler,
          { capture: true },
        );
      });
    });
  }
}
