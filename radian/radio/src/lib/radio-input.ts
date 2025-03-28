import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
} from '@angular/core';
import { RadianRadioContext } from './radio';

@Directive({
  selector: 'input[radianRadioInput]',
  host: {
    type: 'radio',
    'aria-hidden': 'true',
    tabindex: '-1',
    'data-radian-radio-input': '',
    '[attr.name]': 'context.name() || null',
    '[value]': 'context.value()',
    '[required]': 'context.required() || null',
    '[attr.checked]': 'context.checked()',
    '[disabled]': 'context.disabled()',
    '[attr.form]': 'context.form() || null',
    '[style]': `{
      position: 'absolute',
      pointerEvents: 'none',
      opacity: 0,
      margin: 0,
      inset: 0,
      transform: 'translateX(-100%)',
    }`,
  },
})
export class RadianRadioInput {
  protected context = inject(RadianRadioContext);

  constructor() {
    const elementRef = inject<ElementRef<HTMLInputElement>>(ElementRef);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const mutationObserver = new MutationObserver(() => {
        elementRef.nativeElement.dispatchEvent(
          new Event('click', { bubbles: true }),
        );
      });
      mutationObserver.observe(elementRef.nativeElement, {
        attributes: true,
        attributeFilter: ['checked'],
      });

      destroyRef.onDestroy(() => mutationObserver.disconnect());
    });
  }
}
