import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  linkedSignal,
} from '@angular/core';

@Directive({
  selector: '[radianPortal]',
})
export class RadianPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement>>();

  private _computedContainer = linkedSignal(this.container);
  computedContainer = this._computedContainer;

  constructor() {
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const container =
        this.computedContainer()?.nativeElement ?? document.body;

      // Anchor used to save the element's previous position so
      // that we can restore it when the portal is detached.
      const anchorNode = document.createComment('radian-portal');

      elementRef.nativeElement.parentNode?.insertBefore(
        anchorNode,
        elementRef.nativeElement,
      );
      container.appendChild(elementRef.nativeElement);

      destroyRef.onDestroy(() => {
        if (elementRef.nativeElement.parentNode) {
          anchorNode.parentNode?.replaceChild(
            elementRef.nativeElement,
            anchorNode,
          );
        } else {
          anchorNode.remove();
        }
      });
    });
  }

  setContainer(container: ElementRef<HTMLElement>) {
    this._computedContainer.set(container);
  }
}
