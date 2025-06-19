import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { RadianDismissibleLayersGlobalContext } from './dismissible-layer';

@Directive({
  selector: '[radianDismissibleLayerBranch]',
})
export class RadianDismissibleLayerBranch {
  constructor() {
    const dismissibleLayersContext = inject(
      RadianDismissibleLayersGlobalContext,
    );
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    dismissibleLayersContext.branches.update((v) => [
      ...v,
      elementRef.nativeElement,
    ]);

    inject(DestroyRef).onDestroy(() =>
      dismissibleLayersContext.branches.update((v) =>
        v.filter((i) => i !== elementRef.nativeElement),
      ),
    );
  }
}
