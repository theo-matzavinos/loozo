import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
} from '@angular/core';
import { RadianSwitchContext } from './switch-context';

@Directive({
  selector: '[radianSwitchInput]',
  host: {
    type: 'switch',
    'aria-hidden': 'true',
    tabindex: '-1',
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
export class RadianSwitchInput {
  protected context = inject(RadianSwitchContext);

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
