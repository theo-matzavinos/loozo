import { Directive, inject } from '@angular/core';
import { RadianPopperPanel } from './popper-panel';

@Directive({
  host: {
    '[attr.data-side]': 'popperPanel.placedside()',
    '[attr.data-align]': 'popperPanel.placedAlign()',
    '[style]': `{ animation: !popperPanel.isPositioned() ? 'none' : '' }`,
  },
})
export class RadianPopperContent {
  protected popperPanel = inject(RadianPopperPanel);
}
