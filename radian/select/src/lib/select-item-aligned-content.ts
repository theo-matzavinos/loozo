import { Directive } from '@angular/core';

@Directive({
  selector: '[radianSelectItemAlignedContent]',
  host: {
    // When we get the height of the content, it includes borders. If we were to set
    // the height without having "boxSizing: 'border-box'" it would be too big.
    // We need to ensure the content doesn't get taller than the wrapper
    '[style]': `{
      boxSizing: 'border-box',
      maxHeight: '100%',
    }`,
  },
})
export class RadianSelectItemAlignedContent {}
