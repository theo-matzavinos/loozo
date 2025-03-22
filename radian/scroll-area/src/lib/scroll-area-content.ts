import { Directive } from '@angular/core';

@Directive({
  selector: '[radianScrollAreaContent]',
  host: {
    'data-radian-scroll-area-content': '',
    '[style]': `{ minWidth: '100%', display: 'table' }`,
  },
})
export class RadianScrollAreaContent {}
