import { computed, Directive, inject } from '@angular/core';
import { RadianPopperContentContext } from './popper-content-context';

@Directive({
  host: {
    '[attr.data-side]': 'context.placedSide()',
    '[attr.data-align]': 'context.placedAlign()',
    '[style]': 'style()',
  },
})
export class RadianPopperContent {
  protected context = inject(RadianPopperContentContext);

  protected style = computed(() => ({
    animation: !this.context.isPositioned() ? 'none' : '',
  }));
}
