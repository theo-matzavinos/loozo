import {
  afterNextRender,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { RadianSelectViewportContext } from './select-viewport-context';
import { CONTENT_MARGIN } from './select-content-context';

const styleElementId = 'radian-select-viewport-styles';

@Directive({
  selector: '[radianSelectViewport]',
  host: {
    'data-radian-select-viewport': '',
    // we use position: 'relative' here on the `viewport` so that when we call
    // `selectedItem.offsetTop` in calculations, the offset is relative to the viewport
    // (independent of the scrollUpButton).
    // Viewport should only be scrollable in the vertical direction.
    // This won't work in vertical writing modes, so we'll need to
    // revisit this if/when that is supported
    // https://developer.chrome.com/blog/vertical-form-controls
    '[style]': `{
      position: 'relative',
      flex: 1,
      overflow: 'hidden auto',
    }`,
    '(scroll)': 'scrolled($event)',
  },
})
export class RadianSelectViewport {
  nonce = input<string>();

  private viewportContext = inject(RadianSelectViewportContext, {
    optional: true,
  });

  constructor() {
    afterNextRender(() => {
      if (document.getElementById(styleElementId)) {
        return;
      }

      const style = document.createElement('style');

      style.id = styleElementId;
      style.nonce = this.nonce();
      style.textContent =
        '[data-radian-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radian-select-viewport]::-webkit-scrollbar{display:none}';
    });

    if (!this.viewportContext) {
      return;
    }

    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    let prevScrollTop = 0;

    afterNextRender(() => {
      elementRef.nativeElement.addEventListener(
        'scroll',
        () => {
          const { contentWrapper, shouldExpandOnScroll } =
            this.viewportContext!;
          if (shouldExpandOnScroll() && contentWrapper) {
            const scrolledBy = Math.abs(
              prevScrollTop - elementRef.nativeElement.scrollTop,
            );
            if (scrolledBy > 0) {
              const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
              const cssMinHeight = parseFloat(
                contentWrapper.nativeElement.style.minHeight,
              );
              const cssHeight = parseFloat(
                contentWrapper.nativeElement.style.height,
              );
              const prevHeight = Math.max(cssMinHeight, cssHeight);

              if (prevHeight < availableHeight) {
                const nextHeight = prevHeight + scrolledBy;
                const clampedNextHeight = Math.min(availableHeight, nextHeight);
                const heightDiff = nextHeight - clampedNextHeight;

                contentWrapper.nativeElement.style.height =
                  clampedNextHeight + 'px';
                if (contentWrapper.nativeElement.style.bottom === '0px') {
                  elementRef.nativeElement.scrollTop =
                    heightDiff > 0 ? heightDiff : 0;
                  // ensure the content stays pinned to the bottom
                  contentWrapper.nativeElement.style.justifyContent =
                    'flex-end';
                }
              }
            }
          }
          prevScrollTop = elementRef.nativeElement.scrollTop;
        },
        { passive: true },
      );
    });
  }
}
