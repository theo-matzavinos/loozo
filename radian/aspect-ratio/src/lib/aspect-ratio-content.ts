import { Directive } from '@angular/core';

@Directive({
  selector: '[radianAspectRatioContent]',
  host: {
    'data-radian-aspect-ratio-content': '',
    '[style]': `{
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }`,
  },
})
export class RadianAspectRatioContent {}
