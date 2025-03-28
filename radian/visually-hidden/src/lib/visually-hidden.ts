import { Directive } from '@angular/core';

@Directive({
  selector: '[radianVisuallyHidden]',
  host: {
    'data-radian-visually-hidden': '',
    '[style]': `{
      position: 'absolute',
      border: 0,
      width: 1,
      height: 1,
      padding: 0,
      margin: -1,
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      wordWrap: 'normal',
    }`,
  },
})
export class RadianVisuallyHidden {}
