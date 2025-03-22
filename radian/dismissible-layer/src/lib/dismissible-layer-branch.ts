import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { RadianDismissibleLayersContext } from './dismissible-layer';

@Directive({
  selector: '[radianDismissibleLayerBranch]',
  host: {
    'data-radian-dismissible-layer-branch': '',
  },
})
export class RadianDismissibleLayerBranch {
  constructor() {
    const dismissibleLayersContext = inject(RadianDismissibleLayersContext);
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
