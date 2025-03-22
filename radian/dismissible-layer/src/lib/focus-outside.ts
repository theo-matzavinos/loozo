import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  output,
} from '@angular/core';

@Directive({
  selector: '[radianFocusOutside]',
})
export class RadianFocusOutside {
  focusOutside = output<FocusEvent>({ alias: 'radianFocusOutside' });

  constructor() {
    let isFocusInside = false;
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const focusCaptureHandler = () => (isFocusInside = true);
      const blurCaptureHandler = () => (isFocusInside = false);
      const ownerDocument =
        elementRef.nativeElement.ownerDocument ?? globalThis.document;
      const focusInHandler = (event: FocusEvent) => {
        if (event.target && !isFocusInside) {
          this.focusOutside.emit(event);
        }
      };

      elementRef.nativeElement.addEventListener('focus', focusCaptureHandler, {
        capture: true,
      });
      elementRef.nativeElement.addEventListener('blur', blurCaptureHandler, {
        capture: true,
      });
      ownerDocument.addEventListener('focusin', focusInHandler);

      destroyRef.onDestroy(() => {
        elementRef.nativeElement.removeEventListener(
          'focus',
          focusCaptureHandler,
          {
            capture: true,
          },
        );
        elementRef.nativeElement.removeEventListener(
          'blur',
          blurCaptureHandler,
          {
            capture: true,
          },
        );
        ownerDocument.removeEventListener('focusin', focusInHandler);
      });
    });
  }
}
