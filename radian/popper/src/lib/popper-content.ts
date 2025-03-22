import { computed, Directive, inject } from '@angular/core';
import { RadianPopperPanel } from './popper-panel';

@Directive({
  host: {
    '[attr.data-side]': 'popperPanel.placedside()',
    '[attr.data-align]': 'popperPanel.placedAlign()',
    '[style]': 'style()',
  },
})
export class RadianPopperContent {
  protected popperPanel = inject(RadianPopperPanel);

  protected style = computed(() => ({
    animation: !this.popperPanel.isPositioned() ? 'none' : '',
  }));
}
