import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
} from '@angular/core';
import { RadianSliderThumbContext } from './slider-thumb-context';

@Directive({
  selector: '[radianSliderThumbInput]',
  host: {
    /**
     * We purposefully do not use `type="hidden"` here otherwise forms that
     * wrap it will not be able to access its value via the FormData API.
     * */
    '[style]': `{ display: 'none' }`,
    '[value]': 'context.value()',
    '[name]': 'context.name()',
    '[formTarget]': 'context.form()',
  },
})
export class RadianSliderThumbInput {
  protected context = inject(RadianSliderThumbContext);

  constructor() {
    const elementRef = inject<ElementRef<HTMLInputElement>>(ElementRef);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const mutationObserver = new MutationObserver(() => {
        elementRef.nativeElement.dispatchEvent(
          new Event('input', { bubbles: true }),
        );
      });
      mutationObserver.observe(elementRef.nativeElement, {
        attributes: true,
        attributeFilter: ['value'],
      });

      destroyRef.onDestroy(() => mutationObserver.disconnect());
    });
  }
}
