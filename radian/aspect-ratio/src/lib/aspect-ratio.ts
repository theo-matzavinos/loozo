import { computed, Directive, input, numberAttribute } from '@angular/core';

@Directive({
  selector: '[radianAspectRatio]',
  host: {
    '[style]': 'style()',
  },
})
export class RadianAspectRatio {
  /** The desired ratio. */
  ratio = input(1 / 1, {
    transform: numberAttribute,
  });

  protected style = computed(() => ({
    position: 'relative',
    width: '100%',
    'padding-bottom': `${100 / this.ratio()}%`,
  }));
}
