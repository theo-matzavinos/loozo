import { Directive, effect, inject } from '@angular/core';
import { RadianSelectScrollButton } from './select-scroll-button';
import { RadianSelectContentContext } from './select-content-context';

@Directive({
  selector: '[radianSelectScrollUpButton]',
  hostDirectives: [RadianSelectScrollButton],
})
export class RadianSelectScrollUpButton {
  private contentContext = inject(RadianSelectContentContext);

  constructor() {
    const handleScroll = () => {
      this.contentContext.canScrollUp.set(
        this.contentContext.viewport().nativeElement.scrollTop > 0,
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
        viewport.scrollTop = viewport.scrollTop - selectedItem.offsetHeight;
      }
    });
  }
}
