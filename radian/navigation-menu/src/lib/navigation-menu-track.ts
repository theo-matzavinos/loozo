import { Directive } from '@angular/core';

@Directive({
  selector: '[radianNavigationMenuTrack]',
  host: {
    '[style]': `{
      position: 'relative'
    }`,
  },
})
export class RadianNavigationMenuTrack {}
