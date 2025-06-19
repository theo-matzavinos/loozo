import { Directive, effect, inject } from '@angular/core';
import { RadianSelectScrollButton } from './select-scroll-button';
import { RadianSelectContentContext } from './select-content-context';

@Directive({
  selector: '[radianSelectScrollDownButton]',
  hostDirectives: [RadianSelectScrollButton],
})
export class RadianSelectScrollDownButton {
  private contentContext = inject(RadianSelectContentContext);

  constructor() {
    const handleScroll = () => {
      const viewport = this.contentContext.viewport().nativeElement;
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;

      // we use Math.ceil here because if the UI is zoomed-in
      // `scrollTop` is not always reported as an integer
      this.contentContext.canScrollDown.set(
        Math.ceil(viewport.scrollTop) < maxScroll,
      );
    };

    effect((onCleanup) => {
      if (!this.contentContext.isPositioned()) {
        return;
      }

      const viewport = this.contentContext.viewport().nativeElement;

      handleScroll();
      viewport.addEventListener('scroll', handleScroll);

      onCleanup(() => viewport.removeEventListener('scroll', handleScroll));
    });

    inject(RadianSelectScrollButton).autoScroll.subscribe(() => {
      const viewport = this.contentContext.viewport().nativeElement;
      const selectedItem = this.contentContext.selectedItem()?.nativeElement;

      if (viewport && selectedItem) {
        viewport.scrollTop = viewport.scrollTop + selectedItem.offsetHeight;
      }
    });
  }
}
