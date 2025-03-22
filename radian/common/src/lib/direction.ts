import { computed, Directive, inject, input, Signal } from '@angular/core';
import { RadianEnum } from './enum';

export const RadianDirectionality = {
  LeftToRight: 'ltr',
  RightToLeft: 'rtl',
} as const;

export type RadianDirectionality = RadianEnum<typeof RadianDirectionality>;

@Directive({
  selector: '[radianDirection]',
  exportAs: 'radianDirection',
  host: {
    '[attr.dir]': 'value()',
  },
})
export class RadianDirection {
  input = input<RadianDirectionality>(undefined, {
    alias: 'radianDirection',
  });

  private parent = inject(RadianDirection, { skipSelf: true, optional: true });

  value: Signal<RadianDirectionality> = computed(
    () =>
      this.input() ?? this.parent?.value() ?? RadianDirectionality.LeftToRight,
  );
}
