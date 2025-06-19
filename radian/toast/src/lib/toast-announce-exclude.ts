import { Directive, input } from '@angular/core';

@Directive({
  selector: '[radianToastAnnounceExclude]',
  host: {
    'data-radian-toast-announce-exclude': '',
    '[data.radian-toast-announce-alt]': 'altText() || null',
  },
})
export class RadianToastAnnounceExclude {
  altText = input<string>();
}
