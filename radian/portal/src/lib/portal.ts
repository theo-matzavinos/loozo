import {
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';

@Directive({
  selector: '[radianPortal]',
})
export class RadianPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement> | HTMLElement>();

  constructor() {
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    const container = computed(() => {
      const override = this.container();

      if (!override) {
        return document.body;
      }

      if (override instanceof ElementRef) {
        return override.nativeElement;
      }

      return override;
    });

    // Anchor used to save the element's previous position so
    // that we can restore it when the portal is detached.
    const anchorNode = document.createComment('radian-portal');

    elementRef.nativeElement.parentNode?.insertBefore(
      anchorNode,
      elementRef.nativeElement,
    );
    container().appendChild(elementRef.nativeElement);

    inject(DestroyRef).onDestroy(() => {
      anchorNode.parentNode?.replaceChild(elementRef.nativeElement, anchorNode);
    });
  }
}
