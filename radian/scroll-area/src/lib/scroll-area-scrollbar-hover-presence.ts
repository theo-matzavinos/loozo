import { DestroyRef, Directive, inject } from '@angular/core';
import { RadianScrollAreaContext } from './scroll-area-context';
import { provideRadianPresenceContext } from '../../../common/src';
import { RadianScrollAreaScrollbarAutoPresence } from './scroll-area-scrollbar-auto-presence';

@Directive({
  selector: '[radianScrollAreaScrollbarHoverPresence]',
  providers: [
    provideRadianPresenceContext(() => ({
      present: inject(RadianScrollAreaScrollbarHoverPresence).visible,
    })),
  ],
  host: {
    '[attr.data-state]': 'visible() ? "visible" : "hidden"',
  },
})
export class RadianScrollAreaScrollbarHoverPresence extends RadianScrollAreaScrollbarAutoPresence {
  constructor() {
    super();
    const context = inject(RadianScrollAreaContext);
    const scrollArea = context.scrollArea;
    let hideTimer = 0;

    const handlePointerEnter = () => {
      window.clearTimeout(hideTimer);
      this.visible.set(true);
    };
    const handlePointerLeave = () => {
      hideTimer = window.setTimeout(
        () => this.visible.set(false),
        context.scrollHideDelay(),
      );
    };
    scrollArea.nativeElement.addEventListener(
      'pointerenter',
      handlePointerEnter,
    );
    scrollArea.nativeElement.addEventListener(
      'pointerleave',
      handlePointerLeave,
    );

    inject(DestroyRef).onDestroy(() => {
      window.clearTimeout(hideTimer);
      scrollArea.nativeElement.removeEventListener(
        'pointerenter',
        handlePointerEnter,
      );
      scrollArea.nativeElement.removeEventListener(
        'pointerleave',
        handlePointerLeave,
      );
    });
  }
}
