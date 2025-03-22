import { afterNextRender, Directive, inject } from '@angular/core';
import { RadianScrollArea } from './scroll-area';

const radianScrollAreaStylesId = 'radian-scroll-area-styles';

@Directive({
  selector: '[radianScrollAreaViewport]',
  host: {
    'data-radian-scroll-area-viewport': '',
    /**
     * We don't support `visible` because the intention is to have at least one scrollbar
     * if this component is used and `visible` will behave like `auto` in that case
     * https://developer.mozilla.org/en-US/docs/Web/CSS/overflow#description
     *
     * We don't handle `auto` because the intention is for the native implementation
     * to be hidden if using this component. We just want to ensure the node is scrollable
     * so could have used either `scroll` or `auto` here. We picked `scroll` to prevent
     * the browser from having to work out whether to render native scrollbars or not,
     * we tell it to with the intention of hiding them in CSS.
     */
    '[style]': `{
      overflowX: context.scrollbarXEnabled ? 'scroll' : 'hidden',
      overflowY: context.scrollbarYEnabled ? 'scroll' : 'hidden',
    }`,
  },
})
export class RadianScrollAreaViewport {
  constructor() {
    const scrollArea = inject(RadianScrollArea);

    afterNextRender(() => {
      if (document.getElementById(radianScrollAreaStylesId)) {
        return;
      }

      const styles = document.createElement('style');

      styles.id = radianScrollAreaStylesId;
      styles.nonce = scrollArea.nonce();
      document.head.appendChild(styles);
      /* Hide scrollbars cross-browser and enable momentum scroll for touch devices */
      styles.textContent = `[data-radian-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radian-scroll-area-viewport]::-webkit-scrollbar{display:none}`;
    });
  }
}
