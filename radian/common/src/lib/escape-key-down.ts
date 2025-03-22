import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  output,
} from '@angular/core';

@Directive({
  selector: '[radianEscapeKeyDown]',
  exportAs: 'radianEscapeKeyDown',
})
export class RadianEscapeKeyDown {
  escapeKeyDown = output<KeyboardEvent>({ alias: 'radianEscapeKeyDown' });

  constructor() {
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const ownerDocument =
        elementRef.nativeElement.ownerDocument ?? globalThis.document;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          this.escapeKeyDown.emit(event);
        }
      };

      ownerDocument.addEventListener('keydown', handleKeyDown, {
        capture: true,
      });
      destroyRef.onDestroy(() =>
        ownerDocument.removeEventListener('keydown', handleKeyDown, {
          capture: true,
        }),
      );
    });
  }
}
