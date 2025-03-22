import { Directive, inject } from '@angular/core';
import { RadianSliderContext } from './slider';

@Directive({
  selector: '[radianSliderTrack]',
  host: {
    'data-radian-slider-track': '',
    '[attr.data-disabled]': 'context.disabled() || null',
    '[attr.data-orientation]': 'context.orientation()',
  },
})
export class RadianSliderTrack {
  protected context = inject(RadianSliderContext);
}
