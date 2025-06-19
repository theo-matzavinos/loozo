import { computed, Directive, inject, input, Signal } from '@angular/core';
import { RadianEnum } from './enum';

export const Direction = {
  LeftToRight: 'ltr',
  RightToLeft: 'rtl',
} as const;

export type Direction = RadianEnum<typeof Direction>;

@Directive({
  selector: '[radianDirection]',
  exportAs: 'radianDirection',
  host: {
    '[attr.dir]': 'value()',
  },
})
export class RadianDirection {
  input = input<Direction>(undefined, {
    alias: 'radianDirection',
  });

  private parent = inject(RadianDirection, { skipSelf: true, optional: true });

  value: Signal<Direction> = computed(
    () => this.input() ?? this.parent?.value() ?? Direction.LeftToRight,
  );
}
