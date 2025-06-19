import { Directive, inject } from '@angular/core';
import { RadianSliderContext } from './slider-context';

@Directive({
  selector: '[radianSliderTrack]',
  host: {
    '[attr.data-disabled]': 'context.disabled() || null',
    '[attr.data-orientation]': 'context.orientation()',
  },
})
export class RadianSliderTrack {
  protected context = inject(RadianSliderContext);
}
