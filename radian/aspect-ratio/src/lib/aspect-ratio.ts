import { computed, Directive, input, numberAttribute } from '@angular/core';

@Directive({
  selector: '[radianAspectRatio]',
  exportAs: 'radianAspectRatio',
  host: {
    'data-radian-aspect-ratio': '',
    '[style]': `{
      position: 'relative',
      width: '100%',
      paddingBottom: paddingBottom(),
    }`,
  },
})
export class RadianAspectRatio {
  /** The desired ratio. */
  ratio = input(1 / 1, {
    transform: numberAttribute,
    alias: 'radianAspectRatio',
  });

  protected paddingBottom = computed(() => `${100 / this.ratio()}%`);
}
